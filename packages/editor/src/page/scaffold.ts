// The page's frame: a zoomed container over one sheet per page in view, beneath the editable document.

import type { PageProfile } from "@manent/pagination";
import {
  CONTAINMENT,
  PAGE_GAP_PX,
  SHEET_NEIGHBOURS,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./config.ts";
import type { BrowserEngine, LayoutView } from "./config.ts";
import {
  applyFurnitureReplaces,
  isSameFurniture,
} from "./furniture/page-furniture.ts";
import type {
  PageFurniture,
  PageFurnitureInput,
  PageFurnitureOptions,
  SheetRevision,
} from "./furniture/page-furniture.ts";
import { PAGE_FURNITURE } from "./furniture/registry.ts";
import { PAGE_CSS, REFLOW_CSS } from "./page-css.ts";
import { profileCss, screenPagePx } from "./profile-css.ts";

/** The class the EditorView's own element carries. */
export const PAGE_VIEW_CLASS = "mn-page-view";

/** A user agent naming no engine this build knows is read as Chromium. */
export function detectEngine(userAgent: string): BrowserEngine {
  if (userAgent.includes("Firefox/")) return "firefox";
  const chromium =
    userAgent.includes("Chrome/") || userAgent.includes("Chromium/");
  return userAgent.includes("AppleWebKit/") && !chromium
    ? "webkit"
    : "chromium";
}

/** The scale and the zoomed size of the content, the percentage clamped to the zoom limits. */
export function zoomBox(
  pageWidthPx: number,
  contentHeightPx: number,
  percent: number,
): { scale: number; widthPx: number; heightPx: number } {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, percent)) / 100;
  return {
    scale,
    widthPx: pageWidthPx * scale,
    heightPx: contentHeightPx * scale,
  };
}

/**
 * The sheets to draw: every page the viewport shows and `SHEET_NEIGHBOURS` on each side. The scroll offset and
 * the viewport are zoomed pixels; each `top` is unzoomed, as the sheet is placed inside the zoomed container.
 */
export function visibleSheets(
  pageCount: number,
  pageHeightPx: number,
  gapPx: number,
  scrollTop: number,
  viewportHeight: number,
  scale: number,
): { index: number; top: number }[] {
  const pitch = pageHeightPx + gapPx;
  const top = scrollTop / scale;
  const bottom = (scrollTop + viewportHeight) / scale;
  const first = Math.floor((top - pageHeightPx) / pitch) + 1 - SHEET_NEIGHBOURS;
  const last = Math.ceil(bottom / pitch) - 1 + SHEET_NEIGHBOURS;
  const sheets: { index: number; top: number }[] = [];
  for (
    let index = Math.max(0, first);
    index <= Math.min(pageCount - 1, last);
    index++
  ) {
    sheets.push({ index, top: index * pitch });
  }
  return sheets;
}

/** What a sheet shows of a revision. `key` changes whenever any sheet would. */
export interface SheetDecor {
  readonly key: string;
  /** Null: the sheet shows nothing of a revision. */
  sheet(index: number): SheetRevision | null;
}

export interface PageScaffold {
  /** `.mn-pages`: the EditorView is mounted here, after the sheets. */
  readonly pages: HTMLElement;
  /** `.mn-front`, first in `.mn-pages`: where the pages before page 1 are drawn, above page 1. */
  readonly front: HTMLElement;
  /** The height the front pages take above page 1, gaps included, px at 100 %. */
  setFrontHeight(px: number): void;
  setProfile(profile: PageProfile): void;
  /** Sizes the scroll area and draws the sheets. */
  setPageCount(count: number): void;
  applyZoom(percent: number): void;
  /** Room above the first page, px, so that a zoom can keep a line still where the view cannot scroll back. */
  setRoomAbove(px: number): void;
  setFontState(state: "loading" | "ready" | "fallback"): void;
  /** What a sheet shows of a revision; null: nothing. */
  setSheetDecor(decor: SheetDecor | null): void;
  setFurniture(furniture: PageFurnitureOptions): void;
  setPageLabels(labels: readonly string[]): void;
  /** `data-tint="on"` on `.mn-pages`, or removed. */
  setTint(on: boolean): void;
  destroy(): void;
}

interface SheetFrame {
  count: number;
  decor: SheetDecor | null;
  furniture: PageFurnitureOptions;
  labels: readonly string[];
  entries: readonly PageFurniture[];
}

