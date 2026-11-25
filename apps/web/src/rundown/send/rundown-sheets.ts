// DOM sheet drawing for RundownPage tiles and batched browser printing for rundown PDFs and scripts.
import type { RundownPage } from "@manent/formats";
import { PRINT_ID } from "../../send/print-pages.ts";
import type { Environment } from "../../services/ports.ts";

const SHEETS_PER_FRAME = 25;
const NO_FRAME = (): void => {};

/** Renders one `RundownPage` onto a point-sized sheet in the script font for preview tiles and printing. */
export function drawRundownSheet(page: RundownPage): HTMLElement {
  const sheet = document.createElement("div");
  Object.assign(sheet.style, {
    position: "relative",
    overflow: "hidden",
    width: `${page.widthPt}pt`,
    height: `${page.heightPt}pt`,
    background: "var(--page-paper)",
    color: "var(--page-ink)",
    font: `${page.fontSizePt}pt/${page.lineHeightPt}pt "Courier Prime", monospace`,
    fontKerning: "none",
    fontVariantLigatures: "none",
    whiteSpace: "pre",
  });
  for (const line of page.lines) {
    const row = document.createElement("div");
    row.style.position = "absolute";
    row.style.left = `${line.xPt}pt`;
    row.style.top = `${line.yPt}pt`;
    if (line.bold) row.style.fontWeight = "700";
    row.textContent = line.text;
    sheet.append(row);
  }
  for (const rule of page.rules) {
    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.left = `${rule.x1Pt}pt`;
    line.style.top = `${rule.yPt}pt`;
    line.style.width = `${Math.max(0, rule.x2Pt - rule.x1Pt)}pt`;
    line.style.height = `${rule.widthPt}pt`;
    line.style.background = "var(--page-edge)";
    sheet.append(line);
  }
  return sheet;
}

/** Print stylesheet for a rundown or script print batch: only `#mn-print` prints, on light paper whatever the theme. */
export function rundownPrintCss(widthPt: number, heightPt: number): string {
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

/**
 * Builds `#mn-print` from `sheets` a batch per frame, reporting progress via `onBuilt`, then opens the browser's
 * print dialogue and cleans up on `afterprint`. Rejects without leaving DOM nodes behind when aborted or on throw.
 */
export async function printRundownSheets(options: {
  readonly sheets: readonly (() => HTMLElement)[];
  readonly widthPt: number;
  readonly heightPt: number;
  readonly frame: Environment["frame"];
  readonly signal: AbortSignal;
  readonly onBuilt: (built: number) => void;
}): Promise<void> {
  const { sheets, widthPt, heightPt, frame, signal, onBuilt } = options;
  if (sheets.length === 0)
    throw new RangeError("printing requires at least one page, not none");
  signal.throwIfAborted();

  const style = document.createElement("style");
  style.textContent = rundownPrintCss(widthPt, heightPt);
  document.head.append(style);

  let root: HTMLElement;
  try {
    root = await new Promise<HTMLElement>((resolve, reject) => {
      document.getElementById(PRINT_ID)?.remove();
      const host = document.createElement("div");
      host.id = PRINT_ID;
      host.className = PRINT_ID;
      document.body.append(host);
      let cancelFrame = NO_FRAME;
      let next = 0;

      const stop = (reason: unknown): void => {
        cancelFrame();
        signal.removeEventListener("abort", aborted);
        host.remove();
        reject(reason);
      };
      const aborted = (): void => stop(signal.reason);
      const batch = (): void => {
        try {
          const end = Math.min(next + SHEETS_PER_FRAME, sheets.length);
          for (; next < end; next += 1) host.append(sheets[next]!());
          onBuilt(next);
        } catch (reason) {
          stop(reason);
          return;
        }
        if (next < sheets.length) {
          cancelFrame = frame(batch);
          return;
        }
        signal.removeEventListener("abort", aborted);
        resolve(host);
      };
      signal.addEventListener("abort", aborted, { once: true });
      cancelFrame = frame(batch);
    });
  } catch (reason) {
    style.remove();
    throw reason;
  }

  window.addEventListener(
    "afterprint",
    () => {
      root.remove();
      style.remove();
    },
    { once: true },
  );
  window.print();
}
