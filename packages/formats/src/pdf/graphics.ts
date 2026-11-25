// Pure PDFKit rendering for inline graphic boxes, chyron badges and offline vector placeholders.
import {
  CELL_PT,
  STYLE,
  UNIT_PT,
  UNITS_PER_LINE,
  graphicCueTag,
} from "@manent/pagination";
import type { PageGeometry, PositionedGraphic } from "@manent/pagination";
import type { GraphicKind } from "@manent/schema";
import { drawGlyphRun, fontScale } from "./draw.ts";
import type { GlyphMetrics } from "./draw.ts";

/** Decoded raster bytes PDFKit embeds natively inside a script or two-column PDF. */
export interface PdfAsset {
  readonly mime: "image/png" | "image/jpeg";
  readonly bytes: Uint8Array;
}

export interface GraphicRectPt {
  readonly xPt: number;
  readonly yPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

export interface GraphicBoxMeta {
  readonly kind: GraphicKind;
  readonly label: string;
  readonly alt: string;
}

const FRAME_LINE_PT = 0.5;
const FRAME_RGB: readonly [number, number, number] = [176, 176, 176];
const PLACEHOLDER_FILL_RGB: readonly [number, number, number] = [244, 244, 244];
const BADGE_FILL_RGB: readonly [number, number, number] = [235, 235, 235];
const INK_RGB: readonly [number, number, number] = [32, 32, 32];
const MUTED_RGB: readonly [number, number, number] = [96, 96, 96];
const PAD_PT = 4;
const BADGE_SCALE = fontScale(8.5);
const LABEL_SCALE = fontScale(9.5);
const BADGE_HEIGHT_PT = 12;

/** Returns an exact ArrayBuffer slice for pure PDFKit image embedding without Node Buffer. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Truncates `text` to at most `maxCells` cells with an ellipsis when needed. */
function fitCells(
  text: string,
  maxCells: number,
  metrics: GlyphMetrics,
): string {
  if (maxCells <= 0 || text === "") return "";
  if (metrics.clusterCells(text, 0, text.length, false) <= maxCells)
    return text;
  let out = "";
  let used = 0;
  for (let at = 0; at < text.length;) {
    const end = metrics.graphemeEnd(text, at);
    const cells = metrics.clusterCells(text, at, end, false);
    if (used + cells + 1 > maxCells) break;
    out += text.slice(at, end);
    used += cells;
    at = end;
  }
  return `${out}…`;
}

function drawBadge(
  doc: PDFKit.PDFDocument,
  xPt: number,
  yPt: number,
  maxWidthPt: number,
  tag: string,
  metrics: GlyphMetrics,
): void {
  const maxCells = Math.max(
    1,
    Math.floor((maxWidthPt - PAD_PT * 2) / BADGE_SCALE.cellPt),
  );
  const shown = fitCells(tag, maxCells, metrics);
  const cells = metrics.clusterCells(shown, 0, shown.length, false);
  const pillW = Math.min(maxWidthPt, cells * BADGE_SCALE.cellPt + PAD_PT * 2);
  doc
    .save()
    .fillColor([BADGE_FILL_RGB[0], BADGE_FILL_RGB[1], BADGE_FILL_RGB[2]])
    .rect(xPt, yPt, pillW, BADGE_HEIGHT_PT)
    .fill()
    .fillColor([INK_RGB[0], INK_RGB[1], INK_RGB[2]]);
  drawGlyphRun(
    doc,
    shown,
    STYLE.BOLD,
    xPt + PAD_PT,
    yPt + (BADGE_HEIGHT_PT - BADGE_SCALE.sizePt) / 2 + BADGE_SCALE.baselinePt,
    BADGE_SCALE,
    metrics,
  );
  doc.restore();
}

function drawPlaceholder(
  doc: PDFKit.PDFDocument,
  rect: GraphicRectPt,
  meta: GraphicBoxMeta,
  metrics: GlyphMetrics,
): void {
  const { xPt, yPt, widthPt, heightPt } = rect;
  doc
    .save()
    .fillColor([
      PLACEHOLDER_FILL_RGB[0],
      PLACEHOLDER_FILL_RGB[1],
      PLACEHOLDER_FILL_RGB[2],
    ])
    .rect(xPt, yPt, widthPt, heightPt)
    .fill()
    .restore();

  const tag = graphicCueTag(meta.kind);
  drawBadge(
    doc,
    xPt + PAD_PT,
    yPt + PAD_PT,
    Math.max(10, widthPt - PAD_PT * 2),
    tag,
    metrics,
  );

  const innerW = Math.max(10, widthPt - PAD_PT * 2);
  const maxCells = Math.max(1, Math.floor(innerW / LABEL_SCALE.cellPt));
  let lineY = yPt + PAD_PT + BADGE_HEIGHT_PT + PAD_PT;
  const bottomLimit = yPt + heightPt - PAD_PT;

  doc.save().fillColor([INK_RGB[0], INK_RGB[1], INK_RGB[2]]);
  if (meta.label.trim() !== "" && lineY + LABEL_SCALE.sizePt <= bottomLimit) {
    drawGlyphRun(
      doc,
      fitCells(meta.label.trim(), maxCells, metrics),
      STYLE.BOLD,
      xPt + PAD_PT,
      lineY + LABEL_SCALE.baselinePt,
      LABEL_SCALE,
      metrics,
    );
    lineY += LABEL_SCALE.sizePt + 3;
  }
  doc.fillColor([MUTED_RGB[0], MUTED_RGB[1], MUTED_RGB[2]]);
  if (meta.alt.trim() !== "" && lineY + LABEL_SCALE.sizePt <= bottomLimit) {
    drawGlyphRun(
      doc,
      fitCells(meta.alt.trim(), maxCells, metrics),
      0,
      xPt + PAD_PT,
      lineY + LABEL_SCALE.baselinePt,
      LABEL_SCALE,
      metrics,
    );
  }
  doc.restore();
}

/** Draws one graphic box (embedded PNG/JPEG with optional chyron badge, or offline vector placeholder). */
export function drawGraphicBox(
  doc: PDFKit.PDFDocument,
  rect: GraphicRectPt,
  meta: GraphicBoxMeta,
  asset: PdfAsset | undefined,
  metrics: GlyphMetrics,
): void {
  const { xPt, yPt, widthPt, heightPt } = rect;
  if (asset !== undefined) {
    const hasBadge = meta.kind !== "image";
    const topInset = hasBadge ? PAD_PT + BADGE_HEIGHT_PT + 2 : PAD_PT;
    const innerW = Math.max(4, widthPt - PAD_PT * 2);
    const innerH = Math.max(4, heightPt - topInset - PAD_PT);
    doc.save();
    doc.image(toArrayBuffer(asset.bytes), xPt + PAD_PT, yPt + topInset, {
      fit: [innerW, innerH],
      align: "center",
      valign: "center",
    });
    doc.restore();
    if (hasBadge) {
      drawBadge(
        doc,
        xPt + PAD_PT,
        yPt + PAD_PT,
        Math.max(10, widthPt - PAD_PT * 2),
        graphicCueTag(meta.kind),
        metrics,
      );
    }
  } else {
    drawPlaceholder(doc, rect, meta, metrics);
  }
  doc
    .save()
    .lineWidth(FRAME_LINE_PT)
    .strokeColor([FRAME_RGB[0], FRAME_RGB[1], FRAME_RGB[2]])
    .rect(xPt, yPt, widthPt, heightPt)
    .stroke()
    .restore();
}

/** Draws every positioned graphic box on a standard script PDF page. */
export function drawPageGraphics(
  doc: PDFKit.PDFDocument,
  graphics: readonly PositionedGraphic[],
  geometry: PageGeometry,
  assets: ReadonlyMap<string, PdfAsset> | undefined,
  metrics: GlyphMetrics,
): void {
  for (const g of graphics) {
    const rect: GraphicRectPt = {
      xPt: geometry.marginLeftPt + g.x * CELL_PT,
      yPt: geometry.marginTopPt + g.y * UNIT_PT,
      widthPt: g.widthCells * CELL_PT,
      heightPt: g.heightLines * UNITS_PER_LINE * UNIT_PT,
    };
    const asset = g.assetId !== null ? assets?.get(g.assetId) : undefined;
    drawGraphicBox(
      doc,
      rect,
      { kind: g.kind, label: g.label, alt: g.alt },
      asset,
      metrics,
    );
  }
}
