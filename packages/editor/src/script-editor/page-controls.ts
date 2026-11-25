// What the editor reads of the laid-out page, and a paged editor's profile and zoom.
import { pageSizePx } from "@manent/pagination";
import type { Engine, PageProfile } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { blockNumber } from "../cursors/place.ts";
import { ZOOM_MAX, ZOOM_MIN } from "../page/config.ts";
import type { LayoutView } from "../page/config.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import { caretPlace, pageAtPos } from "../pagination/caret.ts";
import { paginationKey, setPagination } from "../pagination/plugin.ts";
import type { ScrollPorts } from "../scroll/stability.ts";
import { isInView } from "../scroll/typewriter.ts";
import { fitWidthPercent } from "./zoom.ts";
import type { ZoomSetting } from "./zoom.ts";

/** The nearest of `place` and its ancestors that scrolls, else the document's scroller; the pagination plugin is given the same. */
function scrollerOf(place: HTMLElement): HTMLElement {
  for (let at: HTMLElement | null = place; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  const { scrollingElement, documentElement } = place.ownerDocument;
  return scrollingElement instanceof HTMLElement
    ? scrollingElement
    : documentElement;
}

/** The viewport top of the block that starts at `pos`, px; null when it is not rendered. */
function topOf(view: EditorView, pos: number): number | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom.getBoundingClientRect().top : null;
}

/** The position under the page's middle at viewport height `top`; null where there is none. */
function posAtHeight(view: EditorView, top: number): number | null {
  const box = view.dom.getBoundingClientRect();
  return view.posAtCoords({ left: box.left + box.width / 2, top })?.pos ?? null;
}

/** The block under the page's middle at viewport height `top`: its index, where it starts and its viewport top. */
function blockAtHeight(
  view: EditorView,
  top: number,
): { block: number; pos: number; top: number } | null {
  const at = posAtHeight(view, top);
  if (at === null) return null;
  const $pos = view.state.doc.resolve(at);
  if ($pos.depth < 2) return null;
  const pos = $pos.before(2);
  const blockTop = topOf(view, pos);
  return blockTop === null
    ? null
    : { block: blockNumber(view.state, $pos), pos, top: blockTop };
}

/** The index of the page under the page's middle at viewport height `top`; null without pages or where there is none. */
export function pageAtHeight(view: EditorView, top: number): number | null {
  const at = posAtHeight(view, top);
  return at === null ? null : pageAtPos(view.state, at);
}

// The first of `elements`, laid out top to bottom, whose box ends below `top`; found by halving.
function firstEndingBelow(
  elements: ArrayLike<Element>,
  top: number,
): Element | null {
  let low = 0;
  let high = elements.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (elements[mid]!.getBoundingClientRect().bottom > top) high = mid;
    else low = mid + 1;
  }
  return elements[low] ?? null;
}

/** The block across viewport height `top`, or the first below it: its index and viewport top. */
function blockAcross(
  view: EditorView,
  top: number,
): { block: number; top: number } | null {
  const section = firstEndingBelow(view.dom.children, top);
  const block =
    section === null
      ? null
      : firstEndingBelow(section.querySelectorAll(":scope > p.el"), top);
  if (block === null) return null;
  const $pos = view.state.doc.resolve(view.posAtDOM(block, 0));
  return {
    block: blockNumber(view.state, $pos),
    top: block.getBoundingClientRect().top,
  };
}

/** Where block `block` starts, counted in document order; without pages there is no index, so the blocks before it are counted. */
function flowBlockStart(doc: Node, block: number): number | null {
  let rest = block;
  let pos = 0;
  for (const section of doc.children) {
    if (rest < section.childCount) {
      let at = pos + 1;
      for (let i = 0; i < rest; i++) at += section.child(i).nodeSize;
      return at;
    }
    rest -= section.childCount;
    pos += section.nodeSize;
  }
  return null;
}

export function createScrollPorts(
  place: HTMLElement,
  zoom: () => number,
): ScrollPorts {
  return {
    scroller: () => scrollerOf(place),
    zoom,
    caretTop: (view) => caretPlace(view)?.top ?? null,
    topBlock(view) {
      const edge = scrollerOf(place).getBoundingClientRect().top;
      // between two pages the point lands in no block
      const found = blockAtHeight(view, edge + 1) ?? blockAcross(view, edge);
      return found === null
        ? null
        : { block: found.block, offsetPx: edge - found.top };
    },
    blockTop(view, block) {
      const pos = flowBlockStart(view.state.doc, block);
      return pos === null ? null : topOf(view, pos);
    },
  };
}

