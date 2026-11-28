// Pure Source Serif 4 subset lookup and exact FUnit advance measurement for Layout Engine v3.
import { STYLE } from "../../units.ts";
import { upperCase } from "../v1/cells.ts";
import { graphemeEnd } from "../v1/graphemes.ts";
import { inRanges } from "../v1/tables/lookup.ts";
import {
  SERIF_ADVANCE_400,
  SERIF_ADVANCE_400_I,
  SERIF_ADVANCE_700,
  SERIF_ADVANCE_700_I,
  SERIF_LATIN,
  SERIF_LATIN_EXT,
  SERIF_METRICS,
} from "./tables/serif.generated.ts";

export { SERIF_METRICS };

const FALLBACK_ADVANCE = 600;

/** The code-point ranges (inclusive pairs) of Source Serif 4's `latin` or `latin-ext` subset. */
export function serifRanges(subset: "latin" | "latin-ext"): readonly number[] {
  return subset === "latin" ? SERIF_LATIN : SERIF_LATIN_EXT;
}

/** Which Source Serif 4 subset holds `codePoint`, or null when outside the book font. */
export function serifFontSubset(
  codePoint: number,
): "latin" | "latin-ext" | null {
  if (inRanges(SERIF_LATIN, codePoint)) return "latin";
  if (inRanges(SERIF_LATIN_EXT, codePoint)) return "latin-ext";
  return null;
}

function advanceTableFor(style: number): readonly number[] {
  const bold = (style & STYLE.BOLD) !== 0;
  const italic = (style & STYLE.ITALIC) !== 0;
  if (bold && italic) return SERIF_ADVANCE_700_I;
  if (bold) return SERIF_ADVANCE_700;
  if (italic) return SERIF_ADVANCE_400_I;
  return SERIF_ADVANCE_400;
}

function lookupPair(
  pairs: readonly number[],
  codePoint: number,
): number | null {
  let lo = 0;
  let hi = pairs.length >> 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const cp = pairs[mid * 2]!;
    if (cp === codePoint) return pairs[mid * 2 + 1]!;
    if (cp < codePoint) lo = mid + 1;
    else hi = mid;
  }
  return null;
}

/** Exact FUnit advance width of a single Unicode code point in Source Serif 4 for `style`. */
export function serifCodePointFUnits(codePoint: number, style: number): number {
  const hit = lookupPair(advanceTableFor(style), codePoint);
  if (hit !== null) return hit;
  return codePoint > 0x2e80 ? SERIF_METRICS.unitsPerEm : FALLBACK_ADVANCE;
}

/** Exact FUnit advance of `text.slice(from, to)` using per-code-unit `styles` or a uniform `defaultStyle`. */
export function measureSerifFUnits(
  text: string,
  from: number,
  to: number,
  options?: {
    readonly styles?: Uint8Array | null;
    readonly defaultStyle?: number;
    readonly capitalized?: boolean;
  },
): number {
  const styles = options?.styles ?? null;
  const baseStyle = options?.defaultStyle ?? 0;
  const forceCaps = options?.capitalized === true;
  let sum = 0;
  for (let i = from; i < to;) {
    const rawStyle =
      (styles !== null && i < styles.length ? styles[i]! : 0) | baseStyle;
    const cp = text.codePointAt(i)!;
    const step = cp > 0xffff ? 2 : 1;
    if (forceCaps || (rawStyle & STYLE.CAPS) !== 0) {
      const up = upperCase(text.slice(i, i + step));
      for (const ch of up) {
        sum += serifCodePointFUnits(ch.codePointAt(0)!, rawStyle);
      }
    } else {
      sum += serifCodePointFUnits(cp, rawStyle);
    }
    i += step;
  }
  return sum;
}

/** Exact point width of `text` drawn in Source Serif 4 at `fontSizePt` with `style` (kerning & ligatures off). */
export function measureSerifPt(
  text: string,
  style: number,
  fontSizePt: number,
): number {
  const units = measureSerifFUnits(text, 0, text.length, {
    defaultStyle: style,
  });
  return (units * fontSizePt) / SERIF_METRICS.unitsPerEm;
}

/** Flat `[start, end, ...]` UTF-16 ranges of grapheme clusters that Source Serif 4 cannot draw. */
export function serifOffFontRanges(text: string): number[] {
  const ranges: number[] = [];
  for (let at = 0; at < text.length;) {
    const end = graphemeEnd(text, at);
    let missing = false;
    for (let i = at; i < end;) {
      const cp = text.codePointAt(i)!;
      if (cp !== 0x09 && cp !== 0x0a && serifFontSubset(cp) === null) {
        missing = true;
        break;
      }
      i += cp > 0xffff ? 2 : 1;
    }
    if (missing) {
      if (ranges.length > 0 && ranges[ranges.length - 1] === at)
        ranges[ranges.length - 1] = end;
      else ranges.push(at, end);
    }
    at = end;
  }
  return ranges;
}
