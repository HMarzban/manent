// The pages as the printer gets them: each page of the engine's layout drawn as a sheet of its paper,
// every line placed on the page's grid in points.
import type { PageFurnitureOptions } from "@manent/editor";
import {
  DEFAULT_READ_RATE,
  STYLE,
  cellPtOf,
  durationMs,
  engineFor,
  isVersoPage,
  pageMarginLeftPt,
  timeScript,
  unitPtOf,
} from "@manent/pagination";
import type {
  Engine,
  FrontPage,
  LineRun,
  PageProfile,
  Pagination,
  PositionedLine,
} from "@manent/pagination";
import type { Frames } from "@manent/sync-client";
import {
  PRINT_REPLACED_KINDS,
  drawPrintFurniture,
} from "../editor-host/print-furniture.ts";

/** The id of the element the printer gets. */
export const PRINT_ID = "mn-print";

// enough to keep a frame short, so that a 2,000-page script never freezes the tab
const PAGES_PER_FRAME = 25;
const NO_FRAME = (): void => {};

/** The engine `p` was paginated with; throws RangeError when this build does not carry it. */
export function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `no engine of version ${p.engineVersion} in this build`,
    );
  return engine;
}

function runSpan(run: LineRun): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = run.text;
  if ((run.style & STYLE.BOLD) !== 0) span.style.fontWeight = "700";
  if ((run.style & STYLE.ITALIC) !== 0) span.style.fontStyle = "italic";
  const lines = [
    (run.style & STYLE.UNDERLINE) !== 0 ? "underline" : null,
    (run.style & STYLE.STRIKE) !== 0 ? "line-through" : null,
  ].filter((line) => line !== null);
  if (lines.length > 0) span.style.textDecorationLine = lines.join(" ");
  return span;
}

// `lines` on a sheet of the paper, in points, in the script or book font with ligatures and kerning off.
function sheetOf(
  profile: PageProfile,
  lines: readonly PositionedLine[],
  pageIndex = 0,
): HTMLElement {
  const { geometry, typography } = profile;
  const { widthPt, heightPt, marginTopPt } = geometry;
  const marginLeftPt = pageMarginLeftPt(geometry, pageIndex);
  const unitPt = unitPtOf(profile);
  const cellPt = cellPtOf(profile);
  const font =
    typography?.kind === "book_serif"
      ? `${typography.fontSizePt}pt/${typography.linePt}pt "${typography.family}", Georgia, serif`
      : '12pt/12pt "Courier Prime", monospace';
  const sheet = document.createElement("div");
  if (geometry.mirrored === true) {
    sheet.dataset["side"] = isVersoPage(pageIndex) ? "verso" : "recto";
  }
  Object.assign(sheet.style, {
    position: "relative",
    overflow: "hidden",
    width: `${widthPt}pt`,
    height: `${heightPt}pt`,
    background: "var(--page-paper)",
    color: "var(--page-ink)",
    font,
    fontKerning: "none",
    fontVariantLigatures: "none",
    whiteSpace: "pre",
  });
  for (const line of lines) {
    const row = document.createElement("div");
    row.style.position = "absolute";
    row.style.left = `${marginLeftPt + (line.xPt ?? line.x * cellPt)}pt`;
    row.style.top = `${marginTopPt + line.y * unitPt}pt`;
    row.append(...line.runs.map(runSpan));
    sheet.append(row);
  }
  return sheet;
}

function sectionOfPage(p: Pagination, pageIndex: number): string | null {
  const target = p.pages[pageIndex];
  if (target === undefined) return null;
  let current: string | null = null;
  for (let i = 0; i <= target.block && i < p.blocks.length; i++) {
    const block = p.blocks[i]!;
    if (
      block.type === "chapter" ||
      block.type === "group" ||
      (block.type === "act_break" && block.kind !== "end_of_act")
    ) {
      const text = block.text.trim();
      if (text !== "") current = text;
    }
  }
  return current;
}

