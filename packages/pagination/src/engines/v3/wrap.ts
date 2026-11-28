// Proportional Source Serif 4 FUnit word-wrapping for Layout Engine v3 manuscripts.
import { graphemeEnd } from "../v1/graphemes.ts";
import { SERIF_METRICS, measureSerifFUnits } from "./serif-font.ts";

export interface WrapSerifOptions {
  /** Available line width in points. */
  readonly widthPt: number;
  /** First-line indent in points. */
  readonly firstLineIndentPt?: number;
  /** Optional hanging indent in points for lines `0..hangingLines-1` (used for drop caps). */
  readonly hangingIndentPt?: number;
  readonly hangingLines?: number;
  readonly fontSizePt: number;
  readonly styles?: Uint8Array | null;
  readonly defaultStyle?: number;
  readonly capitalized?: boolean;
  readonly forced?: readonly number[];
}

function ptToFUnits(pt: number, fontSizePt: number): number {
  return Math.max(
    SERIF_METRICS.unitsPerEm,
    Math.floor((pt * SERIF_METRICS.unitsPerEm) / fontSizePt),
  );
}

/**
 * Breaks `text` into UTF-16 line-start offsets using exact integer Source Serif 4 FUnit widths.
 * Always returns `[0, ...]` sorted ascending, matching `v1/wrap.ts` edge contracts.
 */
export function wrapSerif(text: string, options: WrapSerifOptions): Int32Array {
  if (text.length === 0) return new Int32Array([0]);
  const { fontSizePt, styles, defaultStyle, capitalized } = options;
  const baseLimit = ptToFUnits(options.widthPt, fontSizePt);
  const firstIndent =
    ptToFUnits(options.firstLineIndentPt ?? 0, fontSizePt) -
    (options.firstLineIndentPt === undefined || options.firstLineIndentPt === 0
      ? SERIF_METRICS.unitsPerEm
      : 0);
  const hangingIndent =
    options.hangingIndentPt !== undefined && options.hangingIndentPt > 0
      ? Math.floor(
          (options.hangingIndentPt * SERIF_METRICS.unitsPerEm) / fontSizePt,
        )
      : 0;
  const hangingLines = options.hangingLines ?? 0;

  const limitForLine = (lineIdx: number): number => {
    let deduct = 0;
    if (lineIdx === 0 && (options.firstLineIndentPt ?? 0) > 0)
      deduct += Math.floor(
        ((options.firstLineIndentPt ?? 0) * SERIF_METRICS.unitsPerEm) /
          fontSizePt,
      );
    if (hangingIndent > 0 && lineIdx < hangingLines) deduct += hangingIndent;
    return Math.max(SERIF_METRICS.unitsPerEm, baseLimit - deduct);
  };
  void firstIndent;

  const forcedSet =
    options.forced !== undefined && options.forced.length > 0
      ? new Set(options.forced.filter((o) => o > 0 && o < text.length))
      : null;

  const starts: number[] = [0];
  let lineIdx = 0;
  let lineStart = 0;
  let lineWidth = 0;
  let breakAt = -1;
  let breakWidth = 0;

  for (let at = 0; at < text.length;) {
    if (forcedSet !== null && at > lineStart && forcedSet.has(at)) {
      starts.push(at);
      lineIdx++;
      lineStart = at;
      lineWidth = 0;
      breakAt = -1;
      breakWidth = 0;
    }

    const ch = text[at]!;
    if (ch === "\n") {
      at++;
      if (at < text.length) {
        starts.push(at);
        lineIdx++;
        lineStart = at;
        lineWidth = 0;
        breakAt = -1;
        breakWidth = 0;
      }
      continue;
    }

    const end = graphemeEnd(text, at);
    const w = measureSerifFUnits(text, at, end, {
      styles,
      defaultStyle,
      capitalized,
    });
    const isSpace = ch === " " || ch === "\t";
    const limit = limitForLine(lineIdx);

    if (!isSpace && lineWidth > 0 && lineWidth + w > limit) {
      if (breakAt > lineStart) {
        starts.push(breakAt);
        lineIdx++;
        lineStart = breakAt;
        lineWidth = lineWidth - breakWidth + w;
        breakAt = -1;
        breakWidth = 0;
      } else {
        starts.push(at);
        lineIdx++;
        lineStart = at;
        lineWidth = w;
        breakAt = -1;
        breakWidth = 0;
      }
    } else {
      lineWidth += w;
    }

    if (isSpace || ch === "-") {
      breakAt = end;
      breakWidth = lineWidth;
    }
    at = end;
  }

  return Int32Array.from(starts);
}
