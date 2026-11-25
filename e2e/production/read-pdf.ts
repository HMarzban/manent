// An issued PDF read back as pdf.js sees it: each page's label and its text grouped into lines by baseline.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Every profile's top margin is one inch: a line whose baseline is above it is in the top margin. */
const TOP_MARGIN_PT = 72;
/** Two lengths closer than this, in points, are read as equal. */
const NEAR_PT = 0.01;

interface Span {
  x: number;
  end: number;
  text: string;
}

export interface ReadPage {
  /** The page number printed in the top margin, without its full stop; null when none is printed. */
  label: string | null;
  /** Top to bottom. */
  lines: string[];
}

const toHundredths = (n: number): number => Math.round(n * 100) / 100;

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

/** The page's lines, top to bottom, each its baseline in points from the top and its items left to right. */
async function linesOf(
  page: PDFPageProxy,
  height: number,
): Promise<{ y: number; items: Span[] }[]> {
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
    .map(([y, row]) => ({ y, items: joinTouching(row) }));
}

/** Each page of `bytes` as pdf.js reads it. */
export async function readPdf(bytes: Uint8Array): Promise<ReadPage[]> {
  // pdf.js detaches the buffer it is given
  const task = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  const pages: ReadPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const lines = await linesOf(page, page.view[3]!);
    const margin = lines.find((line) => line.y < TOP_MARGIN_PT);
    pages.push({
      label: margin?.items.at(-1)?.text.replace(new RegExp("\\.$"), "") ?? null,
      lines: lines.map((line) => line.items.map((item) => item.text).join("")),
    });
  }
  await task.destroy();
  return pages;
}