/** What a zoom keeps still: the caret's line when it is in view, else the block at the viewport's centre. */
function zoomAnchor(
  view: EditorView,
  ports: ScrollPorts,
): { readonly top: number; read(): number | null } | null {
  const scroller = ports.scroller();
  const caret = ports.caretTop(view);
  if (isInView(scroller, caret))
    return { top: caret, read: () => ports.caretTop(view) };
  const box = scroller.getBoundingClientRect();
  const centre = blockAtHeight(view, box.top + box.height / 2);
  return centre === null
    ? null
    : { top: centre.top, read: () => topOf(view, centre.pos) };
}

/** The place's inner width and horizontal padding at 100 %, px, and its resizes. */
export interface Desk {
  widthPx(): number;
  paddingPx(): number;
  observe(listener: () => void): () => void;
}

export interface PageControls {
  /** The zoom last given to the scaffold. */
  readonly percent: number;
  /** Sends the profile the settings give now, when it differs. */
  repage(): void;
  setZoom(zoom: ZoomSetting): void;
  destroy(): void;
}

/**
 * A paged editor's profile and zoom. A new profile is a meta-only transaction; a zoom scales the page around its
 * anchor and scrolls in the same frame so the anchor stays where it was, with room added above the first page when
 * the view cannot scroll back far enough, and dispatches nothing.
 */
export function createPageControls(options: {
  view: EditorView;
  scaffold: PageScaffold;
  ports: ScrollPorts;
  desk: Desk;
  zoom: ZoomSetting;
  /** In Reflow view the text wraps to the window at any zoom, so Fit width is 100 %. */
  layoutView: LayoutView;
  engine(): Engine;
  profile(): PageProfile | null;
}): PageControls {
  const { view, scaffold, ports, desk } = options;
  let setting = options.zoom;
  let percent = 100;
  const profileNow = () => paginationKey.getState(view.state)!.settings.profile;
  const percentNow = (): number => {
    if (setting !== "fit_width")
      return Math.min(Math.max(setting, ZOOM_MIN), ZOOM_MAX);
    if (options.layoutView === "reflow") return 100;
    return fitWidthPercent(
      desk.widthPx(),
      pageSizePx(profileNow()).width,
      desk.paddingPx(),
    );
  };
  // room added above the first page, px, where keeping the anchor still needed scroll the view did not have
  let room = 0;
  const scrollBy = (shiftPx: number): void => {
    const scroller = ports.scroller();
    // the room gives way before the view scrolls down
    const given = Math.min(room, Math.max(shiftPx, 0));
    const scrollTop = scroller.scrollTop + shiftPx - given;
    room += Math.max(-scrollTop, 0) - given;
    scaffold.setRoomAbove(room);
    scroller.scrollTop = Math.max(scrollTop, 0);
  };
  const fit = (): void => {
    const next = percentNow();
    if (next === percent) return;
    const anchor = zoomAnchor(view, ports);
    percent = next;
    scaffold.applyZoom(next);
    const top = anchor?.read() ?? null;
    if (anchor !== null && top !== null) scrollBy(top - anchor.top);
  };
  const unobserve = desk.observe(fit);
  fit();
  return {
    get percent() {
      return percent;
    },
    repage() {
      const nextEngine = options.engine();
      const nextProfile = options.profile();
      // a format to or from Ink: whoever mounted the editor builds it again
      if (nextProfile === null) return;
      const current = paginationKey.getState(view.state)!.settings;
      if (
        nextEngine === current.engine &&
        nextProfile.key === current.profile.key
      ) {
        return;
      }
      scaffold.setProfile(nextProfile);
      view.dispatch(
        setPagination(view.state.tr, {
          engine: nextEngine,
          profile: nextProfile,
        }).setMeta("addToHistory", false),
      );
      fit();
    },
    setZoom(zoom) {
      setting = zoom;
      fit();
    },
    destroy: unobserve,
  };
}
