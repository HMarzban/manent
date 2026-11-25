// The two-column Variety PDF: each story from a new page, 40 % left (Bracket, Slug, General) and
// 60 % right (Character in capitals, Parenthetical, Dialogue), one table row per block.
import { STYLE, upperCase } from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import type { BlockJSON, GraphicAttrs } from "@manent/schema";
import { CURRENT_GLYPH_METRICS } from "../pdf/draw.ts";
import type { ScriptFontFiles } from "../pdf/fonts.ts";
import { drawGraphicBox } from "../pdf/graphics.ts";
import type { PdfAsset } from "../pdf/graphics.ts";
import {
  PAPER_PORTRAIT_PT,
  drawHairline,
  drawScriptLine,
  fontScale,
  startPdf,
  wrapTextLines,
} from "./pdf-draw.ts";
import type { FontScale } from "./pdf-draw.ts";
import { blockPlainText, rowStoryHeading } from "./rundown-for-export.ts";
import type {
  RundownExportRow,
  RundownForExport,
} from "./rundown-for-export.ts";

export interface VarietyTwoColumnOptions {
  readonly paper: Paper;
  readonly fonts: ScriptFontFiles;
  /** Milliseconds since the epoch, written as the creation and modification dates; 0 when absent. */
  readonly createdAt?: number;
  /** Optional decoded PNG/JPEG blobs keyed by SHA-256 assetId for inline graphics in the left column. */
  readonly assets?: ReadonlyMap<string, PdfAsset>;
}

interface TableGeometry {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly marginPt: number;
  readonly contentWidthPt: number;
  readonly dividerXPt: number;
  readonly leftXPt: number;
  readonly rightXPt: number;
  readonly leftMaxCells: number;
  readonly rightMaxCells: number;
  readonly fullMaxCells: number;
  readonly bottomPt: number;
}

interface PlacedRow {
  readonly side: "left" | "right";
  readonly style: number;
  readonly lines: readonly string[];
  readonly graphic?: GraphicAttrs;
}

const FONT_SIZE_PT = 12;
const LINE_HEIGHT_PT = 14;
const MARGIN_PT = 54;
const ROW_PAD_Y_PT = 4;
const HEADING_GAP_PT = 8;
const HEADER_RULE_PT = 0.75;
const ROW_RULE_PT = 0.4;
const RULE_RGB: readonly [number, number, number] = [160, 160, 160];

const RIGHT_TYPES: ReadonlySet<string> = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

function geometryFor(paper: Paper, cellPt: number): TableGeometry {
  const { widthPt, heightPt } = PAPER_PORTRAIT_PT[paper];
  const contentWidthPt = widthPt - MARGIN_PT * 2;
  const leftWidthPt = contentWidthPt * 0.4;
  const rightWidthPt = contentWidthPt * 0.6;
  const colPadPt = cellPt;
  return {
    widthPt,
    heightPt,
    marginPt: MARGIN_PT,
    contentWidthPt,
    dividerXPt: MARGIN_PT + leftWidthPt,
    leftXPt: MARGIN_PT,
    rightXPt: MARGIN_PT + leftWidthPt + colPadPt,
    leftMaxCells: Math.max(1, Math.floor((leftWidthPt - colPadPt) / cellPt)),
    rightMaxCells: Math.max(1, Math.floor((rightWidthPt - colPadPt) / cellPt)),
    fullMaxCells: Math.max(1, Math.floor(contentWidthPt / cellPt)),
    bottomPt: heightPt - MARGIN_PT,
  };
}

function classifyBlock(
  block: BlockJSON,
  geom: TableGeometry,
): PlacedRow | "page_break" | null {
  if (block.attrs?.omitted === true) return null;
  const type = block.attrs?.type ?? "general";
  if (type === "group") return null;
  if (type === "page_break") return "page_break";
  const raw = blockPlainText(block);
  if (type === "graphic") {
    const g: GraphicAttrs = block.attrs?.graphic ?? {
      kind: "image",
      assetId: null,
      heightLines: 6,
      label: "",
      alt: "",
      aspectWidth: null,
      aspectHeight: null,
    };
    return {
      side: "left",
      style: 0,
      lines: raw === "" ? [] : wrapTextLines(raw, geom.leftMaxCells),
      graphic: g,
    };
  }
  if (RIGHT_TYPES.has(type)) {
    const text = type === "character" ? upperCase(raw) : raw;
    return {
      side: "right",
      style: 0,
      lines: wrapTextLines(text, geom.rightMaxCells),
    };
  }
  return {
    side: "left",
    style: type === "slug" ? STYLE.BOLD : 0,
    lines: wrapTextLines(raw, geom.leftMaxCells),
  };
}

