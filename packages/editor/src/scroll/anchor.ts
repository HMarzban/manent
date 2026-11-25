// How far apart two blocks sit in the continuous scroll, and how far a change above the reader moved the reader's
// block, from the pagination alone: a section that is not rendered costs the same as one that is.
import { UNITS_PER_LINE, UNIT_PX } from "@manent/pagination";
import type { ChangeHint, Engine, Pagination } from "@manent/pagination";
import { PAGE_GAP_PX } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";

// The break drawn before block `block` when the block opens a page, px at 100 %: the blank and (MORE) line at the foot
// of the page above, the margins and the desk between the sheets, and the page's top furniture; 0 when it opens none.
// The blank takes up what the page above gains or loses, so a block that opens a page stays with its sheet.
function breakBeforePx(p: Pagination, engine: Engine, block: number): number {
  const k = engine.pageOf(p, block, 0);
  const page = p.pages[k];
  const above = p.pages[k - 1];
  if (
    page === undefined ||
    above === undefined ||
    page.block !== block ||
    page.line !== 0
  )
    return 0;
  const { top, bottom } = screenPagePx(p.profile);
  const units =
    engine.fillUnits(p, k - 1) +
    (above.more ? UNITS_PER_LINE : 0) +
    page.topUnits;
  return units * UNIT_PX + bottom + PAGE_GAP_PX + top;
}

/**
 * How far block `to` starts below block `from` in the scroll, px at 100 %: the units between them and, for each
 * page break between them, the bottom margin, the desk and the next page's top margin as the page draws them. A
 * block that opens a page starts below the break drawn before it.
 */
export function blockTopPx(
  p: Pagination,
  engine: Engine,
  from: number,
  to: number,
): number {
  const { top, bottom } = screenPagePx(p.profile);
  return (
    engine.flowUnits(p, from, to) * UNIT_PX +
    engine.breaksIn(p, from, to) * (bottom + PAGE_GAP_PX + top) +
    breakBeforePx(p, engine, to) -
    breakBeforePx(p, engine, from)
  );
}

// The first block whose place a change starting at `first` can move: a page that read no block at or after the change
// keeps its breaks, and the first page that did may now break before the change.
function firstMovable(p: Pagination, first: number): number {
  const reached = Math.min(first, p.blocks.length - 1);
  const page =
    p.pages.find((candidate) => candidate.readAhead >= reached) ??
    p.pages.at(-1)!;
  return Math.min(first, page.block);
}

/**
 * How far a change moved block `anchorAfter` (an index into `after`), px at 100 %, counting only the blocks from the
 * first one the change can move to the anchor; 0 when the anchor is above the end of what the change wrote.
 */
export function anchorShiftPx(
  before: Pagination,
  after: Pagination,
  engine: Engine,
  change: ChangeHint,
  anchorAfter: number,
): number {
  if (anchorAfter < change.newEnd) return 0;
  const from = firstMovable(before, change.first);
  const anchorBefore = anchorAfter - (change.newEnd - change.oldEnd);
  return (
    blockTopPx(after, engine, from, anchorAfter) -
    blockTopPx(before, engine, from, anchorBefore)
  );
}