/**
 * Places the sheet, and draws its furniture afresh, each entry in `entries` in turn, only when it would show
 * something other than what `drawn` says it was last drawn with: another person's typing redraws only the sheets it
 * changed.
 */
function drawSheet(
  sheet: HTMLElement,
  at: { index: number; top: number },
  frame: SheetFrame,
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  sheet.dataset["page"] = String(at.index);
  sheet.style.top = `${at.top}px`;
  const { furniture, labels } = frame;
  const input: PageFurnitureInput = {
    pageIndex: at.index,
    pageCount: frame.count,
    pageLabel: labels[at.index] ?? null,
    profile,
    title: furniture.title ?? null,
    revision: frame.decor?.sheet(at.index) ?? null,
    watermark: furniture.watermark ?? null,
    header: furniture.header ?? null,
    footer: furniture.footer ?? null,
    dateFormat: furniture.dateFormat ?? null,
    section: furniture.sections?.[at.index] ?? furniture.section ?? null,
    revisionLabel: furniture.revisionLabel ?? null,
    day: furniture.day ?? null,
    durationMs: furniture.durationMs ?? null,
  };
  if (isSameFurniture(drawn.get(sheet), input)) return;
  drawn.set(sheet, input);
  for (const key of Object.keys(sheet.dataset))
    if (key !== "page") delete sheet.dataset[key];
  sheet.replaceChildren();
  for (const entry of frame.entries) entry.draw(sheet, input);
}

/** Draws the wanted sheets with the elements already drawn, adding or removing only the difference. */
function drawSheets(
  pages: HTMLElement,
  sheets: HTMLElement[],
  wanted: readonly { index: number; top: number }[],
  frame: SheetFrame,
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  while (sheets.length > wanted.length) sheets.pop()?.remove();
  while (sheets.length < wanted.length) {
    const sheet = pages.ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    pages.prepend(sheet);
    sheets.push(sheet);
  }
  wanted.forEach((at, i) => drawSheet(sheets[i]!, at, frame, profile, drawn));
}

// In Reflow view the text wraps to the desk, so its sections are never contained: the engine's heights do not hold.
function createFrame(
  place: HTMLElement,
  engine: BrowserEngine,
  view: LayoutView,
): {
  zoom: HTMLElement;
  profileStyle: HTMLElement;
  front: HTMLElement;
  pages: HTMLElement;
} {
  const doc = place.ownerDocument;
  const zoom = doc.createElement("div");
  zoom.className = view === "reflow" ? "mn-zoom mn-reflow" : "mn-zoom";
  const pageStyle = doc.createElement("style");
  pageStyle.textContent = view === "reflow" ? PAGE_CSS + REFLOW_CSS : PAGE_CSS;
  const profileStyle = doc.createElement("style");
  const pages = doc.createElement("div");
  pages.className = "mn-pages fonts-loading";
  pages.classList.toggle("no-cv", !CONTAINMENT[engine] || view === "reflow");
  const front = doc.createElement("div");
  front.className = "mn-front";
  pages.append(front);
  zoom.append(pageStyle, profileStyle, pages);
  place.append(zoom);
  return { zoom, profileStyle, front, pages };
}

/**
 * Sizes the scroll area to the zoomed content and scales the pages, the front pages above page 1 included; returns
 * the scale. In Reflow view the frame takes the desk's width and the content's height, scaled by `zoom`.
 */
function sizeFrame(
  frame: { zoom: HTMLElement; front: HTMLElement; pages: HTMLElement },
  page: { width: number; height: number },
  heights: { count: number; frontPx: number; view: LayoutView },
  percent: number,
): number {
  const { zoom, front, pages } = frame;
  const { count, frontPx } = heights;
  const contentHeight =
    frontPx + count * page.height + (count - 1) * PAGE_GAP_PX;
  const box = zoomBox(page.width, contentHeight, percent);
  if (heights.view === "reflow") {
    zoom.style.zoom = String(box.scale);
    return box.scale;
  }
  zoom.style.width = `${box.widthPx}px`;
  zoom.style.height = `${box.heightPx}px`;
  front.style.top = `${-frontPx}px`;
  pages.style.top = `${frontPx * box.scale}px`;
  pages.style.transform = `scale(${box.scale})`;
  return box.scale;
}

