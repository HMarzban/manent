// PDF table writer for Character, Scene and Location reports, using the script's Courier Prime fonts and paper size.
import { FONT_FACE_KEYS, profileFor } from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import PDFDocument from "pdfkit";
import type { ScriptFontFiles } from "../pdf/fonts.ts";

export interface ReportTableColumn {
  readonly header: string;
  /** Relative width weight among columns. */
  readonly weight: number;
  readonly align?: "left" | "right";
}

export interface ReportPdfOptions {
  readonly title: string;
  readonly heading: string;
  readonly columns: readonly ReportTableColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly paper?: Paper;
  readonly fonts: ScriptFontFiles;
  readonly createdAt?: number;
}

const MARGIN_X = 54;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const COL_GAP = 10;
const HEADING_SIZE = 13;
const TABLE_SIZE = 9.5;
const FOOTER_SIZE = 8.5;
const ROW_PAD_Y = 5;
const HEADER_PAD_Y = 6;
type Rgb = readonly [number, number, number];

const RULE_COLOR: Rgb = [204, 204, 204];
const HEADER_RULE_COLOR: Rgb = [51, 51, 51];
const TEXT_COLOR: Rgb = [17, 17, 17];
const MUTED_COLOR: Rgb = [102, 102, 102];

function pageDimensions(paper: Paper): readonly [number, number] {
  const geometry = profileFor("screenplay", { paper })?.geometry;
  if (geometry !== undefined) return [geometry.widthPt, geometry.heightPt];
  return paper === "a4" ? [595.28, 841.89] : [612, 792];
}

function columnWidths(
  columns: readonly ReportTableColumn[],
  usableWidth: number,
): number[] {
  const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0);
  const gaps = Math.max(0, columns.length - 1) * COL_GAP;
  const available = Math.max(0, usableWidth - gaps);
  return columns.map((col) => (available * col.weight) / totalWeight);
}

function measureRowHeight(
  doc: PDFKit.PDFDocument,
  cells: readonly string[],
  widths: readonly number[],
  font: string,
): number {
  doc.font(font).fontSize(TABLE_SIZE);
  let maxHeight = TABLE_SIZE * 1.25;
  for (let i = 0; i < widths.length; i++) {
    const text = cells[i] ?? "";
    if (text === "") continue;
    const h = doc.heightOfString(text, { width: widths[i]! });
    if (h > maxHeight) maxHeight = h;
  }
  return maxHeight;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  cells: readonly string[],
  columns: readonly ReportTableColumn[],
  widths: readonly number[],
  y: number,
  font: string,
): void {
  doc
    .font(font)
    .fontSize(TABLE_SIZE)
    .fillColor([TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]]);
  let x = MARGIN_X;
  for (let i = 0; i < columns.length; i++) {
    const width = widths[i]!;
    const text = cells[i] ?? "";
    if (text !== "") {
      doc.text(text, x, y, {
        width,
        align: columns[i]!.align ?? "left",
      });
    }
    x += width + COL_GAP;
  }
}

function drawRule(
  doc: PDFKit.PDFDocument,
  x1: number,
  x2: number,
  y: number,
  color: Rgb,
  lineWidth: number,
): void {
  doc
    .save()
    .strokeColor([color[0], color[1], color[2]])
    .lineWidth(lineWidth)
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke()
    .restore();
}

/**
 * Renders a report table (`heading`, `columns`, `rows`) onto the script's paper size as a PDF.
 * Repeats the table header on continuation pages and numbers every page at the foot.
 */
export async function writeReportPdf(
  options: ReportPdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const paper = options.paper ?? "letter";
  const [widthPt, heightPt] = pageDimensions(paper);
  const usableWidth = widthPt - MARGIN_X * 2;
  const widths = columnWidths(options.columns, usableWidth);
  const created = new Date(options.createdAt ?? 0);

  const settings: PDFKit.PDFDocumentOptions = {
    size: [widthPt, heightPt],
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: options.title,
      CreationDate: created,
      ModDate: created,
    },
  };
  Reflect.set(settings, "font", null);
  const doc = new PDFDocument(settings);

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const written = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    doc.on("end", async () => {
      const bytes = await new Blob(chunks).bytes();
      resolve(new Uint8Array(bytes));
    });
    doc.on("error", reject);
  });

  for (const key of FONT_FACE_KEYS) doc.registerFont(key, options.fonts[key]);

  const headerCells = options.columns.map((col) => col.header);
  const bottomLimit = heightPt - MARGIN_BOTTOM - 16;
  let pageNumber = 0;

  const drawFooter = (num: number): void => {
    doc
      .font("latin-400-normal")
      .fontSize(FOOTER_SIZE)
      .fillColor([MUTED_COLOR[0], MUTED_COLOR[1], MUTED_COLOR[2]])
      .text(String(num), MARGIN_X, heightPt - MARGIN_BOTTOM + 6, {
        width: usableWidth,
        align: "right",
        lineBreak: false,
      });
  };

  const startPage = (withTitle: boolean): number => {
    doc.addPage({ size: [widthPt, heightPt], margin: 0 });
    pageNumber += 1;
    drawFooter(pageNumber);
    let y = MARGIN_TOP;
    if (withTitle) {
      doc
        .font("latin-700-normal")
        .fontSize(HEADING_SIZE)
        .fillColor([TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]])
        .text(options.heading, MARGIN_X, y, { width: usableWidth });
      y += doc.heightOfString(options.heading, { width: usableWidth }) + 12;
    }
    const headerHeight = measureRowHeight(
      doc,
      headerCells,
      widths,
      "latin-700-normal",
    );
    drawRow(doc, headerCells, options.columns, widths, y, "latin-700-normal");
    y += headerHeight + HEADER_PAD_Y;
    drawRule(doc, MARGIN_X, widthPt - MARGIN_X, y, HEADER_RULE_COLOR, 0.8);
    return y + ROW_PAD_Y;
  };

  let y = startPage(true);

  for (const row of options.rows) {
    const rowHeight = measureRowHeight(doc, row, widths, "latin-400-normal");
    if (y + rowHeight > bottomLimit) {
      y = startPage(false);
    }
    drawRow(doc, row, options.columns, widths, y, "latin-400-normal");
    y += rowHeight + ROW_PAD_Y;
    drawRule(doc, MARGIN_X, widthPt - MARGIN_X, y - 2, RULE_COLOR, 0.4);
  }

  doc.end();
  return await written;
}