function drawTableRowChunk(
  pdf: PDFKit.PDFDocument,
  geom: TableGeometry,
  scale: FontScale,
  topY: number,
  side: "left" | "right",
  style: number,
  lines: readonly string[],
): number {
  const xPt = side === "left" ? geom.leftXPt : geom.rightXPt;
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i]!;
    if (text !== "")
      drawScriptLine(
        pdf,
        text,
        xPt,
        topY + ROW_PAD_Y_PT + i * LINE_HEIGHT_PT + scale.baselinePt,
        style,
        scale,
      );
  }
  const bottomY = topY + lines.length * LINE_HEIGHT_PT + ROW_PAD_Y_PT * 2;
  drawHairline(
    pdf,
    geom.dividerXPt,
    topY,
    geom.dividerXPt,
    bottomY,
    ROW_RULE_PT,
    RULE_RGB,
  );
  drawHairline(
    pdf,
    geom.marginPt,
    bottomY,
    geom.marginPt + geom.contentWidthPt,
    bottomY,
    ROW_RULE_PT,
    RULE_RGB,
  );
  return bottomY;
}

function drawStoryHeading(
  pdf: PDFKit.PDFDocument,
  heading: string,
  geom: TableGeometry,
  scale: FontScale,
  startY: number,
): number {
  if (heading === "") return startY;
  let cursorY = startY;
  for (const line of wrapTextLines(heading, geom.fullMaxCells)) {
    drawScriptLine(
      pdf,
      line,
      geom.marginPt,
      cursorY + scale.baselinePt,
      STYLE.BOLD,
      scale,
    );
    cursorY += LINE_HEIGHT_PT;
  }
  cursorY += HEADING_GAP_PT;
  drawHairline(
    pdf,
    geom.marginPt,
    cursorY,
    geom.marginPt + geom.contentWidthPt,
    cursorY,
    HEADER_RULE_PT,
    RULE_RGB,
  );
  return cursorY;
}

interface StoryCursor {
  cursorY: number;
  drewRowOnPage: boolean;
}

function openVarietyPage(pdf: PDFKit.PDFDocument, geom: TableGeometry): number {
  pdf.addPage({ size: [geom.widthPt, geom.heightPt], margin: 0 });
  return geom.marginPt;
}

function drawPlacedRow(
  pdf: PDFKit.PDFDocument,
  state: StoryCursor,
  placed: PlacedRow,
  geom: TableGeometry,
  scale: FontScale,
  maxLinesPerPage: number,
): void {
  let offset = 0;
  while (offset < placed.lines.length) {
    const remainingLines = Math.floor(
      (geom.bottomPt - state.cursorY - ROW_PAD_Y_PT * 2) / LINE_HEIGHT_PT,
    );
    const needLines = placed.lines.length - offset;
    if (
      state.drewRowOnPage &&
      remainingLines < Math.min(needLines, maxLinesPerPage)
    ) {
      state.cursorY = openVarietyPage(pdf, geom);
      state.drewRowOnPage = false;
      continue;
    }
    const take = Math.max(
      1,
      Math.min(
        needLines,
        remainingLines > 0 ? remainingLines : maxLinesPerPage,
      ),
    );
    state.cursorY = drawTableRowChunk(
      pdf,
      geom,
      scale,
      state.cursorY,
      placed.side,
      placed.style,
      placed.lines.slice(offset, offset + take),
    );
    state.drewRowOnPage = true;
    offset += take;
  }
}

