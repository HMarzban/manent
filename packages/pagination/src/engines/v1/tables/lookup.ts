// Lookups in the generated tables, each a flat list of rows sorted by their first number.
import {
  EMOJI_PRESENTATION_RANGES,
  EXT_PICT_RANGES,
  GCB_RANGES,
  UPPER_SIMPLE,
  UPPER_SPECIAL,
  WIDE_RANGES,
} from "./unicode.generated.ts";

/** Grapheme_Cluster_Break classes as the tables number them; a code point in no row is Other, 0. */
export const GCB = Object.freeze({
  OTHER: 0,
  CR: 1,
  LF: 2,
  CONTROL: 3,
  EXTEND: 4,
  ZWJ: 5,
  REGIONAL_INDICATOR: 6,
  PREPEND: 7,
  SPACING_MARK: 8,
  L: 9,
  V: 10,
  T: 11,
  LV: 12,
  LVT: 13,
} as const);

/** The last row of `rows`, each `stride` numbers long, whose first number is at most `key`; -1 when none is. */
function lastRowAtOrBelow(
  rows: readonly (number | string)[],
  stride: number,
  key: number,
): number {
  let low = 0;
  let high = rows.length / stride - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (Number(rows[mid * stride]) <= key) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

/** Whether `codePoint` lies in one of the inclusive `[from, to]` pairs of `ranges`. */
export function inRanges(
  ranges: readonly number[],
  codePoint: number,
): boolean {
  const row = lastRowAtOrBelow(ranges, 2, codePoint);
  return row >= 0 && codePoint <= ranges[row * 2 + 1]!;
}

export function graphemeClass(codePoint: number): number {
  const row = lastRowAtOrBelow(GCB_RANGES, 3, codePoint);
  return row >= 0 && codePoint <= GCB_RANGES[row * 3 + 1]!
    ? GCB_RANGES[row * 3 + 2]!
    : GCB.OTHER;
}

export function isExtendedPictographic(codePoint: number): boolean {
  return inRanges(EXT_PICT_RANGES, codePoint);
}

export function hasEmojiPresentation(codePoint: number): boolean {
  return inRanges(EMOJI_PRESENTATION_RANGES, codePoint);
}

/** Whether East_Asian_Width is Wide or Fullwidth. */
export function isWide(codePoint: number): boolean {
  return inRanges(WIDE_RANGES, codePoint);
}

/** The full upper-case mapping of one code point, itself when it has none. */
export function upperOf(codePoint: number): string {
  const special = lastRowAtOrBelow(UPPER_SPECIAL, 2, codePoint);
  if (special >= 0 && UPPER_SPECIAL[special * 2] === codePoint)
    return String(UPPER_SPECIAL[special * 2 + 1]);
  const simple = lastRowAtOrBelow(UPPER_SIMPLE, 2, codePoint);
  return String.fromCodePoint(
    simple >= 0 && UPPER_SIMPLE[simple * 2] === codePoint
      ? UPPER_SIMPLE[simple * 2 + 1]!
      : codePoint,
  );
}
