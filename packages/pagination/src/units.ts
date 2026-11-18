// The page's units, the same for every engine version: 10 cells and 6 lines to the inch.
// The `_PX` values are the screen at 100 %.

/** Heights are counted in half-lines, so double spacing stays integral. */
export const UNITS_PER_LINE = 2;
export const CELL_PT = 7.2;
export const LINE_PT = 12;
export const UNIT_PT = 6;
export const CELL_PX = 9.6;
export const LINE_PX = 16;
export const UNIT_PX = 8;
/** The bits of a style byte. */
export const STYLE = {
  BOLD: 1,
  ITALIC: 2,
  UNDERLINE: 4,
  STRIKE: 8,
  CAPS: 16,
} as const;
export const FONT_FACE_KEYS = [
  "latin-400-normal",
  "latin-400-italic",
  "latin-700-normal",
  "latin-700-italic",
  "latin-ext-400-normal",
  "latin-ext-400-italic",
  "latin-ext-700-normal",
  "latin-ext-700-italic",
] as const;
export type FontFaceKey = (typeof FONT_FACE_KEYS)[number];
