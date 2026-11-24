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
import type {
  PageFurnitureInput,
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
  /** `data-tint="on"` on `.mn-pages`, or removed. */
  setTint(on: boolean): void;
  destroy(): void;
}

const isSameRevision = (
  a: SheetRevision | null,
  b: SheetRevision | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.rev === b.rev &&
    a.head === b.head &&
    a.marks.length === b.marks.length &&
    a.marks.every(
      (m, i) => m.y === b.marks[i]!.y && m.text === b.marks[i]!.text,
    ));

// The fields a sheet is drawn from; every other field of its input is null.
const isSameFurniture = (
  a: PageFurnitureInput | undefined,
  b: PageFurnitureInput,
): boolean =>
  a !== undefined &&
  a.pageIndex === b.pageIndex &&
  a.pageCount === b.pageCount &&
  a.profile === b.profile &&
  isSameRevision(a.revision, b.revision);

/**
 * Places the sheet, and draws its furniture afresh, each entry of `PAGE_FURNITURE` in turn, only when it would show
 * something other than what `drawn` says it was last drawn with: another person's typing redraws only the sheets it
 * changed.
 */
function drawSheet(
  sheet: HTMLElement,
  at: { index: number; top: number },
  frame: { count: number; decor: SheetDecor | null },
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  sheet.dataset["page"] = String(at.index);
  sheet.style.top = `${at.top}px`;
  const input: PageFurnitureInput = {
    pageIndex: at.index,
    pageCount: frame.count,
    pageLabel: null,
    profile,
    title: null,
    revision: frame.decor?.sheet(at.index) ?? null,
    watermark: null,
    header: null,
    footer: null,
    dateFormat: null,
    section: null,
    revisionLabel: null,
    day: null,
  };
  if (isSameFurniture(drawn.get(sheet), input)) return;
  drawn.set(sheet, input);
  for (const key of Object.keys(sheet.dataset))
    if (key !== "page") delete sheet.dataset[key];
  sheet.replaceChildren();
  for (const entry of PAGE_FURNITURE) entry.draw(sheet, input);
}

// The scroll offset counts from the frame's top, and the front pages sit above page 1.
function sheetsInView(
  place: HTMLElement,
  page: { width: number; height: number },
  frame: { count: number; scale: number; frontPx: number },
): { index: number; top: number }[] {
  const { scrollTop, clientHeight } = place;
  return visibleSheets(
    frame.count,
    page.height,
    PAGE_GAP_PX,
    scrollTop - frame.frontPx * frame.scale,
    clientHeight,
    frame.scale,
  );
}

/** Draws the wanted sheets with the elements already drawn, adding or removing only the difference. */
function drawSheets(
  pages: HTMLElement,
  sheets: HTMLElement[],
  wanted: readonly { index: number; top: number }[],
  frame: { count: number; decor: SheetDecor | null },
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
}): PageScaffold {
  const { place } = options;
  const view = options.view ?? "page";
  const frame = createFrame(place, options.engine, view);
  const { zoom, profileStyle, front, pages } = frame;
  let profile = options.profile;
  let count = 1;
  let frontPx = 0;
  let percent = 100;
  let scale = 1;
  let decor: SheetDecor | null = null;
  const sheets: HTMLElement[] = [];
  const drawn = new WeakMap<HTMLElement, PageFurnitureInput>();

  const redraw = (): void => {
    const page = screenPagePx(profile);
    const wanted =
      view === "reflow"
        ? []
        : sheetsInView(place, page, { count, scale, frontPx });
    drawSheets(pages, sheets, wanted, { count, decor }, profile, drawn);
  };
  const layout = (): void => {
    const page = screenPagePx(profile);
    scale = sizeFrame(frame, page, { count, frontPx, view }, percent);
    redraw();
  };
  const setProfile = (next: PageProfile): void => {
    profile = next;
    profileStyle.textContent = profileCss(next);
    layout();
  };

  place.addEventListener("scroll", redraw, { passive: true });
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
      layout();
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
      redraw();
    },
    setTint(on) {
      if (on) pages.dataset["tint"] = "on";
      else delete pages.dataset["tint"];
    },
    destroy() {
      place.removeEventListener("scroll", redraw);
      zoom.remove();
    },
  };
}
