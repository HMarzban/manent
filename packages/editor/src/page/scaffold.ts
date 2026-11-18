// The page's frame: a zoomed container over one sheet per page in view, beneath the editable document.

import { CELL_PX, UNIT_PX, pageSizePx } from "@manent/pagination";
import type { PageProfile } from "@manent/pagination";
import {
  CONTAINMENT,
  PAGE_GAP_PX,
  SHEET_NEIGHBOURS,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./config.ts";
import type { BrowserEngine } from "./config.ts";
import { PAGE_CSS } from "./page-css.ts";
import { profileCss } from "./profile-css.ts";

/** The class the EditorView's own element carries. */
export const PAGE_VIEW_CLASS = "mn-page-view";

/** CSS pixels in a point. */
const PX_PER_PT = 4 / 3;
/** Cells past the column's right edge where a revision mark is drawn. */
const MARK_GAP_CELLS = 7;

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

interface SheetRevision {
  rev: string;
  head: string;
  marks: readonly { y: number; text: string }[];
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
  setProfile(profile: PageProfile): void;
  /** Sizes the scroll area and draws the sheets. */
  setPageCount(count: number): void;
  applyZoom(percent: number): void;
  setFontState(state: "loading" | "ready" | "fallback"): void;
  /** What a sheet shows of a revision; null: nothing. */
  setSheetDecor(decor: SheetDecor | null): void;
  /** `data-tint="on"` on `.mn-pages`, or removed. */
  setTint(on: boolean): void;
  destroy(): void;
}

function drawSheet(
  sheet: HTMLElement,
  at: { index: number; top: number },
  shown: SheetRevision | null,
  profile: PageProfile,
): void {
  sheet.dataset["page"] = String(at.index);
  sheet.style.top = `${at.top}px`;
  if (shown === null) {
    delete sheet.dataset["rev"];
    delete sheet.dataset["revHead"];
    sheet.replaceChildren();
    return;
  }
  sheet.dataset["rev"] = shown.rev;
  sheet.dataset["revHead"] = shown.head;
  const g = profile.geometry;
  const left =
    g.marginLeftPt * PX_PER_PT +
    (profile.columnCells + MARK_GAP_CELLS) * CELL_PX;
  sheet.replaceChildren(
    ...shown.marks.map((m) => {
      const mark = sheet.ownerDocument.createElement("span");
      mark.className = "mn-mark";
      mark.dataset["text"] = m.text;
      mark.style.top = `${g.marginTopPt * PX_PER_PT + m.y * UNIT_PX}px`;
      mark.style.left = `${left}px`;
      return mark;
    }),
  );
}

function sheetsInView(
  place: HTMLElement,
  page: { width: number; height: number },
  count: number,
  scale: number,
): { index: number; top: number }[] {
  const { scrollTop, clientHeight } = place;
  return visibleSheets(
    count,
    page.height,
    PAGE_GAP_PX,
    scrollTop,
    clientHeight,
    scale,
  );
}

/** Draws the wanted sheets with the elements already drawn, adding or removing only the difference. */
function drawSheets(
  pages: HTMLElement,
  sheets: HTMLElement[],
  wanted: readonly { index: number; top: number }[],
  decor: SheetDecor | null,
  profile: PageProfile,
): void {
  while (sheets.length > wanted.length) sheets.pop()?.remove();
  while (sheets.length < wanted.length) {
    const sheet = pages.ownerDocument.createElement("div");
    sheet.className = "mn-sheet";
    pages.prepend(sheet);
    sheets.push(sheet);
  }
  wanted.forEach((at, i) =>
    drawSheet(sheets[i]!, at, decor?.sheet(at.index) ?? null, profile),
  );
}

function createFrame(
  place: HTMLElement,
  engine: BrowserEngine,
): { zoom: HTMLElement; profileStyle: HTMLElement; pages: HTMLElement } {
  const doc = place.ownerDocument;
  const zoom = doc.createElement("div");
  zoom.className = "mn-zoom";
  const pageStyle = doc.createElement("style");
  pageStyle.textContent = PAGE_CSS;
  const profileStyle = doc.createElement("style");
  const pages = doc.createElement("div");
  pages.className = "mn-pages fonts-loading";
  pages.classList.toggle("no-cv", !CONTAINMENT[engine]);
  zoom.append(pageStyle, profileStyle, pages);
  place.append(zoom);
  return { zoom, profileStyle, pages };
}

/** Sizes the scroll area to the zoomed content and scales the pages; returns the scale. */
function sizeFrame(
  zoom: HTMLElement,
  pages: HTMLElement,
  page: { width: number; height: number },
  count: number,
  percent: number,
): number {
  const contentHeight = count * page.height + (count - 1) * PAGE_GAP_PX;
  const box = zoomBox(page.width, contentHeight, percent);
  zoom.style.width = `${box.widthPx}px`;
  zoom.style.height = `${box.heightPx}px`;
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
}): PageScaffold {
  const { place } = options;
  const { zoom, profileStyle, pages } = createFrame(place, options.engine);
  let profile = options.profile;
  let count = 1;
  let percent = 100;
  let scale = 1;
  let decor: SheetDecor | null = null;
  const sheets: HTMLElement[] = [];

  const redraw = (): void => {
    const wanted = sheetsInView(place, pageSizePx(profile), count, scale);
    drawSheets(pages, sheets, wanted, decor, profile);
  };
  const layout = (): void => {
    scale = sizeFrame(zoom, pages, pageSizePx(profile), count, percent);
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
    setProfile,
    setPageCount(next) {
      count = next;
      layout();
    },
    applyZoom(next) {
      percent = next;
      layout();
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
