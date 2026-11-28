// Appended PDF back-matter pages (Acknowledgements and About the author) matching the book's serif or script face.
import {
  CELL_PT,
  STYLE,
  linePtOf,
  pageMarginLeftPt,
  unitPtOf,
} from "@manent/pagination";
import type { Engine, PageGeometry, PageProfile } from "@manent/pagination";
import { hasBackMatter } from "../book/matter.ts";
import type { BookBackMatter } from "../book/matter.ts";
import {
  bookFontScale,
  drawGlyphRun,
  drawProportionalRun,
  fontScale,
} from "./draw.ts";
import { drawEndnotesPages } from "./endnotes.ts";
import type { PdfEndnote } from "./endnotes.ts";

const SCRIPT_SCALE = fontScale(12, CELL_PT);

function wrapParagraph(text: string, maxCells: number): string[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p]!.trim()
      .split(/\s+/)
      .filter((w) => w !== "");
    if (words.length === 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (current === "") current = word;
      else if (current.length + 1 + word.length <= maxCells)
        current = `${current} ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current !== "") lines.push(current);
    if (p < paragraphs.length - 1) lines.push("");
  }
  return lines;
}

function drawSection(
  doc: PDFKit.PDFDocument,
  engine: Engine,
  profile: PageProfile,
  heading: string,
  body: string,
  useBookSerif: boolean,
  startPageIndex: number,
): number {
  const geometry: PageGeometry = profile.geometry;
  const unitPt = unitPtOf(profile);
  const scale =
    useBookSerif && profile.typography !== undefined
      ? bookFontScale(profile.typography.fontSizePt, linePtOf(profile))
      : SCRIPT_SCALE;
  const maxCells = Math.max(30, profile.columnCells);
  const bodyLines = wrapParagraph(body, maxCells);
  const rows: { text: string; style: number }[] = [
    { text: "", style: 0 },
    { text: "", style: 0 },
    { text: heading, style: STYLE.BOLD },
    { text: "", style: 0 },
    ...bodyLines.map((text) => ({ text, style: 0 })),
  ];
  const linesPerPage = Math.max(10, profile.linesPerPage);
  let pageNum = startPageIndex;

  for (let start = 0; start < rows.length; start += linesPerPage) {
    doc.addPage({ size: [geometry.widthPt, geometry.heightPt], margin: 0 });
    const marginLeftPt = pageMarginLeftPt(geometry, pageNum);
    pageNum += 1;
    const slice = rows.slice(start, start + linesPerPage);
    for (let i = 0; i < slice.length; i++) {
      const row = slice[i]!;
      if (row.text === "") continue;
      const y = geometry.marginTopPt + i * 2 * unitPt + scale.baselinePt;
      if (useBookSerif && profile.typography !== undefined) {
        drawProportionalRun(doc, row.text, row.style, marginLeftPt, y, scale);
      } else {
        drawGlyphRun(doc, row.text, row.style, marginLeftPt, y, scale, engine);
      }
    }
  }
  return pageNum;
}

/** Appends clean Acknowledgements and About-the-author pages after the body and any endnotes. */
export function drawBackMatterPages(options: {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
  readonly profile: PageProfile;
  readonly backMatter: BookBackMatter;
  readonly useBookSerif?: boolean;
  readonly startPageIndex?: number;
}): number {
  const { doc, engine, profile, backMatter, useBookSerif = false } = options;
  let pageNum = options.startPageIndex ?? 0;
  const ack = (backMatter.acknowledgments ?? "").trim();
  if (ack !== "") {
    pageNum = drawSection(
      doc,
      engine,
      profile,
      "Acknowledgements",
      ack,
      useBookSerif,
      pageNum,
    );
  }
  const about = (backMatter.aboutAuthor ?? "").trim();
  if (about !== "") {
    pageNum = drawSection(
      doc,
      engine,
      profile,
      "About the author",
      about,
      useBookSerif,
      pageNum,
    );
  }
  return pageNum;
}

/** Draws optional endnotes and book back-matter pages after the body pages. */
export function drawTrailingBookPages(options: {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
  readonly profile: PageProfile;
  readonly useBookSerif: boolean;
  readonly startPageIndex: number;
  readonly footnotes?: readonly PdfEndnote[];
  readonly backMatter?: BookBackMatter | null;
}): void {
  let trailingIndex = options.startPageIndex;
  if (options.footnotes !== undefined && options.footnotes.length > 0) {
    drawEndnotesPages({
      doc: options.doc,
      engine: options.engine,
      profile: options.profile,
      footnotes: options.footnotes,
      useBookSerif: options.useBookSerif,
      startPageIndex: trailingIndex,
    });
    trailingIndex += Math.ceil(
      (options.footnotes.length * 3 + 2) /
        Math.max(10, options.profile.linesPerPage),
    );
  }
  if (
    options.backMatter !== undefined &&
    options.backMatter !== null &&
    hasBackMatter(options.backMatter)
  ) {
    drawBackMatterPages({
      doc: options.doc,
      engine: options.engine,
      profile: options.profile,
      backMatter: options.backMatter,
      useBookSerif: options.useBookSerif,
      startPageIndex: trailingIndex,
    });
  }
}
