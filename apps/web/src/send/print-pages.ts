// The pages as the printer gets them: each page of the engine's layout drawn as a sheet of its paper,
// every line placed on the page's grid in points.
import { CELL_PT, STYLE, UNIT_PT, engineFor } from "@manent/pagination";
import type {
  Engine,
  FrontPage,
  LineRun,
  PageGeometry,
  Pagination,
  PositionedLine,
} from "@manent/pagination";
import type { Frames } from "@manent/sync-client";

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

// `lines` on a sheet of the paper, in points, in the script font with ligatures and kerning off.
function sheetOf(
  geometry: PageGeometry,
  lines: readonly PositionedLine[],
): HTMLElement {
  const { widthPt, heightPt, marginLeftPt, marginTopPt } = geometry;
  const sheet = document.createElement("div");
  Object.assign(sheet.style, {
    position: "relative",
    overflow: "hidden",
    width: `${widthPt}pt`,
    height: `${heightPt}pt`,
    background: "var(--page-paper)",
    color: "var(--page-ink)",
    font: '12pt/12pt "Courier Prime", monospace',
    fontKerning: "none",
    fontVariantLigatures: "none",
    whiteSpace: "pre",
  });
  for (const line of lines) {
    const row = document.createElement("div");
    row.style.position = "absolute";
    row.style.left = `${marginLeftPt + line.x * CELL_PT}pt`;
    row.style.top = `${marginTopPt + line.y * UNIT_PT}pt`;
    row.append(...line.runs.map(runSpan));
    sheet.append(row);
  }
  return sheet;
}

/** Page `index` of `p` as a sheet of its paper. */
export function drawSheet(
  engine: Engine,
  p: Pagination,
  index: number,
): HTMLElement {
  return sheetOf(p.profile.geometry, engine.layoutPage(p, index).lines);
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
      root.append(sheetOf(p.profile.geometry, page.lines));
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
        for (; next < end; next++) root.append(drawSheet(engine, p, next));
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
