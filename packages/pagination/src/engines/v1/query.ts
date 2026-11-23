// What a reader asks of a pagination: the page that holds a place, a block's line starts, the blank
// at a page's foot, and the scroll height of a range of blocks. Units are half-lines.
import type { Page, Pagination } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import { runAt } from "./dual.ts";
import { pageAt, walkOf, walkPage } from "./walk.ts";

// A start at or before `offset` of `block`.
const isAtOrBefore = (
  at: { readonly block: number; readonly offset: number },
  block: number,
  offset: number,
) => at.block < block || (at.block === block && at.offset <= offset);

// The page opens inside a dual run that began on an earlier page.
function opensInsideRun(p: Pagination, page: Page): boolean {
  const run = runAt(p.blocks, p.profile, page.block);
  return (
    run !== null &&
    !(page.block === run.start && page.line === 0 && page.right === null)
  );
}

/** The index of the page that holds `offset` of `block`. */
export function pageOf(p: Pagination, block: number, offset: number): number {
  let lo = 0;
  let hi = p.pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (isAtOrBefore(p.pages[mid]!, block, offset)) lo = mid;
    else hi = mid - 1;
  }
  const run = runAt(p.blocks, p.profile, block);
  if (run === null || block < run.split) return lo;
  // a place in a right column is on the last page whose right column resumes at or before it
  for (let k = lo; k > 0; k--) {
    const page = p.pages[k]!;
    if (page.block >= run.split || !opensInsideRun(p, page)) return k;
    if (page.right !== null && isAtOrBefore(page.right, block, offset))
      return k;
  }
  return 0;
}

/** Where each of the block's lines starts as placed: the suffix, enclosure and locked offsets counted. */
export function lineStartsOf(p: Pagination, block: number): Int32Array {
  const metrics = p.metrics[block];
  if (metrics === undefined)
    throw new RangeError(
      `a block index must be below ${p.metrics.length}, not ${block}`,
    );
  return metrics.starts.slice();
}

/** Units of blank at the foot of a page: linesPerPage × 2 less what it uses. */
export function fillUnits(p: Pagination, pageIndex: number): number {
  return (
    p.profile.linesPerPage * UNITS_PER_LINE - pageAt(p, pageIndex).usedUnits
  );
}

// The index of the first page whose first block is at or after `block`; the page count for none. Found by halving:
// the pages start in block order.
function firstPageFrom(p: Pagination, block: number): number {
  let lo = 0;
  let hi = p.pages.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.pages[mid]!.block < block) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The pages after the first whose first block is in [from, to). */
export function breaksIn(p: Pagination, from: number, to: number): number {
  return Math.max(
    0,
    firstPageFrom(p, to) - Math.max(1, firstPageFrom(p, from)),
  );
}

/**
 * Units blocks [from, to) take in the continuous scroll: each block's lines and its space as placed
 * (its drop where it is first on a page; a dual run with its first block on each page), and, for
 * every page after the first whose first block is in the range, the fill and (MORE) line of the page
 * before and that page's top furniture. Over the whole script, with the last page's fill, it is the
 * height of the pages.
 */
export function flowUnits(p: Pagination, from: number, to: number): number {
  let units = 0;
  const count = (block: number, placed: number) => {
    if (block >= from && block < to) units += placed;
  };
  for (
    let k = Math.max(0, firstPageFrom(p, from) - 1);
    k < p.pages.length && p.pages[k]!.block < to;
    k++
  ) {
    walkPage(walkOf(p, k, () => {}, count));
    const page = p.pages[k]!;
    const before = p.pages[k - 1];
    if (before !== undefined && page.block >= from)
      units +=
        fillUnits(p, k - 1) +
        (before.more ? UNITS_PER_LINE : 0) +
        page.topUnits;
  }
  return units;
}
