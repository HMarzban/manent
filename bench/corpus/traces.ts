// The public editing traces: where each is published under its locked hash, reading one, and
// replaying its plain-text patches into a script document.
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createDoc, scriptBody } from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { createRng, seededIdSource } from "@manent/demo";
import type { BlockJSON, IdSource } from "@manent/schema";
import { isRecord } from "../budgets.ts";
import LOCK from "./traces.lock.json";

const DATASET = "https://github.com/josephg/editing-traces";
/** The most bytes a download may hold; the largest locked trace holds about 0.7 MB. */
const TRACE_LIMIT_BYTES = 4_000_000;
/** The most bytes a trace's JSON may hold once unzipped; the largest locked trace holds about 8.6 MB. */
const TRACE_TEXT_LIMIT_BYTES = 32_000_000;
const SURROGATE = /[\uD800-\uDFFF]/;

export interface TraceSource {
  name: string;
  url: string;
  licence: "CC-BY-4.0";
  sha256: string;
  credit: string;
}

/** The dataset's traces published under CC BY 4.0, each with the hash its file had when locked. */
export const TRACE_SOURCES: readonly TraceSource[] = Object.freeze(
  LOCK.map(({ name, sha256 }) =>
    Object.freeze({
      name,
      url: `${DATASET}/raw/master/sequential_traces/${name}.json.gz`,
      licence: "CC-BY-4.0" as const,
      sha256,
      credit: `${name}, from the editing-traces dataset (${DATASET}), CC BY 4.0; replayed into script documents.`,
    }),
  ),
);

type Patch = readonly [number, number, string];

/**
 * A patch is [position, deleted, inserted]. Positions and lengths count UTF-16 code units, which are
 * the dataset's code points because readTrace refuses a character past U+FFFF.
 */
export interface Trace {
  name: string;
  startContent: string;
  endContent: string;
  patches: readonly Patch[];
}

/** Bytes that are not an editing trace. `cause` is what the unzipping or the JSON parser threw. */
export class TraceError extends Error {
  readonly code: "bad_trace";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TraceError";
    this.code = "bad_trace";
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    const unzipped = gunzipSync(bytes, {
      maxOutputLength: TRACE_TEXT_LIMIT_BYTES,
    });
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(unzipped),
    );
  } catch (error) {
    throw new TraceError(
      `a trace must be gzipped JSON of at most ${TRACE_TEXT_LIMIT_BYTES} bytes`,
      { cause: error },
    );
  }
}

function textAt(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TraceError(`${path} must be a string`);
  if (SURROGATE.test(value))
    throw new TraceError(`${path} holds a character past U+FFFF`);
  return value;
}

function countAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new TraceError(`${path} must be a whole number, not ${value}`);
  return value;
}

function patchAt(value: unknown, path: string): Patch {
  if (!Array.isArray(value) || value.length !== 3)
    throw new TraceError(`${path} must be [position, deleted, inserted]`);
  return [
    countAt(value[0], `${path}[0]`),
    countAt(value[1], `${path}[1]`),
    textAt(value[2], `${path}[2]`),
  ];
}

/**
 * The trace in a published file's bytes. Its `name` is empty: the file names nothing, so the caller sets it.
 * A patch reaching past the end of the text it applies to is refused, so every trace read here replays.
 */
export function readTrace(bytes: Uint8Array): Trace {
  const json = parseJson(bytes);
  if (!isRecord(json) || !Array.isArray(json.txns))
    throw new TraceError("a trace must be an object with a txns list");
  const startContent = textAt(json.startContent, "startContent");
  const endContent = textAt(json.endContent, "endContent");
  let length = startContent.length;
  const patches = json.txns.flatMap((txn: unknown, t) => {
    if (!isRecord(txn) || !Array.isArray(txn.patches))
      throw new TraceError(`txns[${t}] must have a patches list`);
    return txn.patches.map((value: unknown, p) => {
      const path = `txns[${t}].patches[${p}]`;
      const patch = patchAt(value, path);
      const [at, deleted, inserted] = patch;
      if (at + deleted > length)
        throw new TraceError(
          `${path} reaches past the end of the text, ${length} characters long`,
        );
      length += inserted.length - deleted;
      return patch;
    });
  });
  return { name: "", startContent, endContent, patches };
}

type Download = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

