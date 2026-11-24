// Which decorations a transaction draws: those of the sections it changed, of the sections holding the selection and
// of those shown. Every other section whose decorations can differ is left behind, as it was drawn, until it is
// shown or the page is idle.
import type { ChangeHint, Pagination } from "@manent/pagination";
import { PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { keptSections } from "../sections/keep.ts";
import type { BlockIndex } from "./block-index.ts";
import {
  joinRanges,
  overlapRanges,
  rangesAfter,
  sectionBlocks,
  sectionsOf,
  withoutRanges,
} from "./block-ranges.ts";
import type { BlockRange } from "./block-ranges.ts";
import {
  affectedBlocks,
  decorationsFor,
  movedDecorations,
  placedAsBeforeAfter,
  redrawn,
} from "./decorations.ts";
import type { DecorationOptions } from "./decorations.ts";
import type { PaginationState } from "./plugin.ts";
import { sectionHeightPx } from "./section-height.ts";

/** A section whose decorations are still those drawn for earlier pages: its blocks, and how it sits as drawn. */
export interface BehindSection extends BlockRange {
  /** How much taller the pages now make it than it is drawn, px at 100 %. */
  readonly extraPx: number;
}

/** The decorations, and the sections left behind, ascending. */
export interface DrawnDecorations {
  readonly decorations: DecorationSet;
  readonly behind: readonly BehindSection[];
}

// The sections left behind before `change`, in the blocks after it; one the change reached is dropped.
function behindAfter(
  behind: readonly BehindSection[],
  change: ChangeHint,
): BehindSection[] {
  const shift = change.newEnd - change.oldEnd;
  return behind.flatMap((s) => {
    if (s.to <= change.first) return [s];
    if (s.from < change.oldEnd) return [];
    return [{ ...s, from: s.from + shift, to: s.to + shift }];
  });
}

// The section of `prev` that holds block `block`, found by halving.
function sectionOfBlock(prev: PaginationState, block: number): number {
  const { sectionStart } = prev.index;
  let low = 0;
  let high = sectionStart.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (sectionStart[mid]! <= block) low = mid;
    else high = mid - 1;
  }
  return low;
}

// The sections holding `rest`, each as `still` had it, or as `prev` drew it, and taller by what the change added; a
// section after `placed` keeps its height.
function leftBehind(
  prev: PaginationState,
  now: Pick<PaginationState, "pagination" | "index" | "settings">,
  change: ChangeHint,
  still: readonly BehindSection[],
  rest: readonly BlockRange[],
): BehindSection[] {
  const { index } = now;
  const shift = change.newEnd - change.oldEnd;
  const placed = placedAsBeforeAfter(prev.pagination, now.pagination, change);
  const stillByFrom = new Map(still.map((b) => [b.from, b]));
  return sectionsOf(index, rest).map((s) => {
    const from = index.sectionStart[s]!;
    const to = index.sectionStart[s + 1]!;
    const prior = stillByFrom.get(from);
    const extraPx = prior?.to === to ? prior.extraPx : 0;
    if (from > placed) return { from, to, extraPx };
    // no section left behind holds a block the change replaced
    const was = sectionOfBlock(prev, from < change.first ? from : from - shift);
    const grown = sectionHeightPx(now, s) - sectionHeightPx(prev, was);
    return { from, to, extraPx: extraPx + grown };
  });
}

/**
 * The decorations after a change: built whole with no `prev`; otherwise `prev`'s, moved past the changed blocks by
 * one step, with those built again that can differ in the sections holding the changed blocks, the blocks either
 * side of them and the blocks in `drawn`. With nothing changed, `prev`'s.
 */
export function updateDecorations(
  prev: PaginationState | null,
  index: BlockIndex,
  p: Pagination,
  change: ChangeHint | null,
  options: DecorationOptions,
  drawn: readonly BlockRange[],
): DrawnDecorations {
  const n = index.blocks.length;
  if (prev === null)
    return {
      decorations: DecorationSet.create(
        index.doc,
        decorationsFor(index, p, 0, n, options),
      ),
      behind: [],
    };
  if (change === null)
    return { decorations: prev.decorations, behind: prev.behind };
  const waiting = joinRanges(rangesAfter(prev.behind, change), [
    affectedBlocks(prev.pagination, p, change),
  ]);
  const around = {
    from: Math.max(0, change.first - 1),
    to: Math.min(n, change.newEnd + 1),
  };
  const sections = sectionsOf(index, joinRanges(drawn, [around]));
  const now = overlapRanges(waiting, sectionBlocks(index, sections));
  const still = behindAfter(prev.behind, change);
  return {
    decorations: redrawn(
      movedDecorations(prev, index, change),
      index,
      p,
      now,
      options,
    ),
    behind: leftBehind(
      prev,
      { pagination: p, index, settings: prev.settings },
      change,
      still,
      withoutRanges(waiting, now),
    ),
  };
}

