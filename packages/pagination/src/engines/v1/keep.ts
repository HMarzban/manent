// What has to fit for a block to start on a page, and the measures the page filler reads of a block.
// Units are half-lines.
import type { LayoutBlock } from "../../layout-block.ts";
import type { PageProfile, SpecKey } from "../../page-profile.ts";
import type { BlockMetrics } from "../../pages.ts";
import { UNITS_PER_LINE } from "../../units.ts";
import { upperCase } from "./cells.ts";
import { columnHeight, isCutRow, runAt } from "./dual.ts";
import type { ColumnPiece, DualRun, Point } from "./dual.ts";
import { specKey } from "./profile.ts";
import { firstSplit } from "./split.ts";
import type { SplitPiece } from "./split.ts";

/** Lines a drop always leaves on the page under it. */
const LINES_UNDER_DROP = 8;

interface Seen {
  readonly units: number;
  readonly ahead: number;
}

/** One pagination's input and what its page filler has worked out; it lives for one call. */
export interface Flow {
  readonly blocks: readonly LayoutBlock[];
  readonly profile: PageProfile;
  readonly metrics: readonly BlockMetrics[];
  /** A page, in units. */
  readonly cap: number;
  /** The highest block index examined since the page being filled was opened. */
  ahead: number;
  readonly musts: Map<number, Seen>;
  /** For each block examined, the cue block of the speech it carries on, or -1. */
  readonly speakers: Map<number, number>;
}

export function createFlow(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  metrics: readonly BlockMetrics[],
): Flow {
  return {
    blocks,
    profile,
    metrics,
    cap: profile.linesPerPage * UNITS_PER_LINE,
    ahead: 0,
    musts: new Map(),
    speakers: new Map(),
  };
}

export function look(flow: Flow, i: number): void {
  if (i > flow.ahead) flow.ahead = i;
}

export function keyAt(blocks: readonly LayoutBlock[], i: number): SpecKey {
  return specKey(blocks[i]!.type, blocks[i]!.kind);
}

function keyOf(flow: Flow, i: number): SpecKey {
  return keyAt(flow.blocks, i);
}

export function isPrinted(flow: Flow, i: number): boolean {
  return flow.metrics[i]!.spec.printed;
}

/** Units one line of block i takes. */
function stepOf(flow: Flow, i: number): number {
  return flow.metrics[i]!.spec.lineSpacing * UNITS_PER_LINE;
}

function heightOf(flow: Flow, i: number): number {
  return flow.metrics[i]!.lines * stepOf(flow, i);
}

export function spaceOf(flow: Flow, i: number): number {
  return flow.metrics[i]!.spec.spaceBefore * UNITS_PER_LINE;
}

/** The space above block i when it is first on a page. */
export function dropOf(flow: Flow, i: number): number {
  return Math.min(
    flow.metrics[i]!.spec.dropLines * UNITS_PER_LINE,
    flow.cap - LINES_UNDER_DROP * UNITS_PER_LINE,
  );
}

/** The next printed block after i; -1 when there is none. */
function nextPrinted(flow: Flow, i: number): number {
  for (let j = i + 1; j < flow.blocks.length; j++) {
    look(flow, j);
    if (isPrinted(flow, j)) return j;
  }
  return -1;
}

/** Block i always starts a page: a page_break lies between it and the printed block before it, or it is startingPage. */
export function isForcedStart(flow: Flow, i: number): boolean {
  if (flow.metrics[i]!.spec.startingPage) return true;
  for (let j = i - 1; j >= 0 && !isPrinted(flow, j); j--)
    if (keyOf(flow, j) === "page_break") return true;
  return false;
}

const isSpeechLine = (key: SpecKey) =>
  key === "parenthetical" || key === "dialogue";

