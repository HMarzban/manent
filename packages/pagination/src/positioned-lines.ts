// A page as lines placed on its grid: what the PDF and the print view draw.

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
  /** Units from the top of the text area; negative in the top margin. */
  readonly y: number;
  /** The drawn width in cells, trailing spaces left out. */
  readonly cells: number;
  readonly runs: readonly LineRun[];
  /** Text lines only; null and -1 for furniture. */
  readonly blockId: string | null;
  readonly blockLine: number;
}

export interface LaidOutPage {
  readonly index: number;
  readonly label: string;
  readonly lines: readonly PositionedLine[];
}
