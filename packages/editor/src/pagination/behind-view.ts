// The page's side of the sections left behind: it says which blocks are shown, and asks for the rest while idle.
import type { EditorView } from "prosemirror-view";
import { BEHIND_BLOCKS_PER_PASS } from "../page/config.ts";
import { drawRequest } from "./behind.ts";
import type { BehindSection } from "./behind.ts";
import { isSameRanges, overlapRanges } from "./block-ranges.ts";
import type { BlockRange } from "./block-ranges.ts";
import type { PaginationOptions, PaginationState } from "./plugin.ts";

// The first of `elements`, laid out top to bottom, whose box ends below `top`; found by halving.
function firstEndingBelow(elements: HTMLCollection, top: number): number {
  let low = 0;
  let high = elements.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (elements[mid]!.getBoundingClientRect().bottom > top) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** The blocks of the sections within one viewport's height of `scroller`'s viewport, as one run; none when there is none. */
function shownBlocks(
  view: EditorView,
  scroller: Element,
  state: PaginationState,
): BlockRange[] {
  const sections = view.dom.children;
  const { sectionStart } = state.index;
  if (sections.length !== sectionStart.length - 1) return [];
  const box = scroller.getBoundingClientRect();
  const first = firstEndingBelow(sections, box.top - box.height);
  let last = first;
  while (
    last < sections.length &&
    sections[last]!.getBoundingClientRect().top < box.bottom + box.height
  )
    last++;
  return first < last
    ? [{ from: sectionStart[first]!, to: sectionStart[last]! }]
    : [];
}

// The first sections left behind, of at most BEHIND_BLOCKS_PER_PASS blocks together, and the first however long it is.
function nextPass(behind: readonly BehindSection[]): BehindSection[] {
  let blocks = 0;
  return behind.filter((s, i) => {
    blocks += s.to - s.from;
    return i === 0 || blocks <= BEHIND_BLOCKS_PER_PASS;
  });
}

/**
 * Draws the sections left behind: after each update and each scroll it draws those shown at once, and while the page
 * is idle it says which blocks are shown and asks for the next few.
 */
export function behindDrawer(
  view: EditorView,
  options: Pick<PaginationOptions, "defer" | "whenIdle"> & {
    own: () => PaginationState;
    scroller: () => Element;
  },
): { update(): void; destroy(): void } {
  // a port is called without a receiver: queueMicrotask and requestIdleCallback refuse any other
  const { defer, whenIdle, own } = options;
  let asking = false;
  let idling = false;
  const isQuiet = () => !view.isDestroyed && !view.composing && !own().frozen;
  const shownNow = () => shownBlocks(view, options.scroller(), own());
  // while idle: says which blocks are shown when that changed, and asks for the next sections left behind
  const whenIdleAsk = () => {
    if (idling || whenIdle === undefined) return;
    idling = true;
    whenIdle(() => {
      idling = false;
      if (!isQuiet()) return;
      const shown = shownNow();
      const idle = nextPass(own().behind);
      if (idle.length > 0 || !isSameRanges(shown, own().shown))
        view.dispatch(drawRequest(view.state.tr, { shown, idle }));
    });
  };
  // a section left behind that is shown is drawn at once; anything else waits until the page is idle
  const ask = () => {
    if (asking) return;
    asking = true;
    defer(() => {
      asking = false;
      if (!isQuiet()) return;
      const shown = shownNow();
      if (own().behind.some((s) => overlapRanges([s], shown).length > 0))
        view.dispatch(drawRequest(view.state.tr, { shown, idle: [] }));
      else if (own().behind.length > 0 || !isSameRanges(shown, own().shown))
        whenIdleAsk();
    });
  };
  const doc = view.dom.ownerDocument;
  // a scroll of any element, heard before the scroller's own listeners: the scroller is whatever holds the page
  doc.addEventListener("scroll", ask, { capture: true, passive: true });
  return {
    update: ask,
    destroy() {
      doc.removeEventListener("scroll", ask, { capture: true });
    },
  };
}
