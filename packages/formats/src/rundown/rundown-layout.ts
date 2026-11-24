// Pure page layout for the rundown PDF and its web preview: landscape, 10 pt script font, repeating headers.
import type { Paper } from "@manent/pagination";
import { PAPER_PORTRAIT_PT, wrapTextLines } from "./pdf-draw.ts";
import { alignedX, layoutColumns, selectColumns } from "./rundown-columns.ts";
import type { RundownColumnLayout, SizedColumn } from "./rundown-columns.ts";
import { rowSlugCell } from "./rundown-for-export.ts";
import type {
  RundownExportRow,
  RundownForExport,
} from "./rundown-for-export.ts";

export interface RundownLayoutOptions {
  readonly paper: Paper;
  /** Displayed date line on page 1; defaults to `rundown.airDate`. */
  readonly dateLabel?: string;
  /** The "Air · Target · Over" line on page 1; omitted when null or empty. */
  readonly summaryLine?: string | null;
  /** Column IDs to include in the order of `rundown.columns`; all columns when omitted. */
  readonly columnIds?: readonly string[];
  /** Formats the bottom-right page number (for example `"1 of 3"`). */
  readonly formatPageNumber: (page: number, total: number) => string;
}

export interface RundownTextLine {
  readonly text: string;
  /** Left edge in points from the page's left edge. */
  readonly xPt: number;
  /** Top of the line box in points from the page's top edge. */
  readonly yPt: number;
  readonly bold: boolean;
}

export interface RundownRule {
  readonly x1Pt: number;
  readonly x2Pt: number;
  readonly yPt: number;
  readonly widthPt: number;
}

export interface RundownPage {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly fontSizePt: number;
  readonly lineHeightPt: number;
  readonly columns: readonly RundownColumnLayout[];
  readonly lines: readonly RundownTextLine[];
  readonly rules: readonly RundownRule[];
}

interface DraftPage {
  readonly lines: RundownTextLine[];
  readonly rules: RundownRule[];
  cursorY: number;
  bodyRows: number;
}

const FONT_SIZE_PT = 10;
const CELL_PT = FONT_SIZE_PT * 0.6;
const LINE_HEIGHT_PT = 12;
const MARGIN_PT = 36;
const COLUMN_GAP_PT = CELL_PT;
const ROW_PAD_Y_PT = 4;
const HEADING_GAP_PT = 10;
const FOOTER_GAP_PT = 8;
const HEADER_RULE_PT = 0.75;
const ROW_RULE_PT = 0.4;

function cellTextForRow(row: RundownExportRow, columnId: string): string {
  if (columnId === "number") {
    const cell = row.cells.number;
    if (cell !== undefined) return cell;
    return row.number === null ? "" : String(row.number);
  }
  return row.cells[columnId] ?? "";
}

