// An aged script: a seeded screenplay worked over by many editing sessions, each on a fresh client
// id, in a fixed mix of block writes, and its rebuild.
import {
  loadDoc,
  rebuildDoc,
  scriptBody,
  scriptDocFromJSON,
} from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { createRng, seededIdSource } from "@manent/demo";
import type { Rng } from "@manent/demo";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import type { BlockJSON, DocJSON, IdSource } from "@manent/schema";

const BLOCKS_PER_PAGE = 25;
/** The client id of the script's first state; session n writes as GENERATOR_CLIENT_ID + n. */
const GENERATOR_CLIENT_ID = 1;
/** The most characters a retype removes, and the most it types. */
const RETYPE_CHARACTERS = 24;
const NEW_BLOCK_CHARACTERS = 200;
const SCENE_BLOCKS = { least: 5, most: 25 } as const;

/** A block as the generator keeps it: the script's text never carries a mark. */
interface Kept {
  id: string;
  attrs: Record<string, unknown>;
  text: string;
}

/** The blocks of the script being edited, in order, and the draws that choose each write. */
interface Editing {
  blocks: Kept[];
  rng: Rng;
  newId: IdSource;
}

type Edit = (w: BlockWriter, editing: Editing) => boolean;

function jsonOf(block: Kept): BlockJSON {
  return block.text === ""
    ? { type: "block", attrs: block.attrs }
    : {
        type: "block",
        attrs: block.attrs,
        content: [{ type: "text", text: block.text }],
      };
}

function keptOf(doc: DocJSON): Kept[] {
  return (doc.content ?? []).flatMap((section) =>
    (section.content ?? []).map((block) => {
      const attrs = { ...block.attrs };
      const { id } = attrs;
      if (typeof id !== "string") throw new RangeError("a block has no id");
      const text = (block.content ?? []).map((run) => run.text).join("");
      return { id, attrs, text };
    }),
  );
}

/** Up to `most` characters of some block's text, as what is typed. */
function typed(editing: Editing, most: number): string {
  const { text } = editing.rng.pick(editing.blocks);
  const start = editing.rng.int(0, Math.max(0, text.length - 1));
  return text.slice(start, start + editing.rng.int(1, most));
}

/** A stretch of a block's text deleted and other text typed in its place. */
const retype: Edit = (w, editing) => {
  const { rng } = editing;
  const block = rng.pick(editing.blocks);
  const at = rng.int(0, block.text.length);
  const removed = rng.int(
    0,
    Math.min(RETYPE_CHARACTERS, block.text.length - at),
  );
  // a retype always types something, even when the text it copies from is empty
  const text = typed(editing, RETYPE_CHARACTERS) || "a";
  if (removed > 0 && !w.deleteText(block.id, at, removed)) return false;
  block.text = block.text.slice(0, at) + text + block.text.slice(at + removed);
  return w.insertText(block.id, at, text);
};

const newBlock: Edit = (w, editing) => {
  const { blocks, rng } = editing;
  const at = rng.int(0, blocks.length - 1);
  const anchor = blocks[at]!;
  const id = editing.newId();
  const block = {
    id,
    attrs: { id, type: "action" },
    text: typed(editing, NEW_BLOCK_CHARACTERS),
  };
  blocks.splice(at + 1, 0, block);
  return w.insertBlocks(anchor.id, [jsonOf(block)]);
};

const deleteBlock: Edit = (w, editing) => {
  const { blocks, rng } = editing;
  if (blocks.length === 1) return newBlock(w, editing);
  const [block] = blocks.splice(rng.int(0, blocks.length - 1), 1);
  return w.deleteBlock(block!.id);
};

/** A run of consecutive blocks deleted and inserted elsewhere under the same ids. */
const moveScene: Edit = (w, editing) => {
  const { blocks, rng } = editing;
  const count = Math.min(
    rng.int(SCENE_BLOCKS.least, SCENE_BLOCKS.most),
    blocks.length - 1,
  );
  if (count < 1) return newBlock(w, editing);
  const scene = blocks.splice(rng.int(0, blocks.length - count), count);
  if (!scene.every((block) => w.deleteBlock(block.id))) return false;
  const at = rng.int(0, blocks.length);
  const after = at === 0 ? null : blocks[at - 1]!.id;
  blocks.splice(at, 0, ...scene);
  return w.insertBlocks(after, scene.map(jsonOf));
};

/** Each write's share: below the first bound, the first write, and so on. */
const MIX: readonly (readonly [number, Edit])[] = Object.freeze([
  [0.7, retype],
  [0.85, newBlock],
  [0.95, deleteBlock],
  [1, moveScene],
]);

