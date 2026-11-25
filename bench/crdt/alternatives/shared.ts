// Shared trace discovery and plain-text line-splitting/joining replay driver for CRDT alternatives.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TRACE_SOURCES, readTrace } from "../../corpus/traces.ts";
import type { Trace } from "../../corpus/traces.ts";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Measurement } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";

const TRACES_DIR = join(import.meta.dir, "../../corpus/traces");
const NOT_FETCHED =
  "the editing traces are not fetched: run bun run bench fetch-traces";
const QUICK_MAX_PATCHES = 200;
const UTF8 = new TextEncoder();

export interface LineOps {
  deleteText(index: number, offset: number, count: number): void;
  insertText(index: number, offset: number, text: string): void;
  deleteLine(index: number): void;
  insertLines(afterIndex: number, texts: readonly string[]): void;
}

export interface AlternativeReplay {
  readonly text: string;
  readonly liveBytes: number;
  readonly plainBytes: number;
}

/** Reads every fetched locked trace from `bench/corpus/traces`, or throws `NotMeasured` when none exist. */
export function requireFetchedTraces(): Trace[] {
  const traces = TRACE_SOURCES.flatMap(({ name }) => {
    const file = join(TRACES_DIR, `${name}.json.gz`);
    if (!existsSync(file)) return [];
    return [{ ...readTrace(readFileSync(file)), name }];
  });
  if (traces.length === 0) throw new NotMeasured(NOT_FETCHED);
  return traces;
}

const metricName = (trace: Trace): string => trace.name.replaceAll("-", "_");

function traceForMode(trace: Trace): Trace {
  if (benchMode() !== "quick" || trace.patches.length <= QUICK_MAX_PATCHES)
    return trace;
  return { ...trace, patches: trace.patches.slice(0, QUICK_MAX_PATCHES) };
}

function locate(
  lines: readonly string[],
  at: number,
): { index: number; offset: number } {
  let left = at;
  for (let index = 0; index < lines.length; index++) {
    const len = lines[index]!.length;
    if (left <= len) return { index, offset: left };
    left -= len + 1;
  }
  throw new RangeError(`patch offset ${at} lies past the end of the text`);
}

/** Applies one plain-text trace patch `[at, deleted, inserted]` to `lines` and mirrors it onto `ops`. */
export function applyLinePatch(
  lines: string[],
  patch: readonly [number, number, string],
  ops: LineOps,
): void {
  const [at, deleted, inserted] = patch;
  const place = locate(lines, at);
  const { index, offset } = place;

  if (deleted > 0) {
    const line = lines[index]!;
    const here = Math.min(deleted, line.length - offset);
    if (here > 0) {
      ops.deleteText(index, offset, here);
      lines[index] = line.slice(0, offset) + line.slice(offset + here);
    }
    for (let left = deleted - here; left > 0;) {
      const [next] = lines.splice(index + 1, 1);
      if (next === undefined)
        throw new RangeError(
          `patch deletes ${deleted} characters past the end of the text`,
        );
      ops.deleteLine(index + 1);
      left -= 1 + next.length;
      if (left >= 0) continue;
      const tail = next.slice(next.length + left);
      ops.insertText(index, lines[index]!.length, tail);
      lines[index] = lines[index]! + tail;
    }
  }

  if (inserted !== "") {
    const line = lines[index]!;
    const [first = "", ...rest] = inserted.split("\n");
    const tail = rest.length === 0 ? "" : line.slice(offset);
    if (tail !== "") ops.deleteText(index, offset, tail.length);
    if (first !== "") ops.insertText(index, offset, first);
    lines[index] =
      line.slice(0, offset) + first + line.slice(offset + tail.length);
    if (rest.length === 0) return;
    const added = rest.map((part, i) =>
      i === rest.length - 1 ? part + tail : part,
    );
    ops.insertLines(index, added);
    lines.splice(index + 1, 0, ...added);
  }
}

/** UTF-8 byte length of every line's text, matching `measureDoc` in `@manent/crdt`. */
export function plainTextBytes(lines: readonly string[]): number {
  let total = 0;
  for (const line of lines) total += UTF8.encode(line).byteLength;
  return total;
}

/** Times `replay` over every fetched trace and emits `replay_ms_<t>` and `bytes_ratio_<t>`. */
export async function runTraceAlternative(
  replay: (trace: Trace) => AlternativeReplay,
): Promise<Measurement[]> {
  const traces = requireFetchedTraces();
  const measured: Measurement[] = [];
  for (const trace of traces) {
    const effective = traceForMode(trace);
    let result: AlternativeReplay | null = null;
    const ms = await sampleMs(() => {
      result = replay(effective);
    });
    if (result === null) throw new Error(`${trace.name} was not replayed`);
    const { liveBytes, plainBytes } = result as AlternativeReplay;
    const t = metricName(trace);
    measured.push(
      measurement(`replay_ms_${t}`, "ms", [ms]),
      measurement(`bytes_ratio_${t}`, "count", [
        liveBytes / Math.max(1, plainBytes),
      ]),
    );
  }
  return measured;
}
