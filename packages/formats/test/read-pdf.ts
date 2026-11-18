// A PDF read back as pdf.js sees it: each page's size, its text grouped into lines by baseline, and
// whether a fill the size of the page lies under its text.
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Every profile's top margin is one inch: a line whose baseline is above it is in the top margin. */
const TOP_MARGIN_PT = 72;

interface ReadItem {
  x: number;
  text: string;
}

interface ReadLine {
  x: number;
  /** The baseline, in points from the top of the page, to 0.01. */
  y: number;
  width: number;
  text: string;
  items: ReadItem[];
}

interface ReadPage {
  width: number;
  height: number;
  label: string | null;
  tinted: boolean;
  tintColor: string | null;
  lines: ReadLine[];
}

/** Two lengths closer than this, in points, are read as equal. */
const NEAR_PT = 0.01;

interface Span {
  x: number;
  end: number;
  text: string;
}

const toHundredths = (n: number) => Math.round(n * 100) / 100;

// pdf.js ends an item at every space as wide as 0.6 em, as every space on the script's grid is:
// items that touch are joined into one again.
function joinTouching(spans: readonly Span[]): Span[] {
  const joined: Span[] = [];
  for (const span of spans.toSorted((a, b) => a.x - b.x)) {
    const last = joined.at(-1);
    if (last !== undefined && Math.abs(span.x - last.end) < NEAR_PT)
      joined[joined.length - 1] = {
        x: last.x,
        end: span.end,
        text: last.text + span.text,
      };
    else joined.push(span);
  }
  return joined;
}

async function linesOf(
  page: PDFPageProxy,
  height: number,
): Promise<ReadLine[]> {
  const rows = new Map<number, Span[]>();
  for (const item of (await page.getTextContent()).items) {
    if (!("str" in item) || item.str === "") continue;
    const x = item.transform[4];
    const y = toHundredths(height - item.transform[5]);
    const row = rows.get(y) ?? [];
    row.push({ x, end: x + item.width, text: item.str });
    rows.set(y, row);
  }
  return [...rows]
    .toSorted(([a], [b]) => a - b)
    .map(([y, row]) => {
      const items = joinTouching(row);
      const x = items[0]!.x;
      return {
        x,
        y,
        width: items.at(-1)!.end - x,
        text: items.map((item) => item.text).join(""),
        items: items.map((item) => ({ x: item.x, text: item.text })),
      };
    });
}

// The colour of a fill that covers the whole page before any text is drawn, or null.
async function tintOf(
  page: PDFPageProxy,
  width: number,
  height: number,
): Promise<string | null> {
  const { fnArray, argsArray } = await page.getOperatorList();
  let color: string | null = null;
  for (const [i, op] of fnArray.entries()) {
    if (op === OPS.beginText) return null;
    if (op === OPS.setFillRGBColor) color = String(argsArray[i][0]);
    if (op === OPS.constructPath && isPageFill(argsArray[i], width, height))
      return color;
  }
  return null;
}

// constructPath's arguments: the paint operator, the path, and the path's bounds [x0, y0, x1, y1].
function isPageFill(args: unknown, width: number, height: number): boolean {
  if (!Array.isArray(args) || args[0] !== OPS.fill) return false;
  const bounds: unknown = args[2];
  return (
    bounds instanceof Float32Array &&
    [0, 0, width, height].every(
      (edge, i) => Math.abs(bounds[i]! - edge) < NEAR_PT,
    )
  );
}

/** Each page of `bytes` as pdf.js reads it. */
export async function readPdf(bytes: Uint8Array): Promise<ReadPage[]> {
  // pdf.js detaches the buffer it is given
  const task = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  const pages: ReadPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [, , width, height] = page.view;
    const lines = await linesOf(page, height!);
    const tintColor = await tintOf(page, width!, height!);
    const margin = lines.find((line) => line.y < TOP_MARGIN_PT);
    pages.push({
      width: width!,
      height: height!,
      label: margin?.items.at(-1)?.text.replace(new RegExp("\\.$"), "") ?? null,
      tinted: tintColor !== null,
      tintColor,
      lines,
    });
  }
  await task.destroy();
  return pages;
}
