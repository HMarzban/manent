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

/** What a sheet shows of a revision. `key` changes whenever any sheet would. */
export interface SheetDecor {
  readonly key: string;
  /** Null: the sheet shows nothing of a revision. */
  sheet(index: number): SheetRevision | null;
}

export interface PageScaffold {
  readonly pages: HTMLElement;
  readonly front: HTMLElement;
  setFrontHeight(px: number): void;
  setProfile(profile: PageProfile): void;
  setPageCount(count: number): void;
  applyZoom(percent: number): void;
  setRoomAbove(px: number): void;
  setFontState(state: "loading" | "ready" | "fallback"): void;
  setSheetDecor(decor: SheetDecor | null): void;
  setFurniture(furniture: PageFurnitureOptions): void;
  setPageLabels(labels: readonly string[]): void;
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

/** Places the sheet and redraws its furniture only when `input` differs from `drawn`. */
function drawSheet(
  sheet: HTMLElement,
  at: { index: number; top: number },
  frame: SheetFrame,
  profile: PageProfile,
  drawn: WeakMap<HTMLElement, PageFurnitureInput>,
): void {
  const page = String(at.index);
  if (sheet.dataset["page"] !== page) sheet.dataset["page"] = page;
  const top = `${at.top}px`;
  if (sheet.style.top !== top) sheet.style.top = top;
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

interface ScaffoldBatch {
  depth: number;
  readonly flushers: Set<() => void>;
}

/** Per-scaffold listeners notified when drawn sheets or zoom change, avoiding redundant MutationObservers. */
export const sheetListeners = new WeakMap<HTMLElement, Set<() => void>>();

// per-host batch stack so nested editor setup (mountPageView + createScriptEditor) draws visible sheets once
const scaffoldBatches = new WeakMap<HTMLElement, ScaffoldBatch>();

/** Defers scaffold layout and sheet drawing for `place` until `run` completes, then flushes once. */
export function withBatchedScaffold<T>(place: HTMLElement, run: () => T): T {
  const batch = scaffoldBatches.get(place) ?? { depth: 0, flushers: new Set() };
  scaffoldBatches.set(place, batch);
  batch.depth += 1;
  try {
    return run();
  } finally {
    if (--batch.depth === 0) {
      scaffoldBatches.delete(place);
      for (const flush of batch.flushers) flush();
    }
  }
}

// In Reflow view the text wraps to the desk, so its sections are never contained: the engine's heights do not hold.
function createFrame(
  place: HTMLElement,
  engine: BrowserEngine,
  view: LayoutView,
  fontsLoading: boolean,
) {
  const doc = place.ownerDocument;
  const zoom = doc.createElement("div");
  zoom.className = view === "reflow" ? "mn-zoom mn-reflow" : "mn-zoom";
  const pageStyle = doc.createElement("style");
  pageStyle.textContent = view === "reflow" ? PAGE_CSS + REFLOW_CSS : PAGE_CSS;
  const profileStyle = doc.createElement("style");
  const pages = doc.createElement("div");
  pages.className = fontsLoading ? "mn-pages fonts-loading" : "mn-pages";
  pages.classList.toggle("no-cv", !CONTAINMENT[engine] || view === "reflow");
  const front = doc.createElement("div");
  front.className = "mn-front";
  pages.append(front);
  zoom.append(pageStyle, profileStyle, pages);
  place.append(zoom);
  return { zoom, profileStyle, front, pages };
}

/** Sizes the scroll area to the zoomed content and scales the pages; returns the scale. */
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
  pages.dataset["zoom"] = String(box.scale);
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
  if (typeof getComputedStyle !== "function") return place;
  for (let at: HTMLElement | null = place; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  return place;
}

/** Builds `place > div.mn-zoom > div.mn-pages` with the page's styles. */
export function createPageScaffold(options: {
  place: HTMLElement;
  profile: PageProfile;
  engine: BrowserEngine;
  view?: LayoutView;
  furniture?: PageFurnitureOptions;
  furnitureEntries?: readonly PageFurniture[];
  initialFontState?: "loading" | "ready" | "fallback";
}): PageScaffold {
  const { place } = options;
  const scroller = scrollContainerOf(place);
  const view = options.view ?? "page";
  const entries = options.furnitureEntries ?? PAGE_FURNITURE;
  const frame = createFrame(
    place,
    options.engine,
    view,
    (options.initialFontState ?? "loading") === "loading",
  );
  const { zoom, profileStyle, front, pages } = frame;
  const listeners = new Set<() => void>();
  sheetListeners.set(pages, listeners);
  applyFurnitureReplaces(pages, entries);
  let profile = options.profile;
  let count = 1;
  let frontPx = 0;
  let percent = 100;
  let scale = 1;
  let decor: SheetDecor | null = null;
  let furniture: PageFurnitureOptions = options.furniture ?? {};
  let labels: readonly string[] = [];
  let viewBox: { top: number; height: number } | null = null;
  let placed: readonly { index: number; top: number }[] = [];
  let dirty: "none" | "redraw" | "layout" = "none";
  let destroyed = false;
  let lastPagesKey = "";
  const sheets: HTMLElement[] = [];
  const drawn = new WeakMap<HTMLElement, PageFurnitureInput>();

  const drawPlaced = (): void => {
    const f: SheetFrame = { count, decor, furniture, labels, entries };
    drawSheets(pages, sheets, placed, f, profile, drawn);
    const nextKey = `${scale}|${placed.map((w) => w.index).join(",")}`;
    if (nextKey === lastPagesKey) return;
    lastPagesKey = nextKey;
    for (const fn of listeners) fn();
  };
  const redrawAt = (top: number, height: number): void => {
    viewBox = { top, height };
    const h = screenPagePx(profile).height;
    const offset = top - frontPx * scale;
    placed =
      view === "reflow"
        ? []
        : visibleSheets(count, h, PAGE_GAP_PX, offset, height, scale);
    drawPlaced();
  };
  const applyLayout = (top: number, height: number): void => {
    const dims = { count, frontPx, view };
    scale = sizeFrame(frame, screenPagePx(profile), dims, percent);
    redrawAt(top, height);
  };
  const flush = (): void => {
    if (destroyed) return;
    const mode = dirty;
    dirty = "none";
    const { scrollTop, clientHeight } = scroller;
    if (mode === "layout") applyLayout(scrollTop, clientHeight);
    else if (mode === "redraw") redrawAt(scrollTop, clientHeight);
  };
  const defer = (kind: "layout" | "redraw"): boolean => {
    const batch = scaffoldBatches.get(place);
    if (batch === undefined) return false;
    if (kind === "layout" || dirty === "none") dirty = kind;
    batch.flushers.add(flush);
    return true;
  };
  const redraw = (): void => {
    if (!destroyed && !defer("redraw"))
      redrawAt(scroller.scrollTop, scroller.clientHeight);
  };
  const redrawInPlace = (): void => {
    if (!destroyed && !defer("redraw")) drawPlaced();
  };
  const layout = (): void => {
    if (!destroyed && !defer("layout"))
      applyLayout(scroller.scrollTop, scroller.clientHeight);
  };
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
      if (destroyed || defer("layout")) return;
      if (viewBox !== null && viewBox.height > 0)
        applyLayout(viewBox.top, viewBox.height);
      else applyLayout(scroller.scrollTop, scroller.clientHeight);
    },
    applyZoom(next) {
      percent = next;
      layout();
    },
    setRoomAbove: (px) => {
      zoom.style.marginTop = px > 0 ? `${px}px` : "";
    },
    setFontState: (state) => {
      pages.classList.toggle("fonts-loading", state === "loading");
    },
    setSheetDecor(next) {
      if (next?.key === decor?.key) return;
      decor = next;
      redrawInPlace();
    },
    setFurniture(next) {
      furniture = next;
      redrawInPlace();
    },
    setPageLabels(next) {
      labels = next;
      redrawInPlace();
    },
    setTint(on) {
      if (on) pages.dataset["tint"] = "on";
      else delete pages.dataset["tint"];
    },
    destroy() {
      destroyed = true;
      dirty = "none";
      scroller.removeEventListener("scroll", redraw);
      resizeObserver?.disconnect();
      listeners.clear();
      sheetListeners.delete(pages);
      zoom.remove();
    },
  };
}