// The cue block whose speech goes on through block i, or -1; blocks that are not printed are passed
// over, and no block of a dual run is part of a speech.
function speakerOf(flow: Flow, i: number): number {
  const passed: number[] = [];
  let speaker = -1;
  for (let at = i; at >= 0; at--) {
    const known = flow.speakers.get(at);
    if (known !== undefined) {
      speaker = known;
      break;
    }
    passed.push(at);
    if (runAt(flow.blocks, flow.profile, at) !== null) break;
    const key = keyOf(flow, at);
    if (isPrinted(flow, at) && !isSpeechLine(key)) {
      if (key === "character" && flow.blocks[at]!.text.trim() !== "")
        speaker = at;
      break;
    }
  }
  for (const at of passed) flow.speakers.set(at, speaker);
  return speaker;
}

/** Block i is a parenthetical or dialogue of a speech, and a break inside the speech is marked. */
export function isSpeech(flow: Flow, i: number): boolean {
  return (
    flow.profile.furniture.speechContinued &&
    isPrinted(flow, i) &&
    isSpeechLine(keyOf(flow, i)) &&
    speakerOf(flow, i) >= 0
  );
}

const cueText = (flow: Flow, cue: number) =>
  upperCase(flow.blocks[cue]!.text).trim();

/** The cue of the speech block i belongs to, in capitals and trimmed. */
export function cueOf(flow: Flow, i: number): string {
  return cueText(flow, speakerOf(flow, i));
}

/** Units of the (MORE) line a break inside block i needs. */
function moreOf(flow: Flow, i: number): number {
  return isSpeech(flow, i) ? UNITS_PER_LINE : 0;
}

/** Units of the (MORE) line a break after block i needs: the speech goes on after it. */
export function reserveOf(flow: Flow, i: number): number {
  const t = nextPrinted(flow, i);
  return t >= 0 && isSpeech(flow, t) ? UNITS_PER_LINE : 0;
}

/** Block i, for the split rules. */
export function pieceOf(flow: Flow, i: number): SplitPiece {
  const { lines, starts, spec } = flow.metrics[i]!;
  return {
    text: flow.blocks[i]!.text,
    starts,
    end: lines,
    rule: spec.split,
    step: stepOf(flow, i),
    more: moreOf(flow, i),
  };
}

/** The units of the transition after block i when the two must share a page; 0 otherwise. */
export function tailOf(flow: Flow, i: number): number {
  if (flow.metrics[i]!.spec.keptWithNext) return 0;
  const t = nextPrinted(flow, i);
  return t >= 0 && keyOf(flow, t) === "transition" && !isForcedStart(flow, t)
    ? spaceOf(flow, t) + heightOf(flow, t)
    : 0;
}

// The least of block i that can be left at the foot of a page.
function minHead(flow: Flow, i: number): number {
  const k = firstSplit(pieceOf(flow, i), flow.profile.rules, 0);
  return k < 0
    ? heightOf(flow, i) + reserveOf(flow, i)
    : k * stepOf(flow, i) + moreOf(flow, i);
}

/** A dual run, or what is left of it on a new page: each column from where it resumes, null when it is done. */
export interface DualUnit {
  readonly run: DualRun;
  readonly left: Point | null;
  readonly right: Point | null;
}

function wholeRun(run: DualRun): DualUnit {
  return {
    run,
    left: { block: run.start, line: 0 },
    right: run.split < run.end ? { block: run.split, line: 0 } : null,
  };
}

/**
 * The dual run block i is in, as a unit to place from line `line`; `right` is where its right column
 * resumes when the page opened inside the run, null when it is done or the run starts here.
 */
export function dualUnitAt(
  flow: Flow,
  i: number,
  line: number,
  right: Point | null,
): DualUnit | null {
  const run = runAt(flow.blocks, flow.profile, i);
  if (run === null) return null;
  look(flow, run.end - 1);
  if (i >= run.split) return { run, left: null, right: { block: i, line } };
  if (i === run.start && line === 0 && right === null) return wholeRun(run);
  return { run, left: { block: i, line }, right };
}

