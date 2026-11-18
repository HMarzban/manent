// Where a block may be split across a page break, by its element's split rule.
import type { RuleSettings, SplitRule } from "../../page-profile.ts";
import { endsSentence } from "./sentences.ts";

/** The part of a block the filler is placing. Units are half-lines. */
export interface SplitPiece {
  /** The block's own text, which its line starts index. */
  readonly text: string;
  readonly starts: Int32Array;
  /** The line the piece stops before: the block's line count, or a line a page is forced to start at. */
  readonly end: number;
  readonly rule: SplitRule;
  /** Units one line takes. */
  readonly step: number;
  /** Units the (MORE) line under a split takes. */
  readonly more: number;
}

function endsSentenceBefore(piece: SplitPiece, line: number): boolean {
  return endsSentence(
    piece.text.slice(piece.starts[line - 1], piece.starts[line]),
  );
}

// The legal lines to continue on, `[lo, hi]`; null when there are none.
function splitRange(
  piece: SplitPiece,
  rules: RuleSettings,
  line: number,
  avail: number,
): readonly [number, number] | null {
  if (piece.rule === "never") return null;
  if (piece.rule === "action" && piece.end - line < rules.actionNoSplitBelow)
    return null;
  const lo = line + rules.minLines;
  const hi = Math.min(
    line + Math.floor((avail - piece.more) / piece.step),
    piece.end - rules.minLines,
  );
  return hi < lo ? null : [lo, hi];
}

/**
 * The last line after `line` that the piece may continue on, on the next page, when `avail` units are
 * left on this one; -1 when it may not be split there.
 */
export function splitAt(
  piece: SplitPiece,
  rules: RuleSettings,
  line: number,
  avail: number,
): number {
  const range = splitRange(piece, rules, line, avail);
  if (range === null) return -1;
  const [lo, hi] = range;
  for (let k = hi; k >= lo; k--) if (endsSentenceBefore(piece, k)) return k;
  return piece.rule === "action" ? hi : -1;
}

/** The first line after `line` that the piece may continue on, with a page of any length; -1 for none. */
export function firstSplit(
  piece: SplitPiece,
  rules: RuleSettings,
  line: number,
): number {
  const range = splitRange(piece, rules, line, Number.POSITIVE_INFINITY);
  if (range === null) return -1;
  const [lo, hi] = range;
  for (let k = lo; k <= hi; k++) if (endsSentenceBefore(piece, k)) return k;
  return piece.rule === "action" ? lo : -1;
}
