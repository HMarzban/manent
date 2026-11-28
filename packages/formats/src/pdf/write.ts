// A PDF drawn line by line from the positioned lines of the engine a script was paginated with, in
// the script font's own faces (or Source Serif 4 for Layout Engine 3 book manuscripts).
import {
  CELL_PT,
  STYLE,
  cellPtOf,
  engineFor,
  linePtOf,
  pageMarginLeftPt,
  unitPtOf,
} from "@manent/pagination";
import type {
  Engine,
  FrontPage,
  PageProfile,
  Pagination,
} from "@manent/pagination";
import {
  bookFontScale,
  drawGlyphRun,
  drawProportionalRun,
  fontScale,
  startPdf,
} from "./draw.ts";
import { drawEndnotesPages } from "./endnotes.ts";
import type { PdfEndnote } from "./endnotes.ts";
import type { ScriptFontFiles } from "./fonts.ts";
import { drawPageGraphics } from "./graphics.ts";
import type { PdfAsset } from "./graphics.ts";

export type { PdfAsset, PdfEndnote };
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
  /** Decoded PNG/JPEG blobs keyed by SHA-256 assetId; missing entries render as vector placeholders. */
  readonly assets?: ReadonlyMap<string, PdfAsset>;
  /** Manuscript endnotes appended after the final body page without shifting body page breaks. */
  readonly footnotes?: readonly PdfEndnote[];
  /** Optional Source Serif 4 faces used when a part uses Layout Engine 3 book serif typography. */
  readonly bookFonts?: ScriptFontFiles;
}

const SCRIPT_SCALE = fontScale(12, CELL_PT);
const RULE_LINE_PT = 0.6;
const UNDERLINE_BELOW_PT = 1.5;
const STRIKE_ABOVE_PT = 3.5;

interface Pen {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
  readonly hasBookFonts: boolean;
}

function rulePt(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  widthPt: number,
): void {
  doc
    .save()
    .lineWidth(RULE_LINE_PT)
    .moveTo(x, y)
    .lineTo(x + widthPt, y)
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
    rulePt(doc, x, y + UNDERLINE_BELOW_PT, cells * CELL_PT);
  if ((style & STYLE.STRIKE) !== 0)
    rulePt(doc, x, y - STRIKE_ABOVE_PT, cells * CELL_PT);
  return cells;
}

function drawLines(
  pen: Pen,
  lines: readonly FurnitureLine[],
  profile: PageProfile,
  pageIndex: number,
): void {
  const { geometry, typography } = profile;
  const marginLeftPt = pageMarginLeftPt(geometry, pageIndex);
  const unitPt = unitPtOf(profile);
  const cellPt = cellPtOf(profile);
  const useBookSerif = pen.hasBookFonts && typography?.kind === "book_serif";
  if (useBookSerif && typography !== undefined) {
    const scale = bookFontScale(typography.fontSizePt, linePtOf(profile));
    for (const line of lines) {
      let x = marginLeftPt + (line.xPt ?? line.x * cellPt);
      const y = geometry.marginTopPt + line.y * unitPt + scale.baselinePt;
      for (const run of line.runs) {
        const w = drawProportionalRun(
          pen.doc,
          run.text,
          run.style,
          x,
          y,
          scale,
        );
        if ((run.style & STYLE.UNDERLINE) !== 0)
          rulePt(pen.doc, x, y + UNDERLINE_BELOW_PT, w);
        if ((run.style & STYLE.STRIKE) !== 0)
          rulePt(pen.doc, x, y - STRIKE_ABOVE_PT, w);
        x += w;
      }
    }
    return;
  }
  for (const line of lines) {
    let cell = line.x;
    const y = geometry.marginTopPt + line.y * unitPt + SCRIPT_SCALE.baselinePt;
    for (const run of line.runs)
      cell += drawRun(
        pen,
        run.text,
        run.style,
        marginLeftPt + cell * CELL_PT,
        y,
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
  const marginLeftPt = pageMarginLeftPt(geometry, at.documentIndex);
  const unitPt = unitPtOf(profile);
  const cellPt = cellPtOf(profile);
  if (laid.graphics.length > 0)
    drawPageGraphics(
      doc,
      laid.graphics,
      geometry,
      options.assets,
      engine,
      profile,
      at.documentIndex,
    );
  drawLines(
    pen,
    laid.lines.filter((line) => !replaced.has(line.kind)),
    profile,
    at.documentIndex,
  );
  for (const [index, { lines, rules }] of drawings.entries()) {
    if (PDF_FURNITURE[index]!.replaces.length === 0) continue;
    drawLines(pen, lines, profile, at.documentIndex);
    for (const lineRule of rules ?? [])
      rulePt(
        doc,
        marginLeftPt + lineRule.x * cellPt,
        geometry.marginTopPt + lineRule.y * unitPt,
        lineRule.cells * cellPt,
      );
  }
  for (const [index, { lines, rules }] of drawings.entries()) {
    if (PDF_FURNITURE[index]!.replaces.length > 0) continue;
    drawLines(pen, lines, profile, at.documentIndex);
    for (const lineRule of rules ?? [])
      rulePt(
        doc,
        marginLeftPt + lineRule.x * cellPt,
        geometry.marginTopPt + lineRule.y * unitPt,
        lineRule.cells * cellPt,
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
  const hasBookFonts = options.bookFonts !== undefined;
  const { pdf: doc, finish } = startPdf({
    widthPt: geometry.widthPt,
    heightPt: geometry.heightPt,
    title: options.title ?? "",
    createdAt: options.createdAt,
    fonts: options.fonts,
    bookFonts: options.bookFonts,
  });
  const computedDuration =
    options.durationMs !== undefined
      ? options.durationMs
      : durationOfParts(parts);
  const pages: PartPage[] = parts.flatMap((p, k) => {
    const pen: Pen = { doc, engine: engines[k]!, hasBookFonts };
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
    drawLines(
      { doc, engine: engines[0]!, hasBookFonts },
      page.lines,
      first.profile,
      0,
    );
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
  if (options.footnotes !== undefined && options.footnotes.length > 0) {
    drawEndnotesPages({
      doc,
      engine: engines[0]!,
      profile: first.profile,
      footnotes: options.footnotes,
      useBookSerif:
        hasBookFonts && first.profile.typography?.kind === "book_serif",
      startPageIndex: pages.length,
    });
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
