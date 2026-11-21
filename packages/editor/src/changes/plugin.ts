// Changes since a version, drawn on the live page. The comparison is kept current as the script changes: a
// transaction re-compares only the blocks it replaced, and the document itself is never touched.
import {
  canonicalBlocksOf,
  compareBlock,
  createComparisonBuilder,
  idOf,
  isSceneHeading,
  longestIncreasingSubsequence,
  textOf,
} from "@manent/revisions";
import type { BlockEntry, CompareMode, Comparison } from "@manent/revisions";
import type { ChangeHint } from "@manent/pagination";
import { canonicalBlock, parseFrom } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import { drawChanges, redrawChanges } from "./decorations.ts";
import type { PlacedRemoval } from "./decorations.ts";

export type ChangesDisplay = "page" | "asterisks";

export interface ChangesState {
  /** The baseline's blocks by id; null: nothing shown. */
  readonly older: ReadonlyMap<string, BlockJSON> | null;
  /** The baseline's block ids, for placing removed blocks. */
  readonly order: readonly string[];
  readonly display: ChangesDisplay;
  /** The baseline against the live document, kept current with it. */
  readonly comparison: Comparison | null;
  /** With display "asterisks", none: the page shows its text as it is. */
  readonly decorations: DecorationSet;
  /** Blocks compared since the last setChanges (a test counter). */
  readonly recompared: number;
}

export const changesKey: PluginKey<ChangesState> = new PluginKey("changes");

interface ChangesValue {
  baseline: DocJSON;
  comparison: Comparison;
  display: ChangesDisplay;
}

/** Shows the changes since `value.baseline`, whose comparison with the live document is `value.comparison`; null hides them. */
export function setChanges(
  tr: Transaction,
  value: ChangesValue | null,
): Transaction {
  return tr.setMeta(changesKey, value);
}

interface OlderPlace {
  readonly index: number;
  readonly scene: string | null;
}

// What the plugin keeps besides what it shows.
interface Tracked extends ChangesState {
  readonly mode: CompareMode;
  /** Each baseline id's place in `order`, and its scene heading there. */
  readonly olderAt: ReadonlyMap<string, OlderPlace>;
  /** The entry of each block of the live document, in the pagination index's order. */
  readonly live: readonly BlockEntry[];
  /** The baseline's blocks the live document lacks, by id. */
  readonly removed: ReadonlyMap<string, BlockEntry>;
}

// every state the plugin makes is one; this proves it to the types
function isTracked(value: ChangesState): value is Tracked {
  return "live" in value;
}

const HIDDEN: Tracked = Object.freeze({
  older: null,
  order: Object.freeze([]),
  display: "page",
  comparison: null,
  decorations: DecorationSet.empty,
  recompared: 0,
  mode: "full",
  olderAt: new Map(),
  live: Object.freeze([]),
  removed: new Map(),
});

const NO_CHANGE = Object.freeze({
  moved: false,
  attrs: Object.freeze([]),
  inline: Object.freeze([]),
  splitFrom: null,
  joinedInto: null,
  after: null,
});

type Baseline = Pick<Tracked, "order" | "olderAt" | "mode"> & {
  readonly older: ReadonlyMap<string, BlockJSON>;
};

// A block without an id, or with one an earlier block holds, is known by its place, as the comparison names it.
function readBaseline(doc: DocJSON, mode: CompareMode): Baseline {
  const older = new Map<string, BlockJSON>();
  const olderAt = new Map<string, OlderPlace>();
  let heading: string | null = null;
  canonicalBlocksOf(doc).forEach((block, i) => {
    const own = idOf(block);
    const id = own !== null && !older.has(own) ? own : `#older:${i}`;
    if (isSceneHeading(block)) heading = id;
    older.set(id, block);
    olderAt.set(id, { index: i, scene: heading });
  });
  return { older, order: [...older.keys()], olderAt, mode };
}

/** A block of the live document, canonical, with the id it is compared under. */
interface LiveBlock {
  readonly id: string;
  readonly block: BlockJSON;
}

// The editor keeps block ids unique, so a live block is known by its id as stored.
function liveBlock(node: Node, k: number): LiveBlock {
  const block = canonicalBlock(node.toJSON());
  return { id: idOf(block) ?? `#newer:${k}`, block };
}

/** The block an added block was split from, when both sides hold it. */
function splitOf(
  block: BlockJSON,
  b: Baseline,
  removed: ReadonlySet<string>,
): string | null {
  const from = block.attrs?.from;
  const origin =
    parseFrom(typeof from === "string" ? from : null)?.originId ?? null;
  return origin !== null && b.older.has(origin) && !removed.has(origin)
    ? origin
    : null;
}

