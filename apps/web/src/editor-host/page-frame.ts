// Where the open editor's text column sits in the viewport, for what is drawn over the page from outside it.
import { CELL_PT, CELL_PX } from "@manent/pagination";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { zoomActions } from "../state/zoom.store.ts";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "./live-editor.ts";

/** Viewport px of the column's left edge; px per cell at the current zoom. */
export interface PageFrame {
  readonly textLeftPx: number;
  readonly cellPx: number;
}

const PAGE_REGION = "[data-region='page']";
const PX_PER_PT = CELL_PX / CELL_PT;

const sameFrame = (a: PageFrame | null, b: PageFrame | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.textLeftPx === b.textLeftPx &&
    a.cellPx === b.cellPx);

function measure(docId: string): PageFrame | null {
  const editor = liveEditor(docId);
  const pagination = livePagination(docId);
  if (editor === null || editor.scaffold === null || pagination === null)
    return null;
  const zoom = editor.zoom();
  const marginPx = pagination.profile.geometry.marginLeftPt * PX_PER_PT;
  return {
    textLeftPx:
      editor.scaffold.pages.getBoundingClientRect().left + marginPx * zoom,
    cellPx: CELL_PX * zoom,
  };
}

/**
 * Calls `moved` after each resize of the editor's scroller, each horizontal scroll of it and each new paper or format,
 * which rewrites the page profile's styles beside `.mn-pages` and can move the column without resizing the scroller;
 * returns the stop.
 */
function watchScroller(docId: string, moved: () => void): () => void {
  const zoom = liveEditor(docId)?.scaffold?.pages.parentElement ?? null;
  const scroller = zoom?.closest(PAGE_REGION);
  if (zoom === null || !(scroller instanceof HTMLElement)) return () => {};
  let scrollLeft = scroller.scrollLeft;
  const onScroll = (): void => {
    if (scroller.scrollLeft === scrollLeft) return;
    scrollLeft = scroller.scrollLeft;
    moved();
  };
  const resized = new ResizeObserver(moved);
  resized.observe(scroller);
  const restyled = new MutationObserver(moved);
  // Firefox rewrites a style's text node in place, a change inside the subtree
  for (const style of zoom.querySelectorAll(":scope > style"))
    restyled.observe(style, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  scroller.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    resized.disconnect();
    restyled.disconnect();
    scroller.removeEventListener("scroll", onScroll);
  };
}

/**
 * The text column of `docId`'s paged editor; null while none is open. It is read once per frame after the editor's
 * first frame, a resize of its scroller, a horizontal scroll, a zoom change and a change of paper or format, and only
 * while someone listens: a keystroke never moves the page sideways, so it reads nothing.
 */
export function pageFrame(docId: string): Subscribable<PageFrame | null> {
  const value = createValue<PageFrame | null>(null, sameFrame);
  let listening = 0;
  let stop: (() => void) | null = null;

  const start = (): (() => void) => {
    let frame: number | null = null;
    const request = (): void => {
      frame ??= requestAnimationFrame(() => {
        frame = null;
        value.set(measure(docId));
      });
    };
    let unwatch = watchScroller(docId, request);
    const follow = (): void => {
      unwatch();
      unwatch = watchScroller(docId, request);
      request();
    };
    const stopEditors = subscribeLiveEditors(follow);
    const stopZoom = zoomActions.subscribe(request);
    request();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      unwatch();
      stopEditors();
      stopZoom();
    };
  };

  return {
    get: value.get,
    subscribe(listener) {
      const unsubscribe = value.subscribe(listener);
      listening++;
      stop ??= start();
      return () => {
        unsubscribe();
        listening--;
        if (listening > 0) return;
        stop?.();
        stop = null;
      };
    },
  };
}
