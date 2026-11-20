// The lines of the newer version's pages that a comparison's changes fall on: where revision asterisks go.
import { engineFor } from "@manent/pagination";
import type { LaidOutPage, Pagination } from "@manent/pagination";
import type { BlockEntry } from "./align.ts";
import type { InlineChange } from "./block-changes.ts";
import type { Comparison } from "./comparison.ts";

/** One text line that holds a change. */
export interface MarkedLine {
  /** In units, as PositionedLine.y. */
  readonly y: number;
  readonly blockId: string;
  readonly authorUserId: string | null;
}

/** The last line whose start is at or before `offset`. */
function lineAt(starts: Int32Array, offset: number): number {
  let line = 0;
  while (line + 1 < starts.length && starts[line + 1]! <= offset) line++;
  return line;
}

/** The lines one change inside a block falls on; a deletion at the very end of a line marks that line. */
function linesOf(starts: Int32Array, change: InlineChange): number[] {
  const first = lineAt(starts, change.offset);
  if (change.kind === "deleted")
    return [first > 0 && starts[first] === change.offset ? first - 1 : first];
  const last = lineAt(starts, change.offset + change.length - 1);
  return Array.from({ length: last - first + 1 }, (_, k) => first + k);
}

function isWholeBlock(entry: BlockEntry): boolean {
  return entry.kind === "added" || entry.moved || entry.attrs.length > 0;
}

/** For each entry, the id of the next entry after it that newer holds; null for none. */
function nextHeldOf(entries: readonly BlockEntry[]): (string | null)[] {
  const reversed: (string | null)[] = [];
  let next: string | null = null;
  for (const entry of entries.toReversed()) {
    reversed.push(next);
    if (entry.newer !== null) next = entry.id;
  }
  return reversed.toReversed();
}

/**
 * For each block with a change, the lines of the newer block that hold one
 * (by `lineStartsOf` of the pagination's own engine); an added, moved or
 * re-attributed block marks every line; a removed block marks the first line
 * of the block after its place (the deletion point), or the last line of the
 * document. Block id → line numbers, ascending. RangeError for a pagination
 * whose engine this build does not carry.
 */
export function changedLineSet(
  c: Comparison,
  pagination: Pagination,
): ReadonlyMap<string, readonly number[]> {
  const engine = engineFor(pagination.engineVersion);
  if (engine === null)
    throw new RangeError(
      `this build carries no layout engine ${pagination.engineVersion}`,
    );
  const indexOf = new Map<string, number>();
  pagination.blocks.forEach((block, i) => {
    if (!indexOf.has(block.id)) indexOf.set(block.id, i);
  });
  const startsOf = (id: string): Int32Array | null => {
    const i = indexOf.get(id);
    return i === undefined ? null : engine.lineStartsOf(pagination, i);
  };
  const marked = new Map<string, Set<number>>();
  const mark = (id: string, lines: readonly number[]) => {
    const set = marked.get(id) ?? new Set<number>();
    for (const line of lines) set.add(line);
    if (set.size > 0) marked.set(id, set);
  };
  const lastBlock = pagination.blocks.findLastIndex(
    (_, i) => engine.lineStartsOf(pagination, i).length > 0,
  );
  const nextHeld = nextHeldOf(c.entries);
  c.entries.forEach((entry, k) => {
    if (entry.kind === "removed") {
      const point = nextHeld[k]!;
      if (point !== null) mark(point, [0]);
      else if (lastBlock !== -1) {
        const block = pagination.blocks[lastBlock]!;
        mark(block.id, [engine.lineStartsOf(pagination, lastBlock).length - 1]);
      }
      return;
    }
    const starts = startsOf(entry.id);
    if (starts === null) return;
    if (isWholeBlock(entry))
      mark(
        entry.id,
        Array.from(starts, (_, line) => line),
      );
    else
      for (const change of entry.inline)
        mark(entry.id, linesOf(starts, change));
  });
  return new Map(
    [...marked].map(([id, lines]) => [
      id,
      Object.freeze([...lines].toSorted((x, y) => x - y)),
    ]),
  );
}

/** The text lines of `page` that `lines` marks, in the page's order, each with its block's author from `authors` (null when it holds none). */
export function markedLines(
  page: LaidOutPage,
  lines: ReadonlyMap<string, readonly number[]>,
  authors: ReadonlyMap<string, string>,
): MarkedLine[] {
  return page.lines.flatMap((line) =>
    line.kind === "text" &&
    line.blockId !== null &&
    (lines.get(line.blockId) ?? []).includes(line.blockLine)
      ? [
          {
            y: line.y,
            blockId: line.blockId,
            authorUserId: authors.get(line.blockId) ?? null,
          },
        ]
      : [],
  );
}
