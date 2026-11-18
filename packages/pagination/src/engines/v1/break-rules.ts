// Where a line may end: the engine's own break opportunities, beside spaces, hyphens and dashes.
import { clusterCells } from "./cells.ts";
import { graphemeEnd } from "./graphemes.ts";
import { GCB, graphemeClass, isExtendedPictographic } from "./tables/lookup.ts";

const SPACE = 0x20;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const HYPHEN = 0x2d;
const SLASH = 0x2f;
const EN_DASH = 0x2013;
const EM_DASH = 0x2014;

const unitsOf = (chars: string): ReadonlySet<number> =>
  new Set(Array.from(chars, (char) => char.charCodeAt(0)));
/** What never begins a line after a space. */
const HELD_AFTER_SPACE = unitsOf("!?,.:;)]}/");
/** What never begins a line. */
const CLOSING = unitsOf("!?,.:;)]}…”’\"'»›\u00a0");
/** What never ends a line. */
const OPENING = unitsOf("([{“‘\"'«‹¡¿\u00a0");

const isBlank = (unit: number) =>
  unit === SPACE || unit === TAB || unit === LINE_FEED;
const isDigit = (unit: number) => unit >= 0x30 && unit <= 0x39;
const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

function codePointStartBefore(text: string, at: number): number {
  return at >= 2 &&
    isLowSurrogate(text.charCodeAt(at - 1)) &&
    isHighSurrogate(text.charCodeAt(at - 2))
    ? at - 2
    : at - 1;
}

const isControl = (cls: number) =>
  cls === GCB.CR || cls === GCB.LF || cls === GCB.CONTROL;
const isJoiningAfter = (cls: number) =>
  cls === GCB.EXTEND || cls === GCB.ZWJ || cls === GCB.SPACING_MARK;

// GB6 to GB8: the Hangul pairs that never break.
function isHangulJoin(prev: number, next: number): boolean {
  if (prev === GCB.L)
    return (
      next === GCB.L || next === GCB.V || next === GCB.LV || next === GCB.LVT
    );
  if (prev === GCB.LV || prev === GCB.V)
    return next === GCB.V || next === GCB.T;
  return (prev === GCB.LVT || prev === GCB.T) && next === GCB.T;
}

// A cluster boundary whatever comes before the pair of code points around it. Only the pairs of
// GB11 to GB13 depend on more than the pair; they are left undecided, and the walk back goes on.
function isSureBoundary(text: string, at: number): boolean {
  const prev = graphemeClass(text.codePointAt(codePointStartBefore(text, at))!);
  const nextCodePoint = text.codePointAt(at)!;
  const next = graphemeClass(nextCodePoint);
  if (prev === GCB.CR) return next !== GCB.LF;
  if (isControl(prev) || isControl(next)) return true;
  if (isHangulJoin(prev, next) || isJoiningAfter(next) || prev === GCB.PREPEND)
    return false;
  if (prev === GCB.ZWJ) return !isExtendedPictographic(nextCodePoint);
  return prev !== GCB.REGIONAL_INDICATOR || next !== GCB.REGIONAL_INDICATOR;
}

/** The start of the cluster that holds the unit before `at`. */
function clusterStartBefore(text: string, at: number): number {
  let from = codePointStartBefore(text, at);
  while (from > 0 && !isSureBoundary(text, from))
    from = codePointStartBefore(text, from);
  let end = graphemeEnd(text, from);
  while (end < at) {
    from = end;
    end = graphemeEnd(text, from);
  }
  return from;
}

const isTwoCells = (text: string, from: number) =>
  clusterCells(text, from, graphemeEnd(text, from), false) === 2;

/**
 * Whether a line may end just before offset `at`, judged from the characters on each side; never
 * at the text's start or end.
 */
export function breakAllowed(text: string, at: number): boolean {
  if (at <= 0 || at >= text.length) return false;
  const p = text.charCodeAt(at - 1);
  const n = text.charCodeAt(at);
  if (isBlank(n)) return false;
  if (p === SPACE || p === TAB) return !HELD_AFTER_SPACE.has(n);
  if (CLOSING.has(n) || OPENING.has(p)) return false;
  // The cluster at `at` first: inside a run of wide clusters it decides without a walk back.
  if (isTwoCells(text, at) || isTwoCells(text, clusterStartBefore(text, at)))
    return true;
  if (
    p === HYPHEN &&
    at >= 2 &&
    !isBlank(text.charCodeAt(at - 2)) &&
    !isDigit(n)
  )
    return true;
  if (p === EN_DASH) return true;
  if ((p === EM_DASH) !== (n === EM_DASH)) return true;
  return p === SLASH && !isDigit(n);
}