function columnFrom(
  flow: Flow,
  from: Point | null,
  end: number,
): ColumnPiece[] {
  const column: ColumnPiece[] = [];
  if (from === null) return column;
  for (let j = from.block; j < end; j++)
    if (isPrinted(flow, j))
      column.push({
        block: j,
        line: j === from.block ? from.line : 0,
        lines: flow.metrics[j]!.lines,
        step: stepOf(flow, j),
        space: column.length === 0 ? 0 : spaceOf(flow, j),
      });
  return column;
}

/** The unit's left and right columns. */
export function columnsOf(
  flow: Flow,
  unit: DualUnit,
): readonly [ColumnPiece[], ColumnPiece[]] {
  return [
    columnFrom(flow, unit.left, unit.run.split),
    columnFrom(flow, unit.right, unit.run.end),
  ];
}

/** The cue of the column `at` is in: its nearest cue at or before `at`, in capitals; null for none. */
export function columnCueOf(
  flow: Flow,
  run: DualRun,
  at: Point,
): string | null {
  const top = at.block < run.split ? run.start : run.split;
  for (let j = at.block; j >= top; j--)
    if (keyOf(flow, j) === "character" && flow.blocks[j]!.text.trim() !== "")
      return cueText(flow, j);
  return null;
}

/** Units of the (MORE) line under a cut dual run. */
export function dualMoreOf(flow: Flow): number {
  return flow.profile.furniture.speechContinued ? UNITS_PER_LINE : 0;
}

// The least of a run that can be left at the foot of a page: all of a short run, else down to the
// first row it may be cut at.
function runHead(flow: Flow, run: DualRun): number {
  look(flow, run.end - 1);
  const columns = columnsOf(flow, wholeRun(run));
  const height = Math.max(...columns.map(columnHeight));
  const { minLines, dualSplitAbove } = flow.profile.rules;
  if (height <= flow.cap * dualSplitAbove) return height;
  const edge = minLines * UNITS_PER_LINE;
  for (let row = edge; row <= height - edge; row++)
    if (isCutRow(columns, row)) return row + dualMoreOf(flow);
  return height;
}

// The units block i's part of a chain needs, and whether the chain goes on to the next block.
function link(flow: Flow, i: number): { units: number; next: number } {
  const run = runAt(flow.blocks, flow.profile, i);
  if (run !== null)
    return { units: spaceOf(flow, run.start) + runHead(flow, run), next: -1 };
  const own = spaceOf(flow, i) + heightOf(flow, i);
  const t = nextPrinted(flow, i);
  if (t < 0 || isForcedStart(flow, t))
    return { units: spaceOf(flow, i) + minHead(flow, i), next: -1 };
  if (flow.metrics[i]!.spec.keptWithNext) return { units: own, next: t };
  if (
    keyOf(flow, t) === "transition" &&
    firstSplit(pieceOf(flow, i), flow.profile.rules, 0) < 0
  )
    return { units: own + spaceOf(flow, t) + heightOf(flow, t), next: -1 };
  return { units: spaceOf(flow, i) + minHead(flow, i), next: -1 };
}

/**
 * What has to fit for block i to start on a page that already holds something, never above a page:
 * a chain or block taller than a page moves to a fresh page, where it is placed and cut from the bottom.
 */
export function must(flow: Flow, i: number): number {
  const seen = flow.musts.get(i);
  if (seen !== undefined) {
    look(flow, seen.ahead);
    return seen.units;
  }
  const outer = flow.ahead;
  flow.ahead = i;
  let units = 0;
  for (let at = i; at >= 0 && units < flow.cap;) {
    const known = flow.musts.get(at);
    if (known !== undefined) {
      look(flow, known.ahead);
      units += known.units;
      break;
    }
    const part = link(flow, at);
    units += part.units;
    at = part.next;
  }
  units = Math.min(units, flow.cap);
  flow.musts.set(i, { units, ahead: flow.ahead });
  look(flow, outer);
  return units;
}
