// Appended PDF endnotes pages for manuscript footnotes (preserves v1/v2/v3 manuscript page breaks).
import {
  CELL_PT,
  STYLE,
  cellPtOf,
  linePtOf,
  pageMarginLeftPt,
  unitPtOf,
} from "@manent/pagination";
import type { Engine, PageGeometry, PageProfile } from "@manent/pagination";
import type { ExtractedFootnote } from "../script/footnotes.ts";
import {
  bookFontScale,
  drawGlyphRun,
  drawProportionalRun,
  fontScale,
} from "./draw.ts";

export interface PdfEndnote {
  readonly ordinal: number;
  readonly text: string;
  readonly pageLabel?: string | null;
}

const SCRIPT_SCALE = fontScale(12, CELL_PT);

function wrapCells(text: string, maxCells: number): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line === "") {
      line = word;
    } else if (line.length + 1 + word.length <= maxCells) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** Appends clean numbered endnote pages after the manuscript body without disturbing body page breaks. */
export function drawEndnotesPages(options: {
  readonly doc: PDFKit.PDFDocument;
  readonly engine: Engine;
  readonly profile: PageProfile;
  readonly footnotes: readonly (PdfEndnote | ExtractedFootnote)[];
  readonly useBookSerif?: boolean;
  readonly startPageIndex?: number;
}): void {
  const { doc, engine, profile, footnotes, useBookSerif = false } = options;
  if (footnotes.length === 0) return;
  const geometry: PageGeometry = profile.geometry;
  const cellPt = cellPtOf(profile);
  const unitPt = unitPtOf(profile);
  const scale =
    useBookSerif && profile.typography !== undefined
      ? bookFontScale(profile.typography.fontSizePt, linePtOf(profile))
      : SCRIPT_SCALE;
  const maxCells = Math.max(30, profile.columnCells);
  const rows: { text: string; style: number; indent: number }[] = [
    { text: "Notes", style: STYLE.BOLD, indent: 0 },
    { text: "", style: 0, indent: 0 },
  ];

  for (const note of footnotes) {
    const pagePart =
      "pageLabel" in note &&
      typeof note.pageLabel === "string" &&
      note.pageLabel !== ""
        ? ` (p. ${note.pageLabel})`
        : "";
    const prefix = `${note.ordinal}.${pagePart} `;
    const wrapped = wrapCells(prefix + note.text, maxCells);
    for (let i = 0; i < wrapped.length; i++) {
      rows.push({
        text: wrapped[i]!,
        style: 0,
        indent: i === 0 ? 0 : 3,
      });
    }
    rows.push({ text: "", style: 0, indent: 0 });
  }

  const linesPerPage = Math.max(10, profile.linesPerPage);
  let pageNum = options.startPageIndex ?? 0;
  for (let start = 0; start < rows.length; start += linesPerPage) {
    doc.addPage({ size: [geometry.widthPt, geometry.heightPt], margin: 0 });
    const marginLeftPt = pageMarginLeftPt(geometry, pageNum);
    pageNum += 1;
    const slice = rows.slice(start, start + linesPerPage);
    for (let i = 0; i < slice.length; i++) {
      const row = slice[i]!;
      if (row.text === "") continue;
      const x = marginLeftPt + row.indent * cellPt;
      const y = geometry.marginTopPt + i * 2 * unitPt + scale.baselinePt;
      if (useBookSerif && profile.typography !== undefined) {
        drawProportionalRun(doc, row.text, row.style, x, y, scale);
      } else {
        drawGlyphRun(doc, row.text, row.style, x, y, scale, engine);
      }
    }
  }
}