function drawGraphicRow(
  pdf: PDFKit.PDFDocument,
  state: StoryCursor,
  placed: PlacedRow,
  geom: TableGeometry,
  scale: FontScale,
  assets: ReadonlyMap<string, PdfAsset> | undefined,
): void {
  const g = placed.graphic!;
  const boxHeightPt = Math.min(
    g.heightLines * LINE_HEIGHT_PT,
    geom.bottomPt - geom.marginPt - ROW_PAD_Y_PT * 2,
  );
  const captionHeightPt = placed.lines.length * LINE_HEIGHT_PT;
  const totalHeightPt =
    boxHeightPt +
    (captionHeightPt > 0 ? 4 + captionHeightPt : 0) +
    ROW_PAD_Y_PT * 2;
  if (state.drewRowOnPage && state.cursorY + totalHeightPt > geom.bottomPt) {
    state.cursorY = openVarietyPage(pdf, geom);
    state.drewRowOnPage = false;
  }
  const topY = state.cursorY;
  const boxWidthPt = geom.leftMaxCells * scale.cellPt;
  const asset = g.assetId !== null ? assets?.get(g.assetId) : undefined;
  drawGraphicBox(
    pdf,
    {
      xPt: geom.leftXPt,
      yPt: topY + ROW_PAD_Y_PT,
      widthPt: boxWidthPt,
      heightPt: boxHeightPt,
    },
    { kind: g.kind, label: g.label, alt: g.alt },
    asset,
    CURRENT_GLYPH_METRICS,
  );
  let textY = topY + ROW_PAD_Y_PT + boxHeightPt + 4;
  for (const line of placed.lines) {
    if (line !== "")
      drawScriptLine(
        pdf,
        line,
        geom.leftXPt,
        textY + scale.baselinePt,
        0,
        scale,
      );
    textY += LINE_HEIGHT_PT;
  }
  const bottomY = topY + totalHeightPt;
  drawHairline(
    pdf,
    geom.dividerXPt,
    topY,
    geom.dividerXPt,
    bottomY,
    ROW_RULE_PT,
    RULE_RGB,
  );
  drawHairline(
    pdf,
    geom.marginPt,
    bottomY,
    geom.marginPt + geom.contentWidthPt,
    bottomY,
    ROW_RULE_PT,
    RULE_RGB,
  );
  state.cursorY = bottomY;
  state.drewRowOnPage = true;
}

function drawStory(
  pdf: PDFKit.PDFDocument,
  row: RundownExportRow,
  geom: TableGeometry,
  scale: FontScale,
  assets: ReadonlyMap<string, PdfAsset> | undefined,
): void {
  const state: StoryCursor = {
    cursorY: drawStoryHeading(
      pdf,
      rowStoryHeading(row),
      geom,
      scale,
      openVarietyPage(pdf, geom),
    ),
    drewRowOnPage: false,
  };
  const maxLinesPerPage = Math.max(
    1,
    Math.floor(
      (geom.bottomPt - geom.marginPt - ROW_PAD_Y_PT * 2) / LINE_HEIGHT_PT,
    ),
  );
  for (const block of row.story!.blocks) {
    const placed = classifyBlock(block, geom);
    if (placed === null) continue;
    if (placed === "page_break") {
      state.cursorY = openVarietyPage(pdf, geom);
      state.drewRowOnPage = false;
      continue;
    }
    if (placed.graphic !== undefined)
      drawGraphicRow(pdf, state, placed, geom, scale, assets);
    else drawPlacedRow(pdf, state, placed, geom, scale, maxLinesPerPage);
  }
}

/**
 * The chosen rows' stories in run order as a two-column Variety PDF, each story starting on a new
 * page. Header rows and rows without a story are skipped. Equal input gives equal bytes. Throws
 * RangeError when no row holds a story.
 */
export async function writeVarietyTwoColumnPdf(
  rundown: RundownForExport,
  options: VarietyTwoColumnOptions,
): Promise<Uint8Array> {
  const stories = rundown.rows.filter(
    (row) => row.kind === "story" && row.story !== null,
  );
  if (stories.length === 0)
    throw new RangeError(
      "a two-column Variety PDF requires at least one story row, not none",
    );
  const scale = fontScale(FONT_SIZE_PT);
  const geom = geometryFor(options.paper, scale.cellPt);
  const { pdf, finish } = startPdf({
    widthPt: geom.widthPt,
    heightPt: geom.heightPt,
    title: rundown.title,
    createdAt: options.createdAt,
    fonts: options.fonts,
  });
  for (const row of stories) drawStory(pdf, row, geom, scale, options.assets);
  return await finish();
}