/** The state's decorations with those of its sections left behind that hold a block of `ranges` built again. */
export function drawBehind(
  state: PaginationState,
  ranges: readonly BlockRange[],
  options: DecorationOptions,
): DrawnDecorations {
  const now = state.behind.filter((s) => overlapRanges([s], ranges).length > 0);
  if (now.length === 0)
    return { decorations: state.decorations, behind: state.behind };
  const { index, pagination } = state;
  return {
    decorations: redrawn(state.decorations, index, pagination, now, options),
    behind: state.behind.filter((s) => !now.includes(s)),
  };
}

// The state's decorations and, on the section after each run of sections left behind, a top margin of what the
// pages now add to the run, so that it sits where its pages put it. It is drawn, so its own size is its pages'.
// `doc` is the state's.
function withHeights(state: PaginationState, doc: Node): DecorationSet {
  const { behind, index } = state;
  const at = sectionsOf(index, behind);
  const margins: Decoration[] = [];
  let px = 0;
  let section = 0;
  let pos = 0;
  behind.forEach((run, i) => {
    px += run.extraPx;
    if (behind[i + 1]?.from === run.to) return;
    const next = at[i]! + 1;
    if (px !== 0 && next < doc.childCount) {
      for (; section < next; section++) pos += doc.child(section).nodeSize;
      const to = pos + doc.child(next).nodeSize;
      margins.push(Decoration.node(pos, to, { style: `margin-top: ${px}px` }));
    }
    px = 0;
  });
  return margins.length === 0
    ? state.decorations
    : state.decorations.add(doc, margins);
}

/**
 * What each state of the plugin draws: its decorations and, where sections are left behind, the margins that keep
 * every section drawn where its pages put it. Each state's are made once.
 */
export function drawnDecorations(): (
  state: PaginationState,
  doc: Node,
) => DecorationSet {
  const made = new WeakMap<PaginationState, DecorationSet>();
  return (state, doc) => {
    const known = made.get(state);
    if (known !== undefined) return known;
    const set = withHeights(state, doc);
    made.set(state, set);
    return set;
  };
}

const drawKey = new PluginKey("pagination-draw");

/** What the view asks to be drawn: the blocks in view or near it, and more of those left behind while the page is idle. */
export interface DrawRequest {
  readonly shown: readonly BlockRange[];
  readonly idle: readonly BlockRange[];
}

export function drawRequest(
  tr: Transaction,
  request: DrawRequest,
): Transaction {
  return tr.setMeta(drawKey, request).setMeta("addToHistory", false);
}

/** The transaction's draw request; null when it has none. */
export function drawRequestOf(tr: Transaction): DrawRequest | null {
  const request: DrawRequest | undefined = tr.getMeta(drawKey);
  return request ?? null;
}

/**
 * A transaction that changes neither the document nor the settings: it takes the blocks shown from its request, and
 * draws the sections left behind that are shown, hold the selection or are asked for. While a composition holds older
 * pages nothing is drawn.
 */
export function drawRun(
  prev: PaginationState,
  state: EditorState,
  request: DrawRequest | null,
  options: DecorationOptions,
): PaginationState {
  const settled = prev.change === null ? prev : { ...prev, change: null };
  if (prev.frozen) return settled;
  const asked =
    request === null ? settled : { ...settled, shown: request.shown };
  if (asked.behind.length === 0) return asked;
  const blocks = joinRanges(
    joinRanges(request?.idle ?? [], asked.shown),
    sectionBlocks(asked.index, keptSections(state, 0)),
  );
  const next = drawBehind(asked, blocks, options);
  return next.behind === asked.behind ? asked : { ...asked, ...next };
}
