// Runs of blocks by index, each [from, to), kept as lists in ascending order that never overlap or touch.
import type { ChangeHint } from "@manent/pagination";
import type { BlockIndex } from "./block-index.ts";

export interface BlockRange {
  readonly from: number;
  /** One past the last block. */
  readonly to: number;
}

/** The blocks in either list; empty runs are dropped. */
export function joinRanges(
  a: readonly BlockRange[],
  b: readonly BlockRange[],
): BlockRange[] {
  const joined: BlockRange[] = [];
  for (const run of [...a, ...b].toSorted((x, y) => x.from - y.from)) {
    if (run.from >= run.to) continue;
    const last = joined.at(-1);
    if (last !== undefined && run.from <= last.to)
      joined[joined.length - 1] = {
        from: last.from,
        to: Math.max(last.to, run.to),
      };
    else joined.push(run);
  }
  return joined;
}

/** The blocks of `a` that are also in `b`. */
export function overlapRanges(
  a: readonly BlockRange[],
  b: readonly BlockRange[],
): BlockRange[] {
  const overlap: BlockRange[] = [];
  for (const x of a)
    for (const y of b) {
      const from = Math.max(x.from, y.from);
      const to = Math.min(x.to, y.to);
      if (from < to) overlap.push({ from, to });
    }
  return joinRanges(overlap, []);
}

/** The blocks of `a` that are not in `b`. */
export function withoutRanges(
  a: readonly BlockRange[],
  b: readonly BlockRange[],
): BlockRange[] {
  let rest = [...a];
  for (const y of b)
    rest = rest.flatMap((x) =>
      [
        { from: x.from, to: Math.min(x.to, y.from) },
        { from: Math.max(x.from, y.to), to: x.to },
      ].filter((run) => run.from < run.to),
    );
  return rest;
}

// Where block `block`, or the end of the blocks before it, is after `change`: the blocks it replaced are those it wrote.
function blockAfter(block: number, change: ChangeHint, end: boolean): number {
  if (block < change.first || (end && block === change.first)) return block;
  if (block >= change.oldEnd) return block + change.newEnd - change.oldEnd;
  return end ? change.newEnd : change.first;
}

/** The runs in the blocks after `change`: a block it replaced is one of the blocks it wrote. */
export function rangesAfter(
  ranges: readonly BlockRange[],
  change: ChangeHint,
): BlockRange[] {
  return joinRanges(
    ranges.map((run) => ({
      from: blockAfter(run.from, change, false),
      to: blockAfter(run.to, change, true),
    })),
    [],
  );
}

export function isSameRanges(
  a: readonly BlockRange[],
  b: readonly BlockRange[],
): boolean {
  return (
    a.length === b.length &&
    a.every((run, i) => run.from === b[i]!.from && run.to === b[i]!.to)
  );
}

/** The blocks of the sections given by index. */
export function sectionBlocks(
  index: BlockIndex,
  sections: readonly number[],
): BlockRange[] {
  return joinRanges(
    sections.map((s) => ({
      from: index.sectionStart[s]!,
      to: index.sectionStart[s + 1]!,
    })),
    [],
  );
}

/** The sections holding a block of `ranges`, as indexes, ascending. */
export function sectionsOf(
  index: BlockIndex,
  ranges: readonly BlockRange[],
): number[] {
  const { sectionStart } = index;
  const sections: number[] = [];
  let s = 0;
  let r = 0;
  while (s < sectionStart.length - 1 && r < ranges.length) {
    const run = ranges[r]!;
    if (sectionStart[s + 1]! <= run.from) s++;
    else if (sectionStart[s]! >= run.to) r++;
    else sections.push(s++);
  }
  return sections;
}
