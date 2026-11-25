// Rundown PDF drawing helpers built on the shared pdfkit glyph-run and document setup.
import { wrap } from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import {
  CURRENT_GLYPH_METRICS,
  drawGlyphRun,
  fontScale,
  startPdf,
} from "../pdf/draw.ts";
import type { FontScale } from "../pdf/draw.ts";

export { fontScale, startPdf };
export type { FontScale };

/** Portrait dimensions in points for each paper size. */
export const PAPER_PORTRAIT_PT: Readonly<
  Record<Paper, { readonly widthPt: number; readonly heightPt: number }>
> = Object.freeze({
  letter: Object.freeze({ widthPt: 612, heightPt: 792 }),
  a4: Object.freeze({ widthPt: 595.28, heightPt: 841.89 }),
});

/** Splits `text` into wrapped lines fitting within `maxCells` cells. */
export function wrapTextLines(text: string, maxCells: number): string[] {
  if (text === "") return [""];
  const starts = wrap(text, Math.max(1, maxCells));
  const lines: string[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i]!;
    const to = i + 1 < starts.length ? starts[i + 1]! : text.length;
    const raw = text.slice(from, to).replace(new RegExp("\\r?\\n$"), "");
    lines.push(raw.trimEnd());
  }
  return lines;
}

/** Draws a single line of text at `(xPt, baselineYPt)` using the script font at `scale`. */
export function drawScriptLine(
  pdf: PDFKit.PDFDocument,
  text: string,
  xPt: number,
  baselineYPt: number,
  style: number,
  scale: FontScale,
): void {
  drawGlyphRun(
    pdf,
    text,
    style,
    xPt,
    baselineYPt,
    scale,
    CURRENT_GLYPH_METRICS,
  );
}

/** Draws a hairline stroke between two points. */
export function drawHairline(
  pdf: PDFKit.PDFDocument,
  x1Pt: number,
  y1Pt: number,
  x2Pt: number,
  y2Pt: number,
  widthPt: number,
  rgb: readonly [number, number, number],
): void {
  pdf
    .save()
    .lineWidth(widthPt)
    .strokeColor([rgb[0], rgb[1], rgb[2]])
    .moveTo(x1Pt, y1Pt)
    .lineTo(x2Pt, y2Pt)
    .stroke()
    .restore();
}