/** One live block against the baseline; its scene, split and move are left for the walk to set. */
function liveEntry({ id, block }: LiveBlock, b: Baseline): BlockEntry {
  const older = b.older.get(id) ?? null;
  const changes =
    older === null || JSON.stringify(older) === JSON.stringify(block)
      ? null
      : compareBlock(older, block, b.mode);
  return Object.freeze({
    ...NO_CHANGE,
    ...changes,
    id,
    kind: older === null ? "added" : changes === null ? "unchanged" : "changed",
    older,
    newer: block,
    sceneId: null,
    olderIndex: b.olderAt.get(id)?.index ?? null,
  });
}

/**
 * The removed blocks, in baseline order, by the block that keeps its place they are listed before (null: the
 * end); `staying` holds the baseline places of the blocks that keep theirs, ascending.
 */
function groupRemoved(
  b: Baseline,
  removed: ReadonlySet<string>,
  staying: readonly number[],
): Map<string | null, Pick<BlockEntry, "id" | "after">[]> {
  const afterOf = new Map<string, string | null>();
  const groups = new Map<string | null, Pick<BlockEntry, "id" | "after">[]>();
  const ids = [...removed].toSorted(
    (x, y) => b.olderAt.get(x)!.index - b.olderAt.get(y)!.index,
  );
  let s = 0;
  for (const id of ids) {
    const i = b.olderAt.get(id)!.index;
    const prior = b.order[i - 1] ?? null;
    // ascending order: a removed block before this one already has its answer
    const after =
      prior !== null && removed.has(prior) ? afterOf.get(prior)! : prior;
    afterOf.set(id, after);
    while (s < staying.length && staying[s]! < i) s++;
    const before = s < staying.length ? b.order[staying[s]!]! : null;
    const group = groups.get(before);
    if (group === undefined) groups.set(before, [{ id, after }]);
    else group.push({ id, after });
  }
  return groups;
}

/**
 * The comparison of the live entries and the removed blocks, in compareDocs' order, with scene headings, splits,
 * moves and removed blocks' places set again, and the removed entries to draw anew: those new, changed, or after
 * a block `near` names.
 */
function assemble(
  b: Baseline,
  entries: readonly BlockEntry[],
  removedIds: ReadonlySet<string>,
  was: ReadonlyMap<string, BlockEntry>,
  near: (k: number) => boolean,
) {
  // as compareDocs moves them: the blocks both sides hold off the longest run in the baseline's order
  const held = entries.flatMap((entry, k) =>
    entry.olderIndex === null ? [] : [k],
  );
  const places = held.map((k) => entries[k]!.olderIndex!);
  const run = longestIncreasingSubsequence(places);
  const staying = new Set(run.map((j) => held[j]!));
  const liveAt = new Map(held.map((k) => [entries[k]!.id, k]));
  const groups = groupRemoved(
    b,
    removedIds,
    run.map((j) => places[j]!),
  );
  const builder = createComparisonBuilder({ mode: b.mode });
  const removed = new Map<string, BlockEntry>();
  const placed: PlacedRemoval[] = [];
  const emit = (before: string | null) => {
    for (const { id, after } of groups.get(before) ?? []) {
      const k = after === null ? -1 : liveAt.get(after)!;
      const older = b.older.get(id)!;
      const place = b.olderAt.get(id)!;
      const text = textOf(older);
      const at = k < 0 ? null : entries[k]!.newer;
      const joined =
        at !== null && text !== "" && textOf(at).endsWith(text) ? after : null;
      const prev = was.get(id);
      const entry =
        prev?.after === after && prev.joinedInto === joined
          ? prev
          : Object.freeze({
              ...NO_CHANGE,
              id,
              kind: "removed" as const,
              older,
              newer: null,
              joinedInto: joined,
              sceneId: place.scene,
              after,
              olderIndex: place.index,
            });
      removed.set(id, entry);
      builder.add(entry);
      if (entry !== prev || near(k)) placed.push({ entry, after: k });
    }
  };
  let heading: string | null = null;
  const live = entries.map((entry, k) => {
    if (staying.has(k)) emit(entry.id);
    if (entry.newer !== null && isSceneHeading(entry.newer)) heading = entry.id;
    // a block leaving or coming back changes the scene and the split of blocks the change never reached
    const splitFrom =
      entry.kind === "added" && entry.newer !== null
        ? splitOf(entry.newer, b, removedIds)
        : null;
    const moved = entry.olderIndex !== null && !staying.has(k);
    const next =
      entry.sceneId === heading &&
      entry.splitFrom === splitFrom &&
      entry.moved === moved
        ? entry
        : Object.freeze({ ...entry, sceneId: heading, splitFrom, moved });
    builder.add(next);
    return next;
  });
  emit(null);
  return { kept: { live, removed, comparison: builder.comparison() }, placed };
}

