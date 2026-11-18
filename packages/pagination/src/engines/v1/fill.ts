// The page filler: one page from where it opens to the break that ends it. Units are half-lines.
import type { LayoutBlock } from "../../layout-block.ts";
import type { PageProfile, SpecKey } from "../../page-profile.ts";
import type { BlockMetrics, Page } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import { upperCase } from "./cells.ts";
import { columnHeight, isInRun, lastCutRow, resumeAt } from "./dual.ts";
import type { ColumnPiece, Point } from "./dual.ts";
import {
  columnCueOf,
  columnsOf,
  cueOf,
  dropOf,
  dualMoreOf,
  dualUnitAt,
  isForcedStart,
  isPrinted,
  isSpeech,
  keyAt,
  lockedAt,
  look,
  must,
  pieceOf,
  reserveOf,
  spaceOf,
  tailOf,
} from "./keep.ts";
import type { DualUnit, Flow } from "./keep.ts";
import { labelsBetween } from "./labels.ts";
import { measure } from "./measure.ts";
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

/** Where the next page opens, and the furniture the break puts on each side of it. */
interface Break {
  readonly block: number;
  readonly line: number;
  readonly forced: boolean;
  /** A cut dual run: where its right column resumes. */
  readonly right: Point | null;
  /** The page ends with (MORE). */
  readonly more: boolean;
  readonly contd: string | null;
  readonly contdRight: string | null;
}

/** The element starts a scene that its number counts and that a page can be continued in. */
export function isSceneHeading(key: SpecKey): boolean {
  return key === "scene_heading" || key === "slug";
}

