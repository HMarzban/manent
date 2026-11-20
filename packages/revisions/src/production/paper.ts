// The print colour of each revision's paper: the same papers as the theme's
// revision fills, held here because a file is drawn away from the browser.

import type { RevisionColour } from "./colours.ts";

type Rgb = readonly [number, number, number];

const PAPER_RGB: Readonly<Record<RevisionColour, Rgb>> = Object.freeze({
  white: Object.freeze([255, 255, 255] as const),
  blue: Object.freeze([211, 230, 250] as const),
  pink: Object.freeze([250, 215, 227] as const),
  yellow: Object.freeze([251, 243, 185] as const),
  green: Object.freeze([213, 237, 208] as const),
  goldenrod: Object.freeze([244, 216, 143] as const),
  buff: Object.freeze([239, 223, 189] as const),
  salmon: Object.freeze([248, 200, 180] as const),
  cherry: Object.freeze([243, 177, 184] as const),
  tan: Object.freeze([220, 199, 166] as const),
});

/** The tint of a page on `colour` paper in a file: red, green and blue, each 0 to 255. */
export function paperRgb(colour: RevisionColour): Rgb {
  return PAPER_RGB[colour];
}