function shown(value: ChangesValue, state: EditorState): Tracked {
  const { index } = pagesOf(state);
  const b = readBaseline(value.baseline, value.comparison.mode);
  const given = new Map<string, BlockEntry>();
  for (const entry of value.comparison.entries)
    if (entry.newer !== null && !given.has(entry.id))
      given.set(entry.id, entry);
  const blocks: LiveBlock[] = [];
  index.doc.forEach((section) =>
    section.forEach((node) => blocks.push(liveBlock(node, blocks.length))),
  );
  const held = new Set(blocks.map(({ id }) => id));
  const removedIds = new Set(b.order.filter((id) => !held.has(id)));
  // a comparison taken in slices is older than the page when the person typed while it ran
  const entries = blocks.map((live) => {
    const entry = given.get(live.id);
    return entry !== undefined &&
      JSON.stringify(entry.newer) === JSON.stringify(live.block)
      ? entry
      : liveEntry(live, b);
  });
  const a = assemble(b, entries, removedIds, new Map(), () => false);
  const decorations =
    value.display === "asterisks"
      ? DecorationSet.empty
      : drawChanges(index, a.kept.live, a.placed);
  return {
    ...b,
    ...a.kept,
    display: value.display,
    decorations,
    recompared: 0,
  };
}

function recompare(
  prev: Tracked & Baseline,
  tr: Transaction,
  index: BlockIndex,
  change: ChangeHint,
): Tracked {
  const { first, oldEnd, newEnd } = change;
  const replaced = prev.live.slice(first, oldEnd);
  const blocks: LiveBlock[] = [];
  for (let k = first; k < newEnd; k++)
    blocks.push(liveBlock(index.doc.nodeAt(blockPos(index, k))!, k));
  const entering = new Set(blocks.map(({ id }) => id));
  const removedIds = new Set(
    [...prev.removed.keys()].filter((id) => !entering.has(id)),
  );
  for (const { id } of replaced)
    if (!entering.has(id) && prev.older.has(id)) removedIds.add(id);
  const fresh = blocks.map((live) => liveEntry(live, prev));
  const entries = prev.live.toSpliced(first, oldEnd - first, ...fresh);
  const near = (k: number) => k >= first - 1 && k < newEnd;
  const a = assemble(prev, entries, removedIds, prev.removed, near);
  const redraw = {
    ...a.kept,
    placed: a.placed,
    replaced: new Set([...replaced.map(({ id }) => id), ...entering]),
    was: prev.removed,
  };
  return {
    ...prev,
    ...a.kept,
    decorations:
      prev.display === "asterisks"
        ? DecorationSet.empty
        : redrawChanges(prev.decorations, tr.before, index, change, redraw),
    recompared: prev.recompared + blocks.length,
  };
}

function pagesOf(state: EditorState): PaginationState {
  const pages = paginationKey.getState(state);
  if (pages === undefined)
    throw new RangeError(
      "the changes plugin needs the pagination plugin listed before it",
    );
  return pages;
}

function applyChanges(
  tr: Transaction,
  prev: Tracked,
  old: EditorState,
  state: EditorState,
): Tracked {
  const value: ChangesValue | null | undefined = tr.getMeta(changesKey);
  if (value === null) return HIDDEN;
  if (value !== undefined) return shown(value, state);
  const { older } = prev;
  if (older === null) return prev;
  const pages = pagesOf(state);
  // the pages name the blocks a change replaced once they have caught up with it, after a composition too
  if (pages.change !== null && (tr.docChanged || pagesOf(old).frozen))
    return recompare({ ...prev, older }, tr, pages.index, pages.change);
  // no block changed, so nothing moved; while composing, the pages wait and the marks follow the steps
  if (!tr.docChanged || !pages.frozen) return prev;
  return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
}

/**
 * Changes since a version on the live page, listed after the pagination plugin. With display "page" an
 * inserted or formatted range is an ins, deleted text a del before where it was, a removed block a del after
 * the block it followed, and an added or changed block carries `data-changes`.
 */
export function changesPlugin(): Plugin<ChangesState> {
  return new Plugin<ChangesState>({
    key: changesKey,
    state: {
      init: () => HIDDEN,
      apply: (tr, value, old, state) =>
        applyChanges(tr, isTracked(value) ? value : HIDDEN, old, state),
    },
    props: {
      decorations: (state) => changesKey.getState(state)?.decorations,
    },
  });
}