/** The element ends the scene before it: a scene heading, slug, chapter or act break. */
export function isSceneBoundary(key: SpecKey): boolean {
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
 * A cue in a dual run neither takes the suffix nor counts as the earlier cue.
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
    upperCase(cue.text).trimEnd().endsWith(furniture.contdText.trim()) ||
    isInRun(blocks, profile, i)
  )
    return false;
  const name = speakerName(cue.text);
  if (name === "") return false;
  for (let j = i - 1; j >= 0; j--) {
    const key = keyAt(blocks, j);
    if (isSceneBoundary(key)) return false;
    if (key === "character" && !isInRun(blocks, profile, j))
      return speakerName(blocks[j]!.text) === name;
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

const lineOffset = (flow: Flow, at: Point) =>
  flow.metrics[at.block]?.starts[at.line] ?? 0;

function opening(flow: Flow, at: Break): PageStart {
  const sceneContinued = isSceneContinued(flow, at.block, at.line);
  const locked = lockedAt(flow, at.block, at.line) !== null;
  const cued = at.contd !== null || at.contdRight !== null;
  return {
    block: at.block,
    line: at.line,
    offset: lineOffset(flow, at),
    right:
      at.right === null
        ? null
        : Object.freeze({ ...at.right, offset: lineOffset(flow, at.right) }),
    contd: at.contd,
    contdRight: at.contdRight,
    sceneContinued,
    locked,
    forced: at.forced || locked,
    topUnits:
      (sceneContinued ? CONTINUED_LINES * UNITS_PER_LINE : 0) +
      (cued ? UNITS_PER_LINE : 0),
  };
}

// A break before line `line` of block i; inside a speech it puts (MORE) at the foot and the cue at the next page's top.
function plainBreak(
  flow: Flow,
  i: number,
  line: number,
  forced: boolean,
): Break {
  const speech = isSpeech(flow, i);
  return {
    block: i,
    line,
    forced,
    right: null,
    more: speech,
    contd: speech ? cueOf(flow, i) : null,
    contdRight: null,
  };
}

/** The first page of a script: at its first printed block, or block 0 when nothing is printed. */
export function firstStart(flow: Flow): PageStart {
  let block = 0;
  while (block < flow.blocks.length && !isPrinted(flow, block)) block++;
  return opening(flow, {
    block: block < flow.blocks.length ? block : 0,
    line: 0,
    forced: false,
    right: null,
    more: false,
    contd: null,
    contdRight: null,
  });
}

function place(flow: Flow, sheet: Sheet, i: number, units: number): void {
  sheet.used += units;
  sheet.atTop = false;
  sheet.onlyKeeps &&= flow.metrics[i]!.spec.keptWithNext;
}

// Places what fits of block i from `line`; null when all of it was placed, else where the page breaks.
function step(flow: Flow, sheet: Sheet, i: number, line: number): Break | null {
  if (!sheet.atTop && line === 0 && isForcedStart(flow, i))
    return plainBreak(flow, i, 0, true);
  const before = sheet.atTop ? dropOf(flow, i) : spaceOf(flow, i);
  if (
    !sheet.atTop &&
    !sheet.onlyKeeps &&
    line === 0 &&
    sheet.used + must(flow, i) > flow.cap
  )
    return plainBreak(flow, i, 0, false);
  const avail = flow.cap - sheet.used - before;
  const piece = pieceOf(flow, i, line);
  const rest = (piece.end - line) * piece.step;
  // a piece that stops where a lock starts a page needs only its (MORE) after it
  const whole = piece.end === flow.metrics[i]!.lines;
  const after = whole ? tailOf(flow, i) + reserveOf(flow, i) : piece.more;
  if (rest + after <= avail) {
    place(flow, sheet, i, before + rest);
    return whole ? null : plainBreak(flow, i, piece.end, true);
  }
  let k = splitAt(piece, flow.profile.rules, line, avail);
  if (k < 0 && (sheet.atTop || sheet.onlyKeeps)) {
    // only the transition does not fit, and the block has no tail to give it
    if (whole && rest + reserveOf(flow, i) <= avail) {
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
  if (k <= line) return plainBreak(flow, i, line, false);
  sheet.used += before + (k - line) * piece.step;
  return plainBreak(flow, i, k, false);
}

type Columns = readonly [readonly ColumnPiece[], readonly ColumnPiece[]];

// A column's resume point at a row that is one of its line boundaries; null when the column is done.
function resumeOf(column: readonly ColumnPiece[], row: number): Point | null {
  const at = resumeAt(column, row);
  return at === "done" ? null : at;
}

// The rows a run that does not fit is cut at, one per column; null when it moves whole. A tall run is
// cut at one row for both columns; with none, each column is cut at its last line boundary that fits,
// if the run is first on its page, or a line fits and only kept blocks are above it.
function cutRows(
  flow: Flow,
  sheet: Sheet,
  columns: Columns,
  height: number,
  avail: number,
): readonly [number, number] | null {
  const limit = avail - dualMoreOf(flow);
  const edge = flow.profile.rules.minLines * UNITS_PER_LINE;
  const tall = height > flow.cap * flow.profile.rules.dualSplitAbove;
  const row = tall
    ? lastCutRow(columns, edge, Math.min(limit, height - edge))
    : -1;
  if (row > 0) return [row, row];
  if (!sheet.atTop && !(tall && sheet.onlyKeeps)) return null;
  const last = (column: readonly ColumnPiece[]) =>
    Math.max(0, lastCutRow([column], 1, limit));
  const rows = [last(columns[0]), last(columns[1])] as const;
  return sheet.atTop || Math.max(...rows) > 0 ? rows : null;
}

// Places what fits of a dual run, both columns as one unit; null when all of it was placed.
function stepRun(flow: Flow, sheet: Sheet, unit: DualUnit): Break | null {
  const { run } = unit;
  if (!sheet.atTop && isForcedStart(flow, run.start))
    return plainBreak(flow, run.start, 0, true);
  const first = unit.left?.block ?? unit.right?.block ?? run.start;
  const before = sheet.atTop ? dropOf(flow, first) : spaceOf(flow, run.start);
  if (
    !sheet.atTop &&
    !sheet.onlyKeeps &&
    sheet.used + must(flow, run.start) > flow.cap
  )
    return plainBreak(flow, run.start, 0, false);
  const avail = flow.cap - sheet.used - before;
  const columns = columnsOf(flow, unit);
  const height = Math.max(...columns.map(columnHeight));
  if (height <= avail) {
    place(flow, sheet, run.end - 1, before + height);
    return null;
  }
  const rows = cutRows(flow, sheet, columns, height, avail);
  if (rows === null) return plainBreak(flow, run.start, 0, false);
  sheet.used += before + Math.max(...rows);
  const left = resumeOf(columns[0], rows[0]);
  const right = resumeOf(columns[1], rows[1]);
  // the run is taller than what is left of the page, so its taller column goes on
  const main = (left ?? right)!;
  const other = left === null ? null : right;
  const cued = flow.profile.furniture.speechContinued;
  return {
    block: main.block,
    line: main.line,
    forced: false,
    right: other,
    more: cued,
    contd: cued ? columnCueOf(flow, run, main) : null,
    contdRight: cued && other !== null ? columnCueOf(flow, run, other) : null,
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
    const unit = dualUnitAt(
      flow,
      i,
      line,
      i === start.block ? start.right : null,
    );
    const at =
      unit === null ? step(flow, sheet, i, line) : stepRun(flow, sheet, unit);
    if (at !== null) {
      const used = sheet.used + (at.more ? UNITS_PER_LINE : 0);
      return {
        page: filled(flow, start, used, at.more),
        next: opening(flow, at),
      };
    }
    if (unit !== null) i = unit.run.end - 1;
  }
  return { page: filled(flow, start, sheet.used, false), next: null };
}

/**
 * Block i measured as the page shows it: with the same-speaker suffix when it takes one, and a line
 * starting at each forced offset.
 */
export function measureAt(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
  forced: readonly number[],
): BlockMetrics {
  return measure(blocks[i]!, profile, {
    suffix: hasSpeakerSuffix(blocks, profile, i)
      ? profile.furniture.contdText
      : "",
    forced,
  });
}

/**
 * The pages' labels: with no lock anchors 1, 2, 3 …; otherwise a locked page takes its lock's label,
 * and each run of pages before, between and after locked pages the labels between theirs, passing
 * over every label in `taken` and every label given so far.
 */
export function pageLabels(
  flow: Flow,
  pages: readonly FilledPage[],
  taken: ReadonlySet<string>,
): string[] {
  const labels: string[] = [];
  const given = new Set(taken);
  const give = (lower: string | null, upper: string | null, count: number) => {
    for (const label of labelsBetween(lower, upper, count, given)) {
      labels.push(label);
      given.add(label);
    }
  };
  let lower: string | null = null;
  let run = 0;
  pages.forEach((page, k) => {
    const lock = lockedAt(flow, page.block, page.line);
    if (lock === null) return;
    give(lower, lock, k - run);
    labels.push(lock);
    lower = lock;
    run = k + 1;
  });
  give(lower, null, pages.length - run);
  return labels;
}
