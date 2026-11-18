// The script font's character set, in the two subsets its files are split into, and its measures.
import { FONT_LATIN, FONT_LATIN_EXT } from "./tables/font.generated.ts";
import { inRanges } from "./tables/lookup.ts";

/** The script font's measures in font units: every character of every face advances by `advance`. */
export const FONT_METRICS = Object.freeze({
  advance: 1228,
  unitsPerEm: 2048,
  ascent: 1600,
  descent: -700,
} as const);

/** The subset whose files hold `codePoint`; null when the script font has no glyph for it. */
export function fontSubset(codePoint: number): "latin" | "latin-ext" | null {
  if (inRanges(FONT_LATIN, codePoint)) return "latin";
  return inRanges(FONT_LATIN_EXT, codePoint) ? "latin-ext" : null;
}

/** The code points of one subset as inclusive `[from, to, …]` pairs. */
export function fontRanges(subset: "latin" | "latin-ext"): readonly number[] {
  return subset === "latin" ? FONT_LATIN : FONT_LATIN_EXT;
}

/** The runs of `text` the script font cannot draw, as `[from, to, …)` offsets in UTF-16 units. */
export function offFontRanges(text: string): number[] {
  const runs: number[] = [];
  let at = 0;
  for (const char of text) {
    const end = at + char.length;
    if (fontSubset(char.codePointAt(0)!) === null) {
      if (runs.at(-1) === at) runs[runs.length - 1] = end;
      else runs.push(at, end);
    }
    at = end;
  }
  return runs;
}
