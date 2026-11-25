// A PDF drawn line by line from the positioned lines of the engine a script was paginated with, in
// the script font's own faces, every glyph on the grid of 10 cells to the inch.
import { CELL_PT, STYLE, UNIT_PT, engineFor } from "@manent/pagination";
import type {
  Engine,
  FrontPage,
  PageGeometry,
  Pagination,
} from "@manent/pagination";
import { drawGlyphRun, fontScale, startPdf } from "./draw.ts";
import type { ScriptFontFiles } from "./fonts.ts";
import {
  durationOfParts,
  sectionsOfPagination,
} from "./furniture/header-footer.ts";
import type {
  FurnitureLine,
  PdfDateFormat,
  PdfHeaderSlots,
  PdfRevision,
} from "./furniture/pdf-furniture.ts";
import { PDF_FURNITURE } from "./furniture/registry.ts";

export interface PdfOptions {
  readonly fonts: ScriptFontFiles;
  /** Page indexes to draw, in order; all pages when absent. */
  readonly pages?: readonly number[];
  /** The pages before page 1, drawn first; none when absent. */
  readonly front?: readonly FrontPage[];
  /** Milliseconds since the epoch, written as the creation and modification dates; 0 when absent. */
  readonly createdAt?: number;
  readonly title?: string;
  /** A revision's furniture for a page; null for a plain page. */
  readonly decor?: (pageIndex: number) => PdfRevision | null;
  readonly watermark?: string | null;
  readonly header?: PdfHeaderSlots | null;
  readonly footer?: PdfHeaderSlots | null;
  readonly dateFormat?: PdfDateFormat | null;
  readonly section?: string | null;
  readonly sections?: readonly (string | null)[];
  readonly revisionLabel?: string | null;
  readonly day?: string | null;
  readonly durationMs?: number | null;
}

const SCRIPT_SCALE = fontScale(12, CELL_PT);
const RULE_LINE_PT = 0.6;
const UNDERLINE_BELOW_PT = 1.5;
const STRIKE_ABOVE_PT = 3.5;

interface Pen {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
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
  drawGlyphRun(doc, text, style, x, y, SCRIPT_SCALE, engine);
  const cells = engine.clusterCells(text, 0, text.length, false);
  if ((style & STYLE.UNDERLINE) !== 0)
    rule(doc, x, y + UNDERLINE_BELOW_PT, cells);
  if ((style & STYLE.STRIKE) !== 0) rule(doc, x, y - STRIKE_ABOVE_PT, cells);
  return cells;
}

// The baseline of the row `y` units below the top of the text area, in points.
const rowY = (geometry: PageGeometry, y: number): number =>
  geometry.marginTopPt + y * UNIT_PT + SCRIPT_SCALE.baselinePt;

function drawLines(
  pen: Pen,
  lines: readonly FurnitureLine[],
  geometry: PageGeometry,
): void {
  for (const line of lines) {
    let cell = line.x;
    for (const run of line.runs)
      cell += drawRun(
        pen,
        run.text,
        run.style,
        geometry.marginLeftPt + cell * CELL_PT,
        rowY(geometry, line.y),
      );
  }
}

/** A page of one part, drawn with the part's engine. */
interface PartPage {
  readonly pen: Pen;
  readonly p: Pagination;
  readonly pageIndex: number;
  readonly section: string | null;
}