/** The nearest scrollable ancestor of `place`, or `place` itself when none scrolls (e.g. a detached test host). */
function scrollContainerOf(place: HTMLElement): HTMLElement {
  if (typeof getComputedStyle === "function") {
    for (
      let at: HTMLElement | null = place;
      at !== null;
      at = at.parentElement
    ) {
      const { overflowY } = getComputedStyle(at);
      if (overflowY === "auto" || overflowY === "scroll") return at;
    }
  }
  return place;
}

/**
 * Builds `place > div.mn-zoom > div.mn-pages` with the page's styles. Every page is a full sheet, so the content's
 * height comes from the page count and is never measured.
 */
export function createPageScaffold(options: {
  place: HTMLElement;
  profile: PageProfile;
  engine: BrowserEngine;
  /** Default "page". */
  view?: LayoutView;
  furniture?: PageFurnitureOptions;
  /** Default `PAGE_FURNITURE`. */
  furnitureEntries?: readonly PageFurniture[];
}): PageScaffold {
  const { place } = options;
  const scroller = scrollContainerOf(place);
  const view = options.view ?? "page";
  const entries = options.furnitureEntries ?? PAGE_FURNITURE;
  const frame = createFrame(place, options.engine, view);
  const { zoom, profileStyle, front, pages } = frame;
  applyFurnitureReplaces(pages, entries);
  let profile = options.profile;
  let count = 1;
  let frontPx = 0;
  let percent = 100;
  let scale = 1;
  let decor: SheetDecor | null = null;
  let furniture: PageFurnitureOptions = options.furniture ?? {};
  let labels: readonly string[] = [];
  let lastScrollTop = 0;
  let lastClientHeight = 0;
  let placed: readonly { index: number; top: number }[] = [];
  const sheets: HTMLElement[] = [];
  const drawn = new WeakMap<HTMLElement, PageFurnitureInput>();

  const redrawPlaced = (): void => {
    drawSheets(
      pages,
      sheets,
      placed,
      { count, decor, furniture, labels, entries },
      profile,
      drawn,
    );
  };
  const redrawAt = (scrollTop: number, clientHeight: number): void => {
    lastScrollTop = scrollTop;
    lastClientHeight = clientHeight;
    const page = screenPagePx(profile);
    // The scroll offset counts from the frame's top, and the front pages sit above page 1.
    placed =
      view === "reflow"
        ? []
        : visibleSheets(
            count,
            page.height,
            PAGE_GAP_PX,
            scrollTop - frontPx * scale,
            clientHeight,
            scale,
          );
    redrawPlaced();
  };
  const redraw = (): void =>
    redrawAt(scroller.scrollTop, scroller.clientHeight);
  const layoutAt = (scrollTop: number, clientHeight: number): void => {
    const page = screenPagePx(profile);
    scale = sizeFrame(frame, page, { count, frontPx, view }, percent);
    redrawAt(scrollTop, clientHeight);
  };
  const layout = (): void =>
    layoutAt(scroller.scrollTop, scroller.clientHeight);
  const setProfile = (next: PageProfile): void => {
    profile = next;
    profileStyle.textContent = profileCss(next);
    layout();
  };

  scroller.addEventListener("scroll", redraw, { passive: true });
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(redraw);
  resizeObserver?.observe(scroller);
  setProfile(profile);
  return {
    pages,
    front,
    setProfile,
    setFrontHeight(px) {
      if (px === frontPx) return;
      frontPx = px;
      layout();
    },
    setPageCount(next) {
      count = next;
      if (lastClientHeight > 0) layoutAt(lastScrollTop, lastClientHeight);
      else layout();
    },
    applyZoom(next) {
      percent = next;
      layout();
    },
    setRoomAbove(px) {
      zoom.style.marginTop = px > 0 ? `${px}px` : "";
    },
    setFontState(state) {
      pages.classList.toggle("fonts-loading", state === "loading");
    },
    setSheetDecor(next) {
      if (next?.key === decor?.key) return;
      decor = next;
      redrawPlaced();
    },
    setFurniture(next) {
      furniture = next;
      redrawPlaced();
    },
    setPageLabels(next) {
      labels = next;
      redrawPlaced();
    },
    setTint(on) {
      if (on) pages.dataset["tint"] = "on";
      else delete pages.dataset["tint"];
    },
    destroy() {
      scroller.removeEventListener("scroll", redraw);
      resizeObserver?.disconnect();
      zoom.remove();
    },
  };
}
