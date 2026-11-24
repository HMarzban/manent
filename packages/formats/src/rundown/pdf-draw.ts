// Minimal pdfkit drawing helpers for rundown PDFs in the script font.
// Shared font-piece and text-option logic with ../pdf/write.ts is flagged for consolidation (LB15).
import {
  FONT_FACE_KEYS,
  FONT_METRICS,
  STYLE,
  clusterCells,
  fontSubset,
  graphemeEnd,
  wrap,
} from "@manent/pagination";
import type { FontFaceKey, Paper } from "@manent/pagination";
import PDFDocument from "pdfkit";
import type { ScriptFontFiles } from "../pdf/fonts.ts";

/** Portrait dimensions in points for each paper size. */
export const PAPER_PORTRAIT_PT: Readonly<
  Record<Paper, { readonly widthPt: number; readonly heightPt: number }>
> = Object.freeze({
  letter: Object.freeze({ widthPt: 612, heightPt: 792 }),
  a4: Object.freeze({ widthPt: 595.28, heightPt: 841.89 }),
});

export interface FontScale {
  readonly sizePt: number;
  readonly cellPt: number;
  readonly characterSpacingPt: number;
  readonly baselinePt: number;
  readonly boxHeightPt: number;
}

interface TextPiece {
  readonly text: string;
  readonly face: FontFaceKey | null;
  readonly cell: number;
  readonly cells: number;
}

const BOX_LINE_PT = 0.5;

/** Monospaced metrics of Courier Prime at `sizePt`. */
export function fontScale(sizePt: number): FontScale {
  const cellPt = sizePt * 0.6;
  const ptPerUnit = sizePt / FONT_METRICS.unitsPerEm;
  const characterSpacingPt = cellPt - FONT_METRICS.advance * ptPerUnit;
  const baselinePt =
    (sizePt - (FONT_METRICS.ascent - FONT_METRICS.descent) * ptPerUnit) / 2 +
    FONT_METRICS.ascent * ptPerUnit;
  return {
    sizePt,
    cellPt,
    characterSpacingPt,
    baselinePt,
    boxHeightPt: sizePt * 0.75,
  };
}

function pdfTextOptions(characterSpacingPt: number): PDFKit.Mixins.TextOptions {
  const options: PDFKit.Mixins.TextOptions = {
    baseline: "alphabetic",
    lineBreak: false,
    characterSpacing: characterSpacingPt,
  };
  Reflect.set(options, "features", {
    liga: false,
    clig: false,
    dlig: false,
    calt: false,
    kern: false,
  });
  return options;
}

function faceFor(subset: "latin" | "latin-ext", style: number): FontFaceKey {
  const weight = (style & STYLE.BOLD) === 0 ? "400" : "700";
  const slant = (style & STYLE.ITALIC) === 0 ? "normal" : "italic";
  return `${subset}-${weight}-${slant}`;
}

function clusterSubset(cluster: string): "latin" | "latin-ext" | null {
  const first = cluster.codePointAt(0);
  if (first === undefined) return null;
  const subset = fontSubset(first);
  for (const char of cluster)
    if (fontSubset(char.codePointAt(0)!) !== subset) return null;
  return subset;
}

function piecesOf(text: string, style: number): TextPiece[] {
  const pieces: TextPiece[] = [];
  for (let at = 0, cell = 0; at < text.length;) {
    const end = graphemeEnd(text, at);
    const cells = clusterCells(text, at, end, false);
    const cluster = text.slice(at, end);
    const subset = clusterSubset(cluster);
    const face = subset === null ? null : faceFor(subset, style);
    const last = pieces.at(-1);
    if (cells > 0 && face !== null && last?.face === face)
      pieces[pieces.length - 1] = {
        ...last,
        text: last.text + cluster,
        cells: last.cells + cells,
      };
    else if (cells > 0) pieces.push({ text: cluster, face, cell, cells });
    cell += cells;
    at = end;
  }
  return pieces;
}

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
  if (text === "") return;
  const textOpts = pdfTextOptions(scale.characterSpacingPt);
  for (const piece of piecesOf(text, style)) {
    const left = xPt + piece.cell * scale.cellPt;
    if (piece.face === null)
      pdf
        .save()
        .lineWidth(BOX_LINE_PT)
        .rect(
          left,
          baselineYPt - scale.boxHeightPt,
          piece.cells * scale.cellPt,
          scale.boxHeightPt,
        )
        .stroke()
        .restore();
    else
      pdf
        .font(piece.face)
        .fontSize(scale.sizePt)
        .text(piece.text, left, baselineYPt, textOpts);
  }
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

/** Opens a deterministic pdfkit instance with the script font faces registered and collects its bytes. */
export function startPdf(options: {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly title: string;
  readonly createdAt?: number;
  readonly fonts: ScriptFontFiles;
}): {
  readonly pdf: PDFKit.PDFDocument;
  readonly finish: () => Promise<Uint8Array>;
} {
  const created = new Date(options.createdAt ?? 0);
  const settings: PDFKit.PDFDocumentOptions = {
    size: [options.widthPt, options.heightPt],
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: options.title,
      CreationDate: created,
      ModDate: created,
    },
  };
  Reflect.set(settings, "font", null);
  const pdf = new PDFDocument(settings);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const written = new Promise<Uint8Array>((resolve, reject) => {
    pdf.on("data", (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Blob(chunks).bytes()));
    pdf.on("error", reject);
  });
  for (const key of FONT_FACE_KEYS) pdf.registerFont(key, options.fonts[key]);
  return {
    pdf,
    finish: () => {
      pdf.end();
      return written;
    },
  };
}