/** The engine's lines, but those an entry draws in its place, with every furniture entry's paper under them and its lines over them. */
function drawPage(
  { pen, p, pageIndex, section }: PartPage,
  at: { documentIndex: number; pageCount: number; durationMs: number | null },
  options: PdfOptions,
): void {
  const { doc, engine } = pen;
  const { profile } = p;
  const { geometry } = profile;
  const revision = options.decor?.(at.documentIndex) ?? null;
  const laid = engine.layoutPage(p, pageIndex);
  const drawings = PDF_FURNITURE.map((entry) =>
    entry.draw({
      pageIndex: at.documentIndex,
      pageCount: at.pageCount,
      pageLabel: laid.label,
      profile,
      title: options.title ?? null,
      revision,
      watermark: options.watermark ?? null,
      header: options.header ?? null,
      footer: options.footer ?? null,
      dateFormat: options.dateFormat ?? null,
      section:
        options.sections?.[at.documentIndex] ?? options.section ?? section,
      revisionLabel: options.revisionLabel ?? null,
      day: options.day ?? null,
      durationMs: at.durationMs,
    }),
  );
  const replaced = new Set(PDF_FURNITURE.flatMap((entry) => entry.replaces));
  doc.addPage({ size: [geometry.widthPt, geometry.heightPt], margin: 0 });
  for (const { paper } of drawings)
    if (paper !== null) {
      const [r, g, b] = paper;
      doc
        .save()
        .fillColor([r, g, b])
        .rect(0, 0, geometry.widthPt, geometry.heightPt)
        .fill()
        .restore();
    }
  drawLines(
    pen,
    laid.lines.filter((line) => !replaced.has(line.kind)),
    geometry,
  );
  for (const [index, { lines, rules }] of drawings.entries()) {
    if (PDF_FURNITURE[index]!.replaces.length === 0) continue;
    drawLines(pen, lines, geometry);
    for (const lineRule of rules ?? [])
      rule(
        doc,
        geometry.marginLeftPt + lineRule.x * CELL_PT,
        geometry.marginTopPt + lineRule.y * UNIT_PT,
        lineRule.cells,
      );
  }
  for (const [index, { lines, rules }] of drawings.entries()) {
    if (PDF_FURNITURE[index]!.replaces.length > 0) continue;
    drawLines(pen, lines, geometry);
    for (const lineRule of rules ?? [])
      rule(
        doc,
        geometry.marginLeftPt + lineRule.x * CELL_PT,
        geometry.marginTopPt + lineRule.y * UNIT_PT,
        lineRule.cells,
      );
  }
}

function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `no engine of version ${p.engineVersion} in this build`,
    );
  return engine;
}

/**
 * The pages of `parts`, one after another, as one PDF, each part drawn with the engine it was paginated with and on
 * its own paper. The front pages come first, on the first part's paper; `pages` and `decor` count the pages of every
 * part in turn. Equal input gives equal bytes. Throws RangeError for no part, for a part whose engine this build does
 * not carry and for a page index past the last page.
 */
export async function writePdfParts(
  parts: readonly Pagination[],
  options: PdfOptions,
): Promise<Uint8Array> {
  const first = parts[0];
  if (first === undefined)
    throw new RangeError("a PDF is written from at least one part, not none");
  const engines = parts.map(engineOf);
  const { geometry } = first.profile;
  const { pdf: doc, finish } = startPdf({
    widthPt: geometry.widthPt,
    heightPt: geometry.heightPt,
    title: options.title ?? "",
    createdAt: options.createdAt,
    fonts: options.fonts,
  });
  const computedDuration =
    options.durationMs !== undefined
      ? options.durationMs
      : durationOfParts(parts);
  const pages: PartPage[] = parts.flatMap((p, k) => {
    const pen = { doc, engine: engines[k]! };
    const sections = sectionsOfPagination(p);
    return p.pages.map((_, pageIndex) => ({
      pen,
      p,
      pageIndex,
      section: sections[pageIndex] ?? null,
    }));
  });
  for (const page of options.front ?? []) {
    doc.addPage();
    drawLines({ doc, engine: engines[0]! }, page.lines, geometry);
  }
  for (const documentIndex of options.pages ?? pages.map((_, k) => k)) {
    const page = pages[documentIndex];
    if (page === undefined)
      throw new RangeError(
        `a page index must be below ${pages.length}, not ${documentIndex}`,
      );
    drawPage(
      page,
      {
        documentIndex,
        pageCount: pages.length,
        durationMs: computedDuration,
      },
      options,
    );
  }
  return await finish();
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
  return await writePdfParts([p], options);
}