function headerRowText(
  row: RundownExportRow,
  columns: readonly SizedColumn[],
): string {
  const slug = rowSlugCell(row);
  if (slug !== "") return slug;
  for (const col of columns) {
    if (col.id === "number") continue;
    const value = row.cells[col.id];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function addColumnHeaderRow(
  page: DraftPage,
  columns: readonly SizedColumn[],
  contentWidthPt: number,
): void {
  if (columns.length === 0) return;
  const wrapped = columns.map((col) => wrapTextLines(col.label, col.maxCells));
  const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
  const topY = page.cursorY + ROW_PAD_Y_PT;
  for (let c = 0; c < columns.length; c += 1) {
    const col = columns[c]!;
    const lines = wrapped[c]!;
    for (let l = 0; l < lines.length; l += 1) {
      const text = lines[l]!;
      if (text === "") continue;
      page.lines.push({
        text,
        xPt: alignedX(text, col.xPt, col.widthPt, col.align, CELL_PT),
        yPt: topY + l * LINE_HEIGHT_PT,
        bold: true,
      });
    }
  }
  const bottomY = page.cursorY + lineCount * LINE_HEIGHT_PT + ROW_PAD_Y_PT * 2;
  page.rules.push({
    x1Pt: MARGIN_PT,
    x2Pt: MARGIN_PT + contentWidthPt,
    yPt: bottomY,
    widthPt: HEADER_RULE_PT,
  });
  page.cursorY = bottomY;
}

function addOpeningHeading(
  page: DraftPage,
  rundown: RundownForExport,
  options: RundownLayoutOptions,
  fullWidthCells: number,
): void {
  const entries: readonly { readonly text: string; readonly bold: boolean }[] =
    [
      { text: rundown.title, bold: true },
      { text: options.dateLabel ?? rundown.airDate, bold: false },
      ...(options.summaryLine !== undefined &&
      options.summaryLine !== null &&
      options.summaryLine !== ""
        ? [{ text: options.summaryLine, bold: false }]
        : []),
    ];
  let drew = false;
  for (const entry of entries) {
    if (entry.text === "") continue;
    for (const line of wrapTextLines(entry.text, fullWidthCells)) {
      page.lines.push({
        text: line,
        xPt: MARGIN_PT,
        yPt: page.cursorY,
        bold: entry.bold,
      });
      page.cursorY += LINE_HEIGHT_PT;
      drew = true;
    }
  }
  if (drew) page.cursorY += HEADING_GAP_PT;
}

function buildRowEntries(
  row: RundownExportRow,
  columns: readonly SizedColumn[],
  fullWidthCells: number,
): {
  readonly heightPt: number;
  readonly lines: readonly {
    readonly text: string;
    readonly xPt: number;
    readonly offsetYPt: number;
    readonly bold: boolean;
  }[];
} {
  const lines: {
    readonly text: string;
    readonly xPt: number;
    readonly offsetYPt: number;
    readonly bold: boolean;
  }[] = [];
  if (row.kind === "header") {
    const wrapped = wrapTextLines(headerRowText(row, columns), fullWidthCells);
    for (let l = 0; l < wrapped.length; l += 1) {
      const text = wrapped[l]!;
      if (text !== "")
        lines.push({
          text,
          xPt: MARGIN_PT,
          offsetYPt: ROW_PAD_Y_PT + l * LINE_HEIGHT_PT,
          bold: true,
        });
    }
    return {
      heightPt: Math.max(1, wrapped.length) * LINE_HEIGHT_PT + ROW_PAD_Y_PT * 2,
      lines,
    };
  }
  let maxLines = 1;
  for (const col of columns) {
    const wrapped = wrapTextLines(cellTextForRow(row, col.id), col.maxCells);
    if (wrapped.length > maxLines) maxLines = wrapped.length;
    for (let l = 0; l < wrapped.length; l += 1) {
      const text = wrapped[l]!;
      if (text !== "")
        lines.push({
          text,
          xPt: alignedX(text, col.xPt, col.widthPt, col.align, CELL_PT),
          offsetYPt: ROW_PAD_Y_PT + l * LINE_HEIGHT_PT,
          bold: false,
        });
    }
  }
  return {
    heightPt: maxLines * LINE_HEIGHT_PT + ROW_PAD_Y_PT * 2,
    lines,
  };
}

function finalizePages(
  drafts: readonly DraftPage[],
  geometry: {
    readonly widthPt: number;
    readonly heightPt: number;
    readonly contentWidthPt: number;
    readonly footerYPt: number;
  },
  columns: readonly RundownColumnLayout[],
  formatPageNumber: (page: number, total: number) => string,
): RundownPage[] {
  const total = drafts.length;
  return drafts.map((draft, index) => {
    const pageNumber = index + 1;
    const label = formatPageNumber(pageNumber, total);
    const lines =
      label === ""
        ? draft.lines
        : [
            ...draft.lines,
            {
              text: label,
              xPt: alignedX(
                label,
                MARGIN_PT,
                geometry.contentWidthPt,
                "right",
                CELL_PT,
              ),
              yPt: geometry.footerYPt,
              bold: false,
            },
          ];
    return {
      pageNumber,
      pageCount: total,
      widthPt: geometry.widthPt,
      heightPt: geometry.heightPt,
      fontSizePt: FONT_SIZE_PT,
      lineHeightPt: LINE_HEIGHT_PT,
      columns,
      lines,
      rules: draft.rules,
    };
  });
}

/**
 * Lays out the rundown onto landscape pages in the 10 pt script font, returning exact positioned
 * lines and hairlines that both `writeRundownPdf` and the web preview draw.
 */
export function layoutRundownPages(
  rundown: RundownForExport,
  options: RundownLayoutOptions,
): RundownPage[] {
  const portrait = PAPER_PORTRAIT_PT[options.paper];
  const widthPt = portrait.heightPt;
  const heightPt = portrait.widthPt;
  const contentWidthPt = widthPt - MARGIN_PT * 2;
  const fullWidthCells = Math.max(1, Math.floor(contentWidthPt / CELL_PT));
  const footerYPt = heightPt - MARGIN_PT - LINE_HEIGHT_PT;
  const bodyBottomPt = footerYPt - FOOTER_GAP_PT;

  const sizedColumns = layoutColumns(
    selectColumns(rundown.columns, options.columnIds),
    contentWidthPt,
    MARGIN_PT,
    CELL_PT,
    COLUMN_GAP_PT,
  );
  const publicColumns: readonly RundownColumnLayout[] = sizedColumns.map(
    ({ id, label, xPt, widthPt: colWidthPt, align }) => ({
      id,
      label,
      xPt,
      widthPt: colWidthPt,
      align,
    }),
  );

  const drafts: DraftPage[] = [];
  const startPage = (first: boolean): DraftPage => {
    const page: DraftPage = {
      lines: [],
      rules: [],
      cursorY: MARGIN_PT,
      bodyRows: 0,
    };
    if (first) addOpeningHeading(page, rundown, options, fullWidthCells);
    addColumnHeaderRow(page, sizedColumns, contentWidthPt);
    drafts.push(page);
    return page;
  };

  let current = startPage(true);
  for (const row of rundown.rows) {
    const built = buildRowEntries(row, sizedColumns, fullWidthCells);
    if (current.bodyRows > 0 && current.cursorY + built.heightPt > bodyBottomPt)
      current = startPage(false);
    for (const entry of built.lines)
      current.lines.push({
        text: entry.text,
        xPt: entry.xPt,
        yPt: current.cursorY + entry.offsetYPt,
        bold: entry.bold,
      });
    const bottomY = current.cursorY + built.heightPt;
    current.rules.push({
      x1Pt: MARGIN_PT,
      x2Pt: MARGIN_PT + contentWidthPt,
      yPt: bottomY,
      widthPt: ROW_RULE_PT,
    });
    current.cursorY = bottomY;
    current.bodyRows += 1;
  }

  return finalizePages(
    drafts,
    { widthPt, heightPt, contentWidthPt, footerYPt },
    publicColumns,
    options.formatPageNumber,
  );
}
