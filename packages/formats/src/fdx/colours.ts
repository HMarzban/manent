// Final Draft's 48-bit colours, and the nearest of Manent's named colours to each.
import { REVISION_COLOURS, paperRgb } from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import type { HIGHLIGHT_NAMES, TEXT_COLOUR_NAMES } from "@manent/schema";

type Rgb = readonly [number, number, number];
type TextColour = (typeof TEXT_COLOUR_NAMES)[number];
type Highlight = (typeof HIGHLIGHT_NAMES)[number];

/** The value a file is written with for each text colour: red, green and blue, each 0 to 255. */
export const FDX_TEXT_COLOURS: Readonly<Record<TextColour, Rgb>> =
  Object.freeze({
    red: Object.freeze([204, 0, 0] as const),
    orange: Object.freeze([230, 120, 0] as const),
    green: Object.freeze([0, 140, 0] as const),
    blue: Object.freeze([0, 0, 204] as const),
    violet: Object.freeze([120, 0, 170] as const),
  });

/** The value a file is written with for each highlight. */
export const FDX_HIGHLIGHTS: Readonly<Record<Highlight, Rgb>> = Object.freeze({
  yellow: Object.freeze([255, 240, 120] as const),
  green: Object.freeze([190, 240, 190] as const),
  pink: Object.freeze([255, 200, 220] as const),
  orange: Object.freeze([255, 215, 160] as const),
  violet: Object.freeze([220, 200, 250] as const),
});

const FDX_COLOUR = /^#[0-9A-Fa-f]{12}$/;

const channel = (c: number): string =>
  (c * 257).toString(16).toUpperCase().padStart(4, "0");

/** `#RRRRGGGGBBBB`: each channel `c` as four upper-case hexadecimal digits of `c × 257`. */
export function fdxColour(rgb: Rgb): string {
  return `#${rgb.map(channel).join("")}`;
}

/** Each channel's high byte of a `#RRRRGGGGBBBB` value; null for anything else. */
export function parseFdxColour(value: string): Rgb | null {
  if (!FDX_COLOUR.test(value)) return null;
  const byte = (at: number): number =>
    Number.parseInt(value.slice(at, at + 2), 16);
  return [byte(1), byte(5), byte(9)];
}

const distance = (a: Rgb, b: Rgb): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The name in `table` nearest to `rgb` by squared distance, ties to the first in the table's order, or null
 * when `none` (the page's own black or white, which is no mark) is nearer; `exact` when the distance is 0.
 */
export function nearestColour(
  rgb: Rgb,
  table: Readonly<Record<string, Rgb>>,
  none: Rgb,
): { readonly name: string | null; readonly exact: boolean } {
  let best: { name: string | null; gap: number } = {
    name: null,
    gap: distance(rgb, none),
  };
  for (const [name, value] of Object.entries(table)) {
    const gap = distance(rgb, value);
    if (gap < best.gap) best = { name, gap };
  }
  return { name: best.name, exact: best.gap === 0 };
}

/** The revision paper nearest to `rgb`, by the print colour of each paper. */
export function nearestPaper(rgb: Rgb): RevisionColour {
  return REVISION_COLOURS.reduce((best, colour) =>
    distance(rgb, paperRgb(colour)) < distance(rgb, paperRgb(best))
      ? colour
      : best,
  );
}
