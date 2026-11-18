// How many cells of the script's monospaced grid a cluster takes, and how text reads in capitals.
import { graphemeEnd } from "./graphemes.ts";
import {
  GCB,
  graphemeClass,
  hasEmojiPresentation,
  isExtendedPictographic,
  isWide,
  upperOf,
} from "./tables/lookup.ts";

const ZERO_WIDTH: ReadonlySet<number> = new Set([
  0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
]);
const EMOJI_VARIATION = 0xfe0f;

/** Unicode default full upper-casing, code point by code point, from the shipped table. */
export function upperCase(text: string): string {
  let out = "";
  for (const char of text) out += upperOf(char.codePointAt(0)!);
  return out;
}

function cellsOfCluster(cluster: string): number {
  const codePoints = Array.from(cluster, (char) => char.codePointAt(0)!);
  if (codePoints.every((cp) => ZERO_WIDTH.has(cp))) return 0;
  const isEmoji = codePoints.some(
    (cp, i) =>
      isExtendedPictographic(cp) &&
      (hasEmojiPresentation(cp) || codePoints[i + 1] === EMOJI_VARIATION),
  );
  const isFlag =
    codePoints.length >= 2 &&
    graphemeClass(codePoints[0]!) === GCB.REGIONAL_INDICATOR &&
    graphemeClass(codePoints[1]!) === GCB.REGIONAL_INDICATOR;
  return isWide(codePoints[0]!) || isEmoji || isFlag ? 2 : 1;
}

/**
 * The cells `text[from, to)` takes, cluster by cluster; a cluster `to` cuts is counted up to `to`.
 * Capitalized, each cluster counts as the clusters of its capitals.
 */
export function clusterCells(
  text: string,
  from: number,
  to: number,
  capitalized: boolean,
): number {
  let cells = 0;
  for (let at = from; at < to;) {
    const end = Math.min(graphemeEnd(text, at), to);
    const cluster = text.slice(at, end);
    if (capitalized) {
      const upper = upperCase(cluster);
      cells += clusterCells(upper, 0, upper.length, false);
    } else cells += cellsOfCluster(cluster);
    at = end;
  }
  return cells;
}
