// Shared pdfkit font setup, glyph-run splitting and deterministic document creation for script and rundown PDFs.
import {
  FONT_FACE_KEYS,
  FONT_METRICS,
  SERIF_METRICS,
  STYLE,
  clusterCells,
  fontSubset,
  graphemeEnd,
  measureSerifPt,
  serifFontSubset,
} from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import PDFDocument from "pdfkit";
import type { ScriptFontFiles } from "./fonts.ts";

export interface FontScale {
  readonly sizePt: number;
  readonly cellPt: number;
  readonly characterSpacingPt: number;
  readonly baselinePt: number;
  readonly boxHeightPt: number;
}

export interface GlyphMetrics {
  fontSubset(codePoint: number): "latin" | "latin-ext" | null;
  graphemeEnd(text: string, at: number): number;
  clusterCells(text: string, from: number, to: number, inWord: boolean): number;
}

/** Clusters drawn in one face, or one cluster the font has no glyph for (`face` null). */
interface TextPiece {
  readonly text: string;
  readonly face: FontFaceKey | null;
  readonly cell: number;
  readonly cells: number;
}

const BOX_LINE_PT = 0.5;

/** Current pagination build's cluster and subset metrics, for PDFs that do not hold a per-part engine. */
export const CURRENT_GLYPH_METRICS: GlyphMetrics = Object.freeze({
  fontSubset,
  graphemeEnd,
  clusterCells,
});

/** Monospaced metrics of the script font at `sizePt` (and optional exact `cellPt`). */
export function fontScale(
  sizePt: number,
  cellPt: number = sizePt * 0.6,
): FontScale {
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

// The declarations ask for a list of features to turn on, but pdfkit hands this value to fontkit,
// which reads an object as switches: only an object turns ligatures and kerning off.
function textOptions(characterSpacingPt: number): PDFKit.Mixins.TextOptions {
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

function faceOf(subset: "latin" | "latin-ext", style: number): FontFaceKey {
  const weight = (style & STYLE.BOLD) === 0 ? "400" : "700";
  const slant = (style & STYLE.ITALIC) === 0 ? "normal" : "italic";
  return `${subset}-${weight}-${slant}`;
}

// The subset whose files hold every code point of `cluster`; null when no one subset does.
function subsetOf(
  metrics: GlyphMetrics,
  cluster: string,
): "latin" | "latin-ext" | null {
  const first = cluster.codePointAt(0);
  if (first === undefined) return null;
  const subset = metrics.fontSubset(first);
  for (const char of cluster)
    if (metrics.fontSubset(char.codePointAt(0)!) !== subset) return null;
  return subset;
}

// `text` cut by cluster into pieces of one face; a cluster of 0 cells is passed over.
function piecesOf(
  metrics: GlyphMetrics,
  text: string,
  style: number,
): TextPiece[] {
  const pieces: TextPiece[] = [];
  for (let at = 0, cell = 0; at < text.length;) {
    const end = metrics.graphemeEnd(text, at);
    const cells = metrics.clusterCells(text, at, end, false);
    const cluster = text.slice(at, end);
    const subset = subsetOf(metrics, cluster);
    const face = subset === null ? null : faceOf(subset, style);
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

/** Draws `text` at `(xPt, baselineYPt)` split into single-face glyph runs, boxing missing glyphs. */
export function drawGlyphRun(
  pdf: PDFKit.PDFDocument,
  text: string,
  style: number,
  xPt: number,
  baselineYPt: number,
  scale: FontScale,
  metrics: GlyphMetrics,
): void {
  if (text === "") return;
  const options = textOptions(scale.characterSpacingPt);
  for (const piece of piecesOf(metrics, text, style)) {
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
        .text(piece.text, left, baselineYPt, options);
  }
}

/** Proportional metrics of Source Serif 4 at `sizePt` (`characterSpacingPt = 0`). */
export function bookFontScale(sizePt: number, linePt: number): FontScale {
  const ptPerUnit = sizePt / SERIF_METRICS.unitsPerEm;
  const baselinePt =
    (linePt - (SERIF_METRICS.ascent - SERIF_METRICS.descent) * ptPerUnit) / 2 +
    SERIF_METRICS.ascent * ptPerUnit;
  return {
    sizePt,
    cellPt: 6,
    characterSpacingPt: 0,
    baselinePt,
    boxHeightPt: sizePt * 0.75,
  };
}

/** Draws proportional Source Serif 4 `text` at `(xPt, baselineYPt)` and returns its advance in points. */
export function drawProportionalRun(
  pdf: PDFKit.PDFDocument,
  text: string,
  style: number,
  xPt: number,
  baselineYPt: number,
  scale: FontScale,
): number {
  if (text === "") return 0;
  const options = textOptions(0);
  let cursorX = xPt;
  for (let at = 0; at < text.length;) {
    const end = graphemeEnd(text, at);
    const cluster = text.slice(at, end);
    const first = cluster.codePointAt(0);
    let subset: "latin" | "latin-ext" | null =
      first === undefined ? null : serifFontSubset(first);
    if (subset !== null) {
      for (const ch of cluster) {
        if (serifFontSubset(ch.codePointAt(0)!) !== subset) {
          subset = null;
          break;
        }
      }
    }
    const wPt = measureSerifPt(cluster, style, scale.sizePt);
    if (subset === null) {
      pdf
        .save()
        .lineWidth(BOX_LINE_PT)
        .rect(cursorX, baselineYPt - scale.boxHeightPt, wPt, scale.boxHeightPt)
        .stroke()
        .restore();
    } else {
      pdf
        .font(`book-${faceOf(subset, style)}`)
        .fontSize(scale.sizePt)
        .text(cluster, cursorX, baselineYPt, options);
    }
    cursorX += wPt;
    at = end;
  }
  return cursorX - xPt;
}

/** Opens a deterministic pdfkit instance with the script font faces (and optional book serif faces) registered. */
export function startPdf(options: {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly title: string;
  readonly createdAt?: number;
  readonly fonts: ScriptFontFiles;
  readonly bookFonts?: ScriptFontFiles;
}): {
  readonly pdf: PDFKit.PDFDocument;
  readonly finish: () => Promise<Uint8Array>;
} {
  const created = new Date(options.createdAt ?? 0);
  // pdfkit opens Helvetica unless font is null, and its browser build carries no standard fonts:
  // every piece sets its own face, so none is opened.
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
  if (options.bookFonts !== undefined) {
    for (const key of FONT_FACE_KEYS)
      pdf.registerFont(`book-${key}`, options.bookFonts[key]);
  }
  return {
    pdf,
    finish: () => {
      pdf.end();
      return written;
    },
  };
}
