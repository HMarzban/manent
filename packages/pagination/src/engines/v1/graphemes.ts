// Extended grapheme clusters by rules GB3 to GB13 of Unicode 15.0.0's text segmentation annex.
import { GCB, graphemeClass, isExtendedPictographic } from "./tables/lookup.ts";

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

const unitsOf = (codePoint: number) => (codePoint > 0xffff ? 2 : 1);

const isInsidePair = (text: string, at: number) =>
  at > 0 &&
  isLowSurrogate(text.charCodeAt(at)) &&
  isHighSurrogate(text.charCodeAt(at - 1));

const isControl = (cls: number) =>
  cls === GCB.CR || cls === GCB.LF || cls === GCB.CONTROL;

// `pictZwj`: the text before `next` is Extended_Pictographic Extend* ZWJ (GB11).
// `oddIndicators`: an odd number of Regional_Indicators ends just before `next` (GB12, GB13).
function isBreak(
  prev: number,
  next: number,
  nextCodePoint: number,
  pictZwj: boolean,
  oddIndicators: boolean,
): boolean {
  if (prev === GCB.CR && next === GCB.LF) return false;
  if (isControl(prev) || isControl(next)) return true;
  if (
    prev === GCB.L &&
    (next === GCB.L || next === GCB.V || next === GCB.LV || next === GCB.LVT)
  )
    return false;
  if ((prev === GCB.LV || prev === GCB.V) && (next === GCB.V || next === GCB.T))
    return false;
  if ((prev === GCB.LVT || prev === GCB.T) && next === GCB.T) return false;
  if (next === GCB.EXTEND || next === GCB.ZWJ || next === GCB.SPACING_MARK)
    return false;
  if (prev === GCB.PREPEND) return false;
  if (pictZwj && isExtendedPictographic(nextCodePoint)) return false;
  return !(
    prev === GCB.REGIONAL_INDICATOR &&
    next === GCB.REGIONAL_INDICATOR &&
    oddIndicators
  );
}

/**
 * The offset just past the extended grapheme cluster starting at `from`. An offset inside a
 * surrogate pair is read as the pair's start; at or past the end it is the text's length.
 */
export function graphemeEnd(text: string, from: number): number {
  if (from >= text.length) return text.length;
  let at = isInsidePair(text, from) ? from - 1 : from;
  let codePoint = text.codePointAt(at)!;
  let prev = graphemeClass(codePoint);
  // Extended_Pictographic Extend*: "pict"; that followed by ZWJ: "pict_zwj".
  let emoji: "none" | "pict" | "pict_zwj" = isExtendedPictographic(codePoint)
    ? "pict"
    : "none";
  let indicators = prev === GCB.REGIONAL_INDICATOR ? 1 : 0;
  at += unitsOf(codePoint);
  while (at < text.length) {
    codePoint = text.codePointAt(at)!;
    const next = graphemeClass(codePoint);
    if (
      isBreak(prev, next, codePoint, emoji === "pict_zwj", indicators % 2 === 1)
    )
      break;
    if (isExtendedPictographic(codePoint)) emoji = "pict";
    else if (emoji === "pict" && next === GCB.EXTEND) emoji = "pict";
    else if (emoji === "pict" && next === GCB.ZWJ) emoji = "pict_zwj";
    else emoji = "none";
    indicators = next === GCB.REGIONAL_INDICATOR ? indicators + 1 : 0;
    prev = next;
    at += unitsOf(codePoint);
  }
  return at;
}
