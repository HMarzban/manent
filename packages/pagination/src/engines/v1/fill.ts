// The page filler: one page from where it opens to the break that ends it. Units are half-lines.
import type { Page } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import {
  cueOf,
  dropOf,
  isForcedStart,
  isPrinted,
  isSpeech,
  look,
  must,
  pieceOf,
  reserveOf,
  spaceOf,
  tailOf,
} from "./keep.ts";
import type { Flow } from "./keep.ts";
import { splitAt } from "./split.ts";

/** Where a page opens, and the furniture at its top. */
export type PageStart = Pick<
  Page,
  | "block"
  | "line"
  | "offset"
  | "right"
  | "contd"
  | "contdRight"
  | "sceneContinued"
  | "locked"
  | "forced"
  | "topUnits"
>;

/** A filled page before it is numbered. */
export type FilledPage = Omit<Page, "index" | "label">;

interface Sheet {
  used: number;
  atTop: boolean;
  onlyKeeps: boolean;
}

/** Where the next page opens. */
interface Break {
  readonly block: number;
  readonly line: number;
  readonly forced: boolean;
}

/** The first page of a script: at its first printed block, or block 0 when nothing is printed. */
export function firstStart(flow: Flow): PageStart {
  let block = 0;
  while (block < flow.blocks.length && !isPrinted(flow, block)) block++;
  return {
    block: block < flow.blocks.length ? block : 0,
    line: 0,
    offset: 0,
    right: null,
    contd: null,
    contdRight: null,
    sceneContinued: false,
    locked: false,
    forced: false,
    topUnits: 0,
  };
}

function place(flow: Flow, sheet: Sheet, i: number, units: number): void {
  sheet.used += units;
  sheet.atTop = false;
  sheet.onlyKeeps &&= flow.metrics[i]!.spec.keptWithNext;
}

// Places what fits of block i from `line`; null when all of it was placed, else where the page breaks.
function step(flow: Flow, sheet: Sheet, i: number, line: number): Break | null {
  if (!sheet.atTop && line === 0 && isForcedStart(flow, i))
    return { block: i, line: 0, forced: true };
  const before = sheet.atTop ? dropOf(flow, i) : spaceOf(flow, i);
  if (
    !sheet.atTop &&
    !sheet.onlyKeeps &&
    line === 0 &&
    sheet.used + must(flow, i) > flow.cap
  )
    return { block: i, line: 0, forced: false };
  const avail = flow.cap - sheet.used - before;
  const piece = pieceOf(flow, i);
  const rest = (piece.end - line) * piece.step;
  if (rest + tailOf(flow, i) + reserveOf(flow, i) <= avail) {
    place(flow, sheet, i, before + rest);
    return null;
  }
  let k = splitAt(piece, flow.profile.rules, line, avail);
  if (k < 0 && (sheet.atTop || sheet.onlyKeeps)) {
    // only the transition does not fit, and the block has no tail to give it
    if (rest + reserveOf(flow, i) <= avail) {
      place(flow, sheet, i, before + rest);
      return null;
    }
    // oversized: every page places a line
    if (sheet.atTop || avail - piece.more >= piece.step)
      k = Math.min(
        piece.end - 1,
        line + Math.max(1, Math.floor((avail - piece.more) / piece.step)),
      );
  }
  if (k <= line) return { block: i, line, forced: false };
  sheet.used += before + (k - line) * piece.step;
  return { block: i, line: k, forced: false };
}

function opening(flow: Flow, at: Break, contd: string | null): PageStart {
  return {
    block: at.block,
    line: at.line,
    offset: flow.metrics[at.block]!.starts[at.line] ?? 0,
    right: null,
    contd,
    contdRight: null,
    sceneContinued: false,
    locked: false,
    forced: at.forced,
    topUnits: contd === null ? 0 : UNITS_PER_LINE,
  };
}

function filled(
  flow: Flow,
  start: PageStart,
  usedUnits: number,
  more: boolean,
): FilledPage {
  return { ...start, more, usedUnits, readAhead: flow.ahead };
}

/** Fills the page that opens at `start`; `next` is where the page after it opens, null after the last. */
export function fillPage(
  flow: Flow,
  start: PageStart,
): { readonly page: FilledPage; readonly next: PageStart | null } {
  flow.ahead = start.block;
  const sheet: Sheet = { used: start.topUnits, atTop: true, onlyKeeps: true };
  let line = start.line;
  for (let i = start.block; i < flow.blocks.length; i++, line = 0) {
    look(flow, i);
    if (!isPrinted(flow, i)) continue;
    const at = step(flow, sheet, i, line);
    if (at === null) continue;
    // a break inside a speech puts (MORE) at the foot and the cue at the next page's top
    const speech = isSpeech(flow, at.block);
    const contd = speech ? cueOf(flow, at.block) : null;
    const used = sheet.used + (speech ? UNITS_PER_LINE : 0);
    return {
      page: filled(flow, start, used, speech),
      next: opening(flow, at, contd),
    };
  }
  return { page: filled(flow, start, sheet.used, false), next: null };
}
