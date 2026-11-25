// The height on screen of each section and of all the pages, from the engine alone, and the height a section left
// behind is drawn at.
import { UNIT_PX } from "@manent/pagination";
import { PAGE_GAP_PX } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";
import type { PaginationState } from "./plugin.ts";

/**
 * The section's height in px at 100 %: its blocks' lines and space as placed, and the page breaks that fall in
 * it; the first section also holds the first page's top margin, the last the last page's blank and bottom margin.
 */
export function sectionHeightPx(
  state: Pick<PaginationState, "pagination" | "index" | "settings">,
  section: number,
): number {
  const { pagination: p, index, settings } = state;
  const { engine } = settings;
  const { top, bottom } = screenPagePx(p.profile);
  const from = index.sectionStart[section]!;
  const to = index.sectionStart[section + 1]!;
  let height =
    engine.flowUnits(p, from, to) * UNIT_PX +
    engine.breaksIn(p, from, to) * (bottom + PAGE_GAP_PX + top);
  if (section === 0) height += top;
  if (section === index.sectionPos.length - 1)
    height += engine.fillUnits(p, p.pages.length - 1) * UNIT_PX + bottom;
  return height;
}

/**
 * The section's height as it is drawn: sectionHeightPx, less what the pages added since it was left behind with the
 * decorations of earlier pages.
 */
export function drawnHeightPx(state: PaginationState, section: number): number {
  const from = state.index.sectionStart[section]!;
  const behind = state.behind.find((s) => s.from === from);
  return sectionHeightPx(state, section) - (behind?.extraPx ?? 0);
}

/** Pages × page height + (pages − 1) × PAGE_GAP_PX, in px at 100 %. */
export function contentHeightPx(state: PaginationState): number {
  const pages = state.pagination.pages.length;
  return (
    pages * screenPagePx(state.pagination.profile).height +
    (pages - 1) * PAGE_GAP_PX
  );
}