function durationOfPagination(p: Pagination): number | null {
  if (p.profile.format !== "variety") return null;
  const blocks = p.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    text: block.text,
    noTiming: block.noTiming === true,
  }));
  const { total } = timeScript(blocks);
  return durationMs([total], DEFAULT_READ_RATE);
}

/** Page `index` of `p` as a sheet of its paper, with page furniture drawn over it. */
export function drawSheet(
  engine: Engine,
  p: Pagination,
  index: number,
  furniture?: PageFurnitureOptions,
): HTMLElement {
  const laid = engine.layoutPage(p, index);
  const sheet = sheetOf(
    p.profile,
    laid.lines.filter((line) => !PRINT_REPLACED_KINDS.has(line.kind)),
    index,
  );
  const resolvedDuration =
    furniture?.durationMs !== undefined
      ? furniture.durationMs
      : durationOfPagination(p);
  drawPrintFurniture(sheet, {
    pageIndex: index,
    pageCount: p.pages.length,
    pageLabel: laid.label,
    profile: p.profile,
    title: furniture?.title ?? null,
    revision: null,
    watermark: furniture?.watermark ?? null,
    header: furniture?.header ?? null,
    footer: furniture?.footer ?? null,
    dateFormat: furniture?.dateFormat ?? null,
    section:
      furniture?.sections?.[index] ??
      furniture?.section ??
      sectionOfPage(p, index),
    revisionLabel: furniture?.revisionLabel ?? null,
    day: furniture?.day ?? null,
    durationMs: resolvedDuration,
  });
  return sheet;
}

/**
 * Builds `#mn-print` at the end of the body: the `front` pages first, then one sheet per page, a batch of pages per
 * frame. Rejects with the signal's reason when it is aborted, and with what was thrown when a page cannot be drawn;
 * either way it removes what it built. A `#mn-print` left from an earlier print is replaced.
 */
export function printPages(
  p: Pagination,
  options: {
    frames: Frames;
    signal: AbortSignal;
    front?: readonly FrontPage[];
    furniture?: PageFurnitureOptions;
  },
): Promise<HTMLElement> {
  const { frames, signal } = options;
  return new Promise((resolve, reject) => {
    const engine = engineOf(p);
    signal.throwIfAborted();
    document.getElementById(PRINT_ID)?.remove();
    const root = document.createElement("div");
    root.id = PRINT_ID;
    // the theme's rule for this class prints it on light paper with its colours exact
    root.className = PRINT_ID;
    for (const page of options.front ?? [])
      root.append(sheetOf(p.profile, page.lines, 0));
    document.body.append(root);
    let cancelFrame = NO_FRAME;
    let next = 0;
    const stop = (reason: unknown): void => {
      cancelFrame();
      signal.removeEventListener("abort", aborted);
      root.remove();
      reject(reason);
    };
    const aborted = (): void => stop(signal.reason);
    const batch = (): void => {
      try {
        const end = Math.min(next + PAGES_PER_FRAME, p.pages.length);
        for (; next < end; next++)
          root.append(drawSheet(engine, p, next, options.furniture));
      } catch (error) {
        stop(error);
        return;
      }
      if (next < p.pages.length) {
        cancelFrame = frames.request(batch);
        return;
      }
      signal.removeEventListener("abort", aborted);
      resolve(root);
    };
    signal.addEventListener("abort", aborted, { once: true });
    cancelFrame = frames.request(batch);
  });
}

/**
 * The print rules for `p`'s paper: only `#mn-print` prints, a sheet to a page, on light paper whatever the theme. The
 * build turns each light-dark() pair into two variables the root sets, so the root's scheme is set through them too.
 */
export function printCss(p: Pagination): string {
  const { widthPt, heightPt } = p.profile.geometry;
  return `@media screen {
  #${PRINT_ID} { display: none; }
}
@media print {
  :root, :root[data-theme] { color-scheme: light; --buncss-light: initial; --buncss-dark: ; }
  html, body { height: auto; overflow: visible; margin: 0; padding: 0; }
  body > :not(#${PRINT_ID}) { display: none; }
  #${PRINT_ID} > * { break-after: page; }
}
@page { size: ${widthPt}pt ${heightPt}pt; margin: 0 }`;
}
