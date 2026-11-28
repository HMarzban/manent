// A block's line starts: a greedy pass over its grapheme clusters, counted in cells.
import { STYLE } from "../../units.ts";
import { breakAllowed } from "./break-rules.ts";
import { clusterCells } from "./cells.ts";
import { graphemeEnd } from "./graphemes.ts";
import { WRAP_MODE } from "./tuning.ts";

export interface WrapOptions {
  /** Cells taken from the first line only; default 0. */
  readonly firstLineIndent?: number;
  /** Cells taken from lines `1..hangingLines - 1` (e.g. beside a floated drop cap); default 0. */
  readonly hangingIndent?: number;
  /** Total leading lines indented (including line 0) when `hangingIndent > 0`; default 0. */
  readonly hangingLines?: number;
  /** The whole block is shown in capitals. */
  readonly capitalized?: boolean;
  /** A unit with `STYLE.CAPS` is shown in capitals. */
  readonly styles?: Uint8Array | null;
  /** Offsets where a line must start. */
  readonly forced?: readonly number[];
}

const LINE_FEED = 0x0a;

const isSpace = (text: string, at: number, end: number) =>
  end === at + 1 && (text[at] === " " || text[at] === "\t");

// A cluster is drawn in capitals when its first unit is.
function cellsOfCluster(
  text: string,
  at: number,
  end: number,
  options: WrapOptions,
): number {
  const caps =
    options.capitalized === true ||
    ((options.styles?.[at] ?? 0) & STYLE.CAPS) !== 0;
  return clusterCells(text, at, end, caps);
}

function cellsBetween(
  text: string,
  from: number,
  to: number,
  options: WrapOptions,
): number {
  let cells = 0;
  for (let at = from; at < to;) {
    const end = graphemeEnd(text, at);
    cells += cellsOfCluster(text, at, end, options);
    at = end;
  }
  return cells;
}

/**
 * The offsets where the lines of `text` start, wrapped to `width` cells (below 1 counts as 1); always
 * begins with 0. A forced offset inside a cluster starts the line at the cluster's start; one at or
 * past the end is ignored.
 */
export function wrap(
  text: string,
  width: number,
  options: WrapOptions = {},
): Int32Array {
  const limit = Math.max(1, width);
  const forced = (options.forced ?? []).toSorted((a, b) => a - b);
  const hangingIndent = options.hangingIndent ?? 0;
  const hangingLines = options.hangingLines ?? 0;
  const indentOfLine = (lineIndex: number): number =>
    lineIndex < hangingLines ? hangingIndent : 0;
  const starts = [0];
  let col = options.firstLineIndent ?? 0;
  let lastBreak = 0; // the last place after the line's start where it may end; the start when none
  let nextForced = 0;
  for (let at = 0, end = 0; at < text.length; at = end) {
    end = graphemeEnd(text, at);
    let isForced = false;
    while (nextForced < forced.length && forced[nextForced]! < end) {
      if (forced[nextForced]! >= at) isForced = true;
      nextForced++;
    }
    if (isForced && at > starts.at(-1)!) {
      starts.push(at);
      col = indentOfLine(starts.length - 1);
    }
    if (text.charCodeAt(end - 1) === LINE_FEED) {
      starts.push(end);
      col = indentOfLine(starts.length - 1);
      continue;
    }
    if (at > starts.at(-1)! && breakAllowed(text, at)) lastBreak = at;
    const cells = cellsOfCluster(text, at, end, options);
    const space = isSpace(text, at, end);
    if (col + cells > limit && !(space && WRAP_MODE === "pre-wrap")) {
      if (!space && lastBreak > starts.at(-1)!) {
        starts.push(lastBreak);
        col =
          indentOfLine(starts.length - 1) +
          cellsBetween(text, lastBreak, at, options);
      }
      if (col + cells > limit && at > starts.at(-1)!) {
        starts.push(at);
        col = indentOfLine(starts.length - 1);
      }
    }
    col += cells;
  }
  return Int32Array.from(starts);
}
