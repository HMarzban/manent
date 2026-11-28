// A page as lines and graphics placed on its grid: what the PDF and the print view draw.
import type { GraphicKind } from "@manent/schema";

export const LINE_KINDS = [
  "text",
  "more",
  "contd",
  "scene_continued",
  "scene_continued_foot",
  "page_number",
  "scene_number",
  "speech_number",
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** Text as drawn, capitals applied, in one style byte. */
export interface LineRun {
  readonly text: string;
  readonly style: number;
}

export interface PositionedLine {
  readonly kind: LineKind;
  /** Cells from the text edge; may be negative or fractional. */
  readonly x: number;
  /** Optional explicit horizontal offset in points (used by Engine 3 proportional book typography). */
  readonly xPt?: number;
  /** Units from the top of the text area; negative in the top margin. */
  readonly y: number;
  /** The drawn width in cells, trailing spaces left out. */
  readonly cells: number;
  readonly runs: readonly LineRun[];
  /** Text lines only; null and -1 for furniture. */
  readonly blockId: string | null;
  readonly blockLine: number;
}

/** One inline graphic box placed on a page's grid. */
export interface PositionedGraphic {
  readonly blockId: string;
  readonly kind: GraphicKind;
  readonly assetId: string | null;
  readonly label: string;
  readonly alt: string;
  /** Cells from the text edge. */
  readonly x: number;
  /** Units (half-lines) from the top of the text area. */
  readonly y: number;
  /** Width of the graphic box in cells. */
  readonly widthCells: number;
  /** Height of the graphic box in whole lines (integer 2..24). */
  readonly heightLines: number;
  readonly aspectWidth: number | null;
  readonly aspectHeight: number | null;
}

export interface LaidOutPage {
  readonly index: number;
  readonly label: string;
  readonly lines: readonly PositionedLine[];
  readonly graphics: readonly PositionedGraphic[];
}

/** Where a text line of a page sits: line `blockLine` of the block `blockId`, at the `y` its PositionedLine has. */
export interface LinePlace {
  readonly blockId: string;
  readonly blockLine: number;
  readonly y: number;
}
