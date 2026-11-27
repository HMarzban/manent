// Pure browser-engine, zoom and visible-sheet geometry helpers for PageScaffold.
import { SHEET_NEIGHBOURS, ZOOM_MAX, ZOOM_MIN } from "./config.ts";
import type { BrowserEngine } from "./config.ts";

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

/** Measured unscaled vertical box of one page inside `.mn-pages`, in px at 100 %. */
export interface PageBox {
  readonly top: number;
  readonly height: number;
}

/** The sheets to draw: every page in view plus `SHEET_NEIGHBOURS` each side (zoomed scroll/viewport, unzoomed tops). */
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
  const end = Math.min(
    pageCount - 1,
    Math.ceil(bottom / pitch) - 1 + SHEET_NEIGHBOURS,
  );
  const sheets: { index: number; top: number }[] = [];
  for (let index = Math.max(0, first); index <= end; index++)
    sheets.push({ index, top: index * pitch });
  return sheets;
}

/** The sheets to draw from measured per-page boxes: every page in view plus `SHEET_NEIGHBOURS` each side (zoomed scroll/viewport, unzoomed boxes). */
export function visibleSheetBoxes(
  boxes: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
  scale: number,
): { index: number; top: number; height: number }[] {
  if (boxes.length === 0) return [];
  const top = scrollTop / scale;
  const bottom = (scrollTop + viewportHeight) / scale;
  let low = 0;
  let high = boxes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const box = boxes[mid]!;
    if (box.top + box.height > top) high = mid;
    else low = mid + 1;
  }
  const first = Math.max(0, low - SHEET_NEIGHBOURS);
  let last = low;
  while (last < boxes.length && boxes[last]!.top < bottom) last++;
  const end = Math.min(
    boxes.length - 1,
    Math.max(first, last - 1 + SHEET_NEIGHBOURS),
  );
  const sheets: { index: number; top: number; height: number }[] = [];
  for (let index = first; index <= end; index++) {
    const box = boxes[index]!;
    sheets.push({ index, top: box.top, height: box.height });
  }
  return sheets;
}

export function isSameBoxes(
  a: readonly PageBox[] | null,
  b: readonly PageBox[] | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++)
    if (a[i]!.top !== b[i]!.top || a[i]!.height !== b[i]!.height) return false;
  return true;
}
