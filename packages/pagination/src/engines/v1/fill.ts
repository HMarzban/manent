// The page filler: one page from where it opens to the break that ends it. Units are half-lines.
import type { LayoutBlock } from "../../layout-block.ts";
import type { PageProfile, SpecKey } from "../../page-profile.ts";
import type { Page } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import { upperCase } from "./cells.ts";
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
import { specKey } from "./profile.ts";
import { splitAt } from "./split.ts";

/** Lines the CONTINUED: line and the blank line under it take at a page's top. */
const CONTINUED_LINES = 2;

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

const keyAt = (blocks: readonly LayoutBlock[], i: number) =>
  specKey(blocks[i]!.type, blocks[i]!.kind);

/** The element starts a scene that its number counts and that a page can be continued in. */
export function isSceneHeading(key: SpecKey): boolean {
  return key === "scene_heading" || key === "slug";
}

function isSceneBoundary(key: SpecKey): boolean {
  return (
    isSceneHeading(key) || key === "chapter" || key.startsWith("act_break.")
  );
}

// The name a cue speaks under: its text before the first "(", in capitals, trimmed.
function speakerName(text: string): string {
  const open = text.indexOf("(");
  return upperCase(open < 0 ? text : text.slice(0, open)).trim();
}

/**
 * Cue i is shown with the same-speaker suffix: the nearest earlier cue in its scene has its name, and
 * neither the profile, the cue's `noContd` nor its own text already ending in the suffix says no.
 */
export function hasSpeakerSuffix(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): boolean {
  const { furniture } = profile;
  const cue = blocks[i]!;
  if (
    !furniture.speakerContinued ||
    cue.noContd ||
    keyAt(blocks, i) !== "character" ||
    upperCase(cue.text).trimEnd().endsWith(furniture.contdText.trim())
  )
    return false;
  const name = speakerName(cue.text);
  if (name === "") return false;
  for (let j = i - 1; j >= 0; j--) {
    const key = keyAt(blocks, j);
    if (isSceneBoundary(key)) return false;
    if (key === "character") return speakerName(blocks[j]!.text) === name;
  }
  return false;
}

// The page opening at line `line` of `block` is inside a scene that began on an earlier page.
function isSceneContinued(flow: Flow, block: number, line: number): boolean {
  if (!flow.profile.furniture.sceneContinued) return false;
  for (let j = Math.min(block, flow.blocks.length - 1); j >= 0; j--) {
    const key = keyAt(flow.blocks, j);
    if (isSceneBoundary(key))
      return isSceneHeading(key) && (j < block || line > 0);
  }
  return false;
}

function opening(flow: Flow, at: Break, contd: string | null): PageStart {
  const sceneContinued = isSceneContinued(flow, at.block, at.line);
  return {
    block: at.block,
    line: at.line,
    offset: flow.metrics[at.block]?.starts[at.line] ?? 0,
    right: null,
    contd,
    contdRight: null,
    sceneContinued,
    locked: false,
    forced: at.forced,
    topUnits:
      (sceneContinued ? CONTINUED_LINES * UNITS_PER_LINE : 0) +
      (contd === null ? 0 : UNITS_PER_LINE),
  };
}

/** The first page of a script: at its first printed block, or block 0 when nothing is printed. */
export function firstStart(flow: Flow): PageStart {
  let block = 0;
  while (block < flow.blocks.length && !isPrinted(flow, block)) block++;
  return opening(
    flow,
    { block: block < flow.blocks.length ? block : 0, line: 0, forced: false },
    null,
  );
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