/** One write of the mix to `doc`, as one transaction. */
function edit(doc: CrdtDoc, editing: Editing): void {
  const draw = editing.rng.next();
  const [, chosen] = MIX.find(([bound]) => draw < bound) ?? MIX.at(-1)!;
  scriptBody(doc).write((w) => {
    if (!chosen(w, editing))
      throw new RangeError("an aging write named a block the script lacks");
  });
}

function assertCount(name: string, value: number, least: number): void {
  if (!Number.isInteger(value) || value < least)
    throw new RangeError(
      `${name} must be an integer of at least ${least}, not ${value}`,
    );
}

/** A source of draws in [0, 1) as the generator the writes choose from, drawing as createRng's does. */
function rngOf(random: () => number): Rng {
  const int = (min: number, maxInclusive: number): number =>
    min + Math.floor(random() * (maxInclusive - min + 1));
  return {
    next: random,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!,
  };
}

/** The blocks of `doc`'s script and the draws that choose each write from `rng`. */
function editingOf(doc: CrdtDoc, rng: Rng): Editing {
  return {
    blocks: keptOf(scriptBody(doc).materialize()),
    rng,
    newId: seededIdSource(rng),
  };
}

/** A load of doc's state under `clientId`, then `edits` writes of the mix; `doc` is left as it was. */
function runSession(
  doc: CrdtDoc,
  clientId: number,
  edits: number,
  editing: Editing,
): CrdtDoc {
  const next = loadDoc(doc.encodeState(), { clientId });
  for (let n = 0; n < edits; n++) edit(next, editing);
  return next;
}

/**
 * A script of `pages` × 25 blocks of the seeded screenplay corpus, written by client 1, then
 * `sessions` sessions, each a load of the state so far under the next client id that makes
 * `editsPerSession` block writes: 70 % retype part of a block, 15 % a new block, 10 % delete a
 * block, 5 % move a scene of 5 to 25 blocks. The same options give the same document. RangeError for
 * pages or editsPerSession that is not a positive integer, or sessions that is not a whole number.
 */
export function ageScript(options: {
  pages: number;
  sessions: number;
  editsPerSession: number;
  seed: number;
}): CrdtDoc {
  const { pages, sessions, editsPerSession, seed } = options;
  assertCount("pages", pages, 1);
  assertCount("sessions", sessions, 0);
  assertCount("editsPerSession", editsPerSession, 1);
  const script = corpusDoc(
    generateBlocks("screenplay", pages * BLOCKS_PER_PAGE, seed),
  );
  const rng = createRng(seed);
  const editing = { blocks: keptOf(script), rng, newId: seededIdSource(rng) };
  let doc = scriptDocFromJSON(script, { clientId: GENERATOR_CLIENT_ID });
  for (let session = 1; session <= sessions; session++) {
    const next = runSession(
      doc,
      GENERATOR_CLIENT_ID + session,
      editsPerSession,
      editing,
    );
    doc.destroy();
    doc = next;
  }
  return doc;
}

/**
 * One session: loadDoc of doc's state under clientId, then `edits` block writes in ageScript's mix; returns the session's document.
 * `doc` is left as it was, and its script's text must carry no mark. RangeError for `edits` that is not a positive integer.
 */
export function ageSession(
  doc: CrdtDoc,
  options: { clientId: number; edits: number; random: () => number },
): CrdtDoc {
  assertCount("edits", options.edits, 1);
  return runSession(
    doc,
    options.clientId,
    options.edits,
    editingOf(doc, rngOf(options.random)),
  );
}

/**
 * `edits` writes of ageScript's mix to `doc`, under its own client id, chosen from `seed`; the
 * script's text must carry no mark, as an aged script's never does. RangeError for `edits` that is
 * not a positive integer.
 */
export function editOffline(
  doc: CrdtDoc,
  options: { edits: number; seed: number },
): void {
  assertCount("edits", options.edits, 1);
  const editing = editingOf(doc, createRng(options.seed));
  for (let n = 0; n < options.edits; n++) edit(doc, editing);
}

/** A rebuild of an aged script, as the server makes one: under the next client id after the last session's. */
export function rebuildAged(aged: CrdtDoc): CrdtDoc {
  const built = rebuildDoc(aged, { clientId: aged.clientId + 1 });
  if (!built.ok)
    throw new Error(`the aged script was not rebuilt: ${built.code}`);
  return built.doc;
}
