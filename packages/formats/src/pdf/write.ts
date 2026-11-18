// A PDF drawn line by line from the positioned lines of the engine a script was paginated with, in
// the script font's own faces, every glyph on the grid of 10 cells to the inch.
import {
  CELL_PT,
  FONT_FACE_KEYS,
  FONT_METRICS,
  STYLE,
  UNIT_PT,
  engineFor,
} from "@manent/pagination";
import type { Engine, FontFaceKey, Pagination } from "@manent/pagination";
import PDFDocument from "pdfkit";
import type { ScriptFontFiles } from "./fonts.ts";

export interface PdfOptions {
  readonly fonts: ScriptFontFiles;
  /** Page indexes to draw, in order; all pages when absent. */
  readonly pages?: readonly number[];
  /** Milliseconds since the epoch, written as the creation and modification dates; 0 when absent. */
  readonly createdAt?: number;
  readonly title?: string;
  /** A revision's furniture for a page; null for a plain page. Each tint channel is 0–255. */
  readonly decor?: (pageIndex: number) => {
    header: string;
    marks: readonly { y: number; text: string }[];
    tint: readonly [number, number, number] | null;
  } | null;
}

const FONT_SIZE_PT = 12;
const PT_PER_FONT_UNIT = FONT_SIZE_PT / FONT_METRICS.unitsPerEm;
/** Added after every glyph, so that each advances one cell. */
const CHARACTER_SPACING_PT = CELL_PT - FONT_METRICS.advance * PT_PER_FONT_UNIT;
/** Where a browser puts the baseline in a 12 pt line box, from the box's top. */
const BASELINE_PT =
  (FONT_SIZE_PT -
    (FONT_METRICS.ascent - FONT_METRICS.descent) * PT_PER_FONT_UNIT) /
    2 +
  FONT_METRICS.ascent * PT_PER_FONT_UNIT;
const BOX_HEIGHT_PT = 9;
const BOX_LINE_PT = 0.5;
const RULE_LINE_PT = 0.6;
const UNDERLINE_BELOW_PT = 1.5;
const STRIKE_ABOVE_PT = 3.5;
/** Cells between the column's right edge and a revision mark. */
const MARK_GAP_CELLS = 7;

interface Pen {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
}

/** Clusters drawn in one face, or one cluster the font has no glyph for (`face` null). */
interface Piece {
  readonly text: string;
  readonly face: FontFaceKey | null;
  /** Cells before the piece in its run. */
  readonly cell: number;
  readonly cells: number;
}

// The declarations ask for a list of features to turn on, but pdfkit hands this value to fontkit,
// which reads an object as switches: only an object turns ligatures and kerning off.
function textOptions(): PDFKit.Mixins.TextOptions {
  const options: PDFKit.Mixins.TextOptions = {
    baseline: "alphabetic",
    lineBreak: false,
    characterSpacing: CHARACTER_SPACING_PT,
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

// The subset whose files hold every code point of `cluster`; null when no one subset does, so the
// font has no glyph for it.
function subsetOf(
  engine: Engine,
  cluster: string,
): "latin" | "latin-ext" | null {
  const subset = engine.fontSubset(cluster.codePointAt(0)!);
  for (const char of cluster)
    if (engine.fontSubset(char.codePointAt(0)!) !== subset) return null;
  return subset;
}

// `text` cut by cluster into pieces of one face; a cluster of 0 cells is passed over.
function piecesOf(engine: Engine, text: string, style: number): Piece[] {
  const pieces: Piece[] = [];
  for (let at = 0, cell = 0; at < text.length;) {
    const end = engine.graphemeEnd(text, at);
    const cells = engine.clusterCells(text, at, end, false);
    const cluster = text.slice(at, end);
    const subset = subsetOf(engine, cluster);
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

function rule(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cells: number,
): void {
  doc
    .save()
    .lineWidth(RULE_LINE_PT)
    .moveTo(x, y)
    .lineTo(x + cells * CELL_PT, y)
    .stroke()
    .restore();
}

// One run of text whose first cell starts at `x`, on the baseline `y` (points). Returns its cells.
function drawRun(
  { doc, engine }: Pen,
  text: string,
  style: number,
  x: number,
  y: number,
): number {
  for (const piece of piecesOf(engine, text, style)) {
    const left = x + piece.cell * CELL_PT;
    if (piece.face === null)
      doc
        .save()
        .lineWidth(BOX_LINE_PT)
        .rect(left, y - BOX_HEIGHT_PT, piece.cells * CELL_PT, BOX_HEIGHT_PT)
        .stroke()
        .restore();
    else
      doc
        .font(piece.face)
        .fontSize(FONT_SIZE_PT)
        .text(piece.text, left, y, textOptions());
  }
  const cells = engine.clusterCells(text, 0, text.length, false);
  if ((style & STYLE.UNDERLINE) !== 0)
    rule(doc, x, y + UNDERLINE_BELOW_PT, cells);
  if ((style & STYLE.STRIKE) !== 0) rule(doc, x, y - STRIKE_ABOVE_PT, cells);
  return cells;
}

function drawPage(
  pen: Pen,
  p: Pagination,
  pageIndex: number,
  options: PdfOptions,
): void {
  const { doc, engine } = pen;
  const { geometry, columnCells } = p.profile;
  const rowY = (y: number) => geometry.marginTopPt + y * UNIT_PT + BASELINE_PT;
  const decor = options.decor?.(pageIndex) ?? null;
  doc.addPage();
  if (decor !== null && decor.tint !== null) {
    const [r, g, b] = decor.tint;
    doc
      .save()
      .fillColor([r, g, b])
      .rect(0, 0, geometry.widthPt, geometry.heightPt)
      .fill()
      .restore();
  }
  for (const line of engine.layoutPage(p, pageIndex).lines) {
    let cell = line.x;
    for (const run of line.runs)
      cell += drawRun(
        pen,
        run.text,
        run.style,
        geometry.marginLeftPt + cell * CELL_PT,
        rowY(line.y),
      );
  }
  if (decor === null) return;
  drawRun(
    pen,
    decor.header,
    0,
    geometry.marginLeftPt,
    geometry.pageNumberTopPt + BASELINE_PT,
  );
  for (const mark of decor.marks)
    drawRun(
      pen,
      mark.text,
      0,
      geometry.marginLeftPt + (columnCells + MARK_GAP_CELLS) * CELL_PT,
      rowY(mark.y),
    );
}

/**
 * The pages of `p` as a PDF, drawn with the engine `p` was paginated with. Equal input gives equal
 * bytes. Throws RangeError when this build does not carry that engine or a page index is past the
 * last page.
 */
export async function writePdf(
  p: Pagination,
  options: PdfOptions,
): Promise<Uint8Array> {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `no engine of version ${p.engineVersion} in this build`,
    );
  const { widthPt, heightPt } = p.profile.geometry;
  const created = new Date(options.createdAt ?? 0);
  const doc = new PDFDocument({
    size: [widthPt, heightPt],
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: options.title ?? "",
      CreationDate: created,
      ModDate: created,
    },
  });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const written = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    doc.on("end", () => resolve(new Blob(chunks).bytes()));
    doc.on("error", reject);
  });
  for (const key of FONT_FACE_KEYS) doc.registerFont(key, options.fonts[key]);
  const pen = { doc, engine };
  for (const pageIndex of options.pages ?? p.pages.map((_, k) => k))
    drawPage(pen, p, pageIndex, options);
  doc.end();
  return await written;
}
