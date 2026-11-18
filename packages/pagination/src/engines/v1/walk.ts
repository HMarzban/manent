// A page walked line by line, from where it opens to where the next page does: what the drawn page
// and the scroll height both read. Units are half-lines.
import type { Page, Pagination } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import type { ColumnPiece, Point } from "./dual.ts";
import {
  columnsOf,
  createFlow,
  dropOf,
  dualUnitAt,
  isPrinted,
  spaceOf,
  stepOf,
} from "./keep.ts";
import type { DualUnit, Flow } from "./keep.ts";

/** The page at `pageIndex`. Throws RangeError past the last page. */
export function pageAt(p: Pagination, pageIndex: number): Page {
  const page = p.pages[pageIndex];
  if (page === undefined)
    throw new RangeError(
      `a page index must be below ${p.pages.length}, not ${pageIndex}`,
    );
  return page;
}

export interface Walk {
  readonly p: Pagination;
  readonly flow: Flow;
  readonly page: Page;
  readonly next: Page | null;
  /** Each text line, line m of block i, with the top of its slot. */
  readonly onLine: (i: number, m: number, top: number) => void;
  /** Each block or dual run placed, by its first block on the page, with the units it takes there. */
  readonly onPlaced: (block: number, units: number) => void;
  /** The top of the next slot. */
  y: number;
  /** The end of the last text line's slot. */
  foot: number;
  atTop: boolean;
}

export function walkOf(
  p: Pagination,
  pageIndex: number,
  onLine: Walk["onLine"],
  onPlaced: Walk["onPlaced"],
): Walk {
  const page = pageAt(p, pageIndex);
  return {
    p,
    // the next page's start says where this one ends, so no lock is read again
    flow: createFlow(p.blocks, p.profile, p.metrics, new Map()),
    page,
    next: p.pages[pageIndex + 1] ?? null,
    onLine,
    onPlaced,
    y: page.topUnits,
    foot: page.topUnits,
    atTop: true,
  };
}

// A column's lines from its top at `top` up to `end` (null: to its end); the units they take.
function walkColumn(
  walk: Walk,
  column: readonly ColumnPiece[],
  top: number,
  end: Point | null,
): number {
  let y = 0;
  for (const piece of column) {
    if (end !== null && piece.block === end.block && piece.line === end.line)
      return y;
    y += piece.space;
    const stop = end?.block === piece.block ? end.line : piece.lines;
    for (let m = piece.line; m < stop; m++, y += piece.step)
      walk.onLine(piece.block, m, top + y);
    if (stop < piece.lines) return y;
  }
  return y;
}

// Where each column of a run stops on this page, given where the next page opens; null: at its end.
function runEnds(
  unit: DualUnit,
  next: Page | null,
): readonly [Point | null, Point | null] {
  const { run } = unit;
  if (next === null || next.block < run.start || next.block >= run.end)
    return [null, null];
  return next.block < run.split ? [next, next.right] : [null, next];
}

// A run cut at the foot takes the rest of what the page uses: its row may fall in a gap between lines.
function walkRun(walk: Walk, unit: DualUnit): void {
  const { flow, page, next } = walk;
  const first = unit.left?.block ?? unit.right?.block ?? unit.run.start;
  const before = walk.atTop
    ? dropOf(flow, first)
    : spaceOf(flow, unit.run.start);
  const [left, right] = columnsOf(flow, unit);
  const ends = runEnds(unit, next);
  const height = Math.max(
    walkColumn(walk, left, walk.y + before, ends[0]),
    walkColumn(walk, right, walk.y + before, ends[1]),
  );
  const cut = ends[0] !== null || ends[1] !== null;
  walk.onPlaced(
    first,
    cut
      ? page.usedUnits - (page.more ? UNITS_PER_LINE : 0) - walk.y
      : before + height,
  );
  walk.foot = walk.y + before + height;
  walk.y = walk.foot;
  walk.atTop = false;
}

export function walkPage(walk: Walk): void {
  const { p, flow, page, next } = walk;
  for (
    let i = page.block, line = page.line;
    i < p.blocks.length;
    i++, line = 0
  ) {
    if (
      next !== null &&
      (i > next.block || (i === next.block && line >= next.line))
    )
      return;
    if (!isPrinted(flow, i)) continue;
    const unit = dualUnitAt(
      flow,
      i,
      line,
      i === page.block ? page.right : null,
    );
    if (unit !== null) {
      walkRun(walk, unit);
      i = unit.run.end - 1;
      continue;
    }
    const before = walk.atTop ? dropOf(flow, i) : spaceOf(flow, i);
    const stop = next?.block === i ? next.line : p.metrics[i]!.lines;
    walk.y += before;
    for (let m = line; m < stop; m++, walk.y += stepOf(flow, i))
      walk.onLine(i, m, walk.y);
    walk.onPlaced(i, before + (stop - line) * stepOf(flow, i));
    walk.foot = walk.y;
    walk.atTop = false;
  }
}