/** A body past TRACE_LIMIT_BYTES is cut off unread: no locked trace is that large, so its hash differs. */
async function download(url: string, get: typeof fetch): Promise<Download> {
  try {
    const response = await get(url);
    if (!response.ok)
      return { ok: false, reason: `the server answered ${response.status}` };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength;
      if (total > TRACE_LIMIT_BYTES)
        return { ok: false, reason: "hash differs" };
      chunks.push(chunk);
    }
    return { ok: true, bytes: Buffer.concat(chunks) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchOne(
  { name, url, sha256 }: TraceSource,
  options: { dir: string; fetch: typeof fetch },
): Promise<{ name: string; ok: boolean; reason: string | null }> {
  const got = await download(url, options.fetch);
  if (!got.ok) return { name, ok: false, reason: got.reason };
  if (createHash("sha256").update(got.bytes).digest("hex") !== sha256)
    return { name, ok: false, reason: "hash differs" };
  // written whole, then renamed, so that a stopped download never leaves part of a trace
  const file = join(options.dir, `${name}.json.gz`);
  writeFileSync(`${file}.partial`, got.bytes);
  renameSync(`${file}.partial`, file);
  return { name, ok: true, reason: null };
}

/**
 * Downloads every source into `dir` as `<name>.json.gz`, one after another. A file whose hash is not
 * the locked one is refused with the reason "hash differs" and never written.
 */
export async function fetchTraces(options: {
  dir: string;
  fetch: typeof fetch;
}): Promise<{ name: string; ok: boolean; reason: string | null }[]> {
  mkdirSync(options.dir, { recursive: true });
  const fetched: { name: string; ok: boolean; reason: string | null }[] = [];
  for (const source of TRACE_SOURCES)
    fetched.push(await fetchOne(source, options));
  return fetched;
}

/** A block of the replayed document and its text, kept so that a position is found without reading the document. */
interface Line {
  id: string;
  text: string;
}

function blockOf(line: Line): BlockJSON {
  const attrs = { id: line.id, type: "action" };
  return line.text === ""
    ? { type: "block", attrs }
    : { type: "block", attrs, content: [{ type: "text", text: line.text }] };
}

function assertWritten(written: boolean, id: string): void {
  if (!written) throw new Error(`the replay lost the block ${id}`);
}

/** The line holding position `at` of the text, and the offset in it. */
function locate(
  lines: readonly Line[],
  at: number,
): { index: number; offset: number } {
  let left = at;
  for (const [index, line] of lines.entries()) {
    if (left <= line.text.length) return { index, offset: left };
    left -= line.text.length + 1;
  }
  throw new RangeError(`a patch at ${at} lies past the end of the text`);
}

/** Deletes `count` characters from the offset on; each deleted newline joins the next line to this one. */
function deleteFrom(
  w: BlockWriter,
  lines: Line[],
  { index, offset }: { index: number; offset: number },
  count: number,
): void {
  const line = lines[index]!;
  const here = Math.min(count, line.text.length - offset);
  if (here > 0) {
    assertWritten(w.deleteText(line.id, offset, here), line.id);
    line.text = line.text.slice(0, offset) + line.text.slice(offset + here);
  }
  // each turn deletes the newline after this line and the next line's block
  for (let left = count - here; left > 0;) {
    const [next] = lines.splice(index + 1, 1);
    if (next === undefined)
      throw new RangeError(
        `a patch deletes ${count} characters past the end of the text`,
      );
    assertWritten(w.deleteBlock(next.id), next.id);
    left -= 1 + next.text.length;
    if (left >= 0) continue;
    const tail = next.text.slice(next.text.length + left);
    assertWritten(w.insertText(line.id, line.text.length, tail), line.id);
    line.text += tail;
  }
}

/** Inserts `text` at the offset; each newline in it splits the line, the text after the offset going last. */
function insertAt(
  w: BlockWriter,
  lines: Line[],
  { index, offset }: { index: number; offset: number },
  text: string,
  newId: IdSource,
): void {
  const line = lines[index]!;
  const [first = "", ...rest] = text.split("\n");
  const tail = rest.length === 0 ? "" : line.text.slice(offset);
  if (tail !== "")
    assertWritten(w.deleteText(line.id, offset, tail.length), line.id);
  if (first !== "")
    assertWritten(w.insertText(line.id, offset, first), line.id);
  line.text =
    line.text.slice(0, offset) + first + line.text.slice(offset + tail.length);
  if (rest.length === 0) return;
  const added = rest.map((part, i) => ({
    id: newId(),
    text: i === rest.length - 1 ? part + tail : part,
  }));
  assertWritten(w.insertBlocks(line.id, added.map(blockOf)), line.id);
  lines.splice(index + 1, 0, ...added);
}

/**
 * Replays a plain-text trace into a script document: a newline in inserted text splits a block, a deleted newline joins two.
 * The start content is loaded first; then each patch is one transaction, and `transactions` counts them. Every block is
 * an action, its id drawn from a generator seeded with `clientId`. A patch past the end of the text throws a RangeError.
 */
export function replayTrace(
  trace: Trace,
  options: { clientId: number },
): { doc: CrdtDoc; transactions: number } {
  const newId = seededIdSource(createRng(options.clientId));
  const lines = trace.startContent
    .split("\n")
    .map((text) => ({ id: newId(), text }));
  const doc = createDoc({ clientId: options.clientId });
  const body = scriptBody(doc);
  body.write((w) => w.insertBlocks(null, lines.map(blockOf)));
  let transactions = 0;
  for (const [at, deleted, inserted] of trace.patches) {
    const place = locate(lines, at);
    body.write((w) => {
      deleteFrom(w, lines, place, deleted);
      insertAt(w, lines, place, inserted, newId);
    });
    transactions += 1;
  }
  return { doc, transactions };
}
