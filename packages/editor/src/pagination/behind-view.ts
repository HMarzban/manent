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
  let destroyed = false;
  let frameId: number | null = null;
  let scrollTarget: EventTarget | null = null;
  let lastSectionCount = own().index.sectionStart.length;
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  const isQuiet = () =>
    !destroyed && !view.isDestroyed && !view.composing && !own().frozen;
  // a section left behind that is shown is drawn on the next frame; anything else waits until the page is idle
  const ask = () => {
    if (asking || destroyed) return;
    asking = true;
    if (win !== null && typeof win.requestAnimationFrame === "function")
      frameId = win.requestAnimationFrame(check);
    else defer(check);
  };
  const bindScroll = (): Element => {
    const scroller = options.scroller();
    if (!destroyed) {
      const target: EventTarget =
        scroller === doc.documentElement || scroller === doc.body
          ? (win ?? doc)
          : scroller;
      if (target !== scrollTarget) {
        scrollTarget?.removeEventListener("scroll", ask);
        scrollTarget = target;
        scrollTarget.addEventListener("scroll", ask, { passive: true });
      }
    }
    return scroller;
  };
  const shownNow = () => shownBlocks(view, bindScroll(), own());
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
  const check = () => {
    asking = false;
    frameId = null;
    if (!isQuiet()) return;
    const state = own();
    lastSectionCount = state.index.sectionStart.length;
    const shown = shownNow();
    if (state.behind.some((s) => overlapRanges([s], shown).length > 0))
      view.dispatch(drawRequest(view.state.tr, { shown, idle: [] }));
    else if (state.behind.length > 0 || !isSameRanges(shown, state.shown))
      whenIdleAsk();
  };
  if (view.dom.isConnected) bindScroll();
  return {
    update() {
      if (view.dom.isConnected) bindScroll();
      const state = own();
      if (
        state.behind.length === 0 &&
        state.shown.length > 0 &&
        state.index.sectionStart.length === lastSectionCount
      )
        return;
      ask();
    },
    destroy() {
      destroyed = true;
      scrollTarget?.removeEventListener("scroll", ask);
      scrollTarget = null;
      if (frameId !== null) {
        win?.cancelAnimationFrame(frameId);
        frameId = null;
      }
      asking = false;
    },
  };
}
