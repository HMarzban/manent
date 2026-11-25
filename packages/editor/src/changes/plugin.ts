// Changes since a version, drawn on the live page. The comparison is kept current as the script changes: a
// transaction re-compares only the blocks it replaced, and the document itself is never touched.
import {
  addedEntry,
  canonicalBlocksOf,
  createComparisonBuilder,
  entryIdsOf,
  heldEntry,
  idOf,
  isSceneHeading,
  longestIncreasingSubsequence,
  removedEntry,
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
  readonly older: ReadonlyMap<string, BlockJSON> | null;
  readonly order: readonly string[];
  readonly display: ChangesDisplay;
  readonly comparison: Comparison | null;
  readonly decorations: DecorationSet;
  readonly recompared: number;
}

export const changesKey: PluginKey<ChangesState> = new PluginKey("changes");

interface ChangesValue {
  baseline: DocJSON;
  comparison: Comparison;
  display: ChangesDisplay;
}

/** Shows the changes since `value.baseline`; null hides them. */
export const setChanges = (
  tr: Transaction,
  value: ChangesValue | null,
): Transaction => tr.setMeta(changesKey, value);

type OlderAt = ReadonlyMap<
  string,
  { readonly index: number; readonly scene: string | null }
>;

interface Tracked extends ChangesState {
  readonly mode: CompareMode;
  readonly olderAt: OlderAt;
  readonly live: readonly BlockEntry[];
  readonly removed: ReadonlyMap<string, BlockEntry>;
}

const isTracked = (value: ChangesState): value is Tracked => "live" in value;
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

type Baseline = Pick<Tracked, "order" | "olderAt" | "mode"> & {
  readonly older: ReadonlyMap<string, BlockJSON>;
};

function readBaseline(doc: DocJSON, mode: CompareMode): Baseline {
  const blocks = canonicalBlocksOf(doc);
  const order = entryIdsOf(blocks, "older");
  const older = new Map<string, BlockJSON>();
  const olderAt = new Map<string, { index: number; scene: string | null }>();
  let heading: string | null = null;
  order.forEach((id, i) => {
    const block = blocks[i]!;
    if (isSceneHeading(block)) heading = id;
    older.set(id, block);
    olderAt.set(id, { index: i, scene: heading });
  });
  return { older, order, olderAt, mode };
}

const liveBlock = (node: Node, k: number) => {
  const block = canonicalBlock(node.toJSON());
  return { id: idOf(block) ?? `#newer:${k}`, block };
};

function liveEntry(id: string, block: BlockJSON, b: Baseline): BlockEntry {
  const older = b.older.get(id);
  if (older === undefined)
    return addedEntry({ id, newer: block, splitFrom: null, sceneId: null });
  const olderIndex = b.olderAt.get(id)!.index;
  return heldEntry(
    { id, moved: false, older, newer: block, sceneId: null, olderIndex },
    b.mode,
  );
}

function groupRemoved(
  b: Baseline,
  removed: ReadonlySet<string>,
  staying: readonly number[],
) {
  const afterOf = new Map<string, string | null>();
  const groups = new Map<string | null, Pick<BlockEntry, "id" | "after">[]>();
  const ids = [...removed].toSorted(
    (x, y) => b.olderAt.get(x)!.index - b.olderAt.get(y)!.index,
  );
  let s = 0;
  for (const id of ids) {
    const i = b.olderAt.get(id)!.index;
    const prior = b.order[i - 1] ?? null;
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

function removedBlock(
  b: Baseline,
  id: string,
  after: string | null,
  at: BlockJSON | null,
  prev: BlockEntry | null,
): BlockEntry {
  const { scene, index } = b.olderAt.get(id)!;
  const entry = removedEntry(
    { id, older: b.older.get(id)!, sceneId: scene, after, olderIndex: index },
    at,
  );
  return prev?.after === after && prev.joinedInto === entry.joinedInto
    ? prev
    : entry;
}

function assemble(
  b: Baseline,
  entries: readonly BlockEntry[],
  removedIds: ReadonlySet<string>,
  was: ReadonlyMap<string, BlockEntry>,
  near: (k: number) => boolean,
) {
  const held: number[] = [];
  const places: number[] = [];
  const liveAt = new Map<string, number>();
  entries.forEach((e, k) => {
    if (e.olderIndex === null) return;
    held.push(k);
    places.push(e.olderIndex);
    liveAt.set(e.id, k);
  });
  const run = longestIncreasingSubsequence(places);
  const staying = new Set(run.map((j) => held[j]!));
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
      const prev = was.get(id) ?? null;
      const entry = removedBlock(
        b,
        id,
        after,
        k < 0 ? null : entries[k]!.newer,
        prev,
      );
      removed.set(id, entry);
      builder.add(entry);
      if (entry !== prev || near(k)) placed.push({ entry, after: k });
    }
  };
  let heading: string | null = null;
  const live = entries.map((e, k) => {
    if (staying.has(k)) emit(e.id);
    if (e.newer !== null && isSceneHeading(e.newer)) heading = e.id;
    const rawFrom = e.kind === "added" ? e.newer?.attrs?.from : null;
    const origin =
      typeof rawFrom === "string"
        ? (parseFrom(rawFrom)?.originId ?? null)
        : null;
    const splitFrom =
      origin !== null && b.older.has(origin) && !removedIds.has(origin)
        ? origin
        : null;
    const moved = e.olderIndex !== null && !staying.has(k);
    const next =
      e.sceneId === heading && e.splitFrom === splitFrom && e.moved === moved
        ? e
        : Object.freeze({ ...e, sceneId: heading, splitFrom, moved });
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
  for (const e of value.comparison.entries)
    if (e.newer !== null && !given.has(e.id)) given.set(e.id, e);
  const entries: BlockEntry[] = [];
  const held = new Set<string>();
  index.doc.forEach((s) =>
    s.forEach((n) => {
      const { id, block } = liveBlock(n, entries.length);
      held.add(id);
      const e = given.get(id);
      const reused =
        e !== undefined && JSON.stringify(e.newer) === JSON.stringify(block);
      entries.push(reused ? e : liveEntry(id, block, b));
    }),
  );
  const removedIds = new Set(b.order.filter((id) => !held.has(id)));
  const a = assemble(b, entries, removedIds, new Map(), () => false);
  return {
    ...b,
    ...a.kept,
    display: value.display,
    decorations:
      value.display === "asterisks"
        ? DecorationSet.empty
        : drawChanges(index, a.kept.live, a.placed),
    recompared: 0,
  };
}

function tryInPlaceSingle(
  prev: Tracked & Baseline,
  first: number,
  raw: BlockEntry,
) {
  const base = prev.comparison;
  const old = prev.live[first]!;
  if (
    base === null ||
    old.id !== raw.id ||
    old.newer === null ||
    raw.newer === null ||
    isSceneHeading(old.newer) !== isSceneHeading(raw.newer) ||
    (old.kind === "added" && old.newer.attrs?.from !== raw.newer.attrs?.from)
  )
    return null;
  const { sceneId, splitFrom, moved } = old;
  const next = Object.freeze({ ...raw, sceneId, splitFrom, moved });
  const live = prev.live.slice();
  live[first] = next;
  const prevId = first > 0 ? prev.live[first - 1]!.id : null;
  let removed: Map<string, BlockEntry> | null = null;
  const placed: PlacedRemoval[] = [];
  for (const [id, r] of prev.removed) {
    if (r.after === old.id) {
      const u = removedBlock(prev, id, r.after, next.newer, r);
      if (u !== r) (removed ??= new Map(prev.removed)).set(id, u);
      placed.push({ entry: u, after: first });
    } else if (r.after === prevId) placed.push({ entry: r, after: first - 1 });
  }
  const entries =
    prev.removed.size === 0
      ? live
      : base.entries.map((e) =>
          e.id === old.id ? next : (removed?.get(e.id) ?? e),
        );
  let comparison: Comparison = Object.freeze({ ...base, entries });
  if (old.kind !== next.kind || old.moved !== next.moved) {
    const builder = createComparisonBuilder({ mode: prev.mode });
    for (const e of entries) builder.add(e);
    comparison = builder.comparison();
  }
  return {
    kept: { live, removed: removed ?? prev.removed, comparison },
    placed,
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
  const fresh: BlockEntry[] = [];
  const entering = new Set<string>();
  for (let k = first; k < newEnd; k++) {
    const { id, block } = liveBlock(index.doc.nodeAt(blockPos(index, k))!, k);
    entering.add(id);
    fresh.push(liveEntry(id, block, prev));
  }
  let a =
    replaced.length === 1 && fresh.length === 1
      ? tryInPlaceSingle(prev, first, fresh[0]!)
      : null;
  if (a === null) {
    const removedIds = new Set(
      [...prev.removed.keys()].filter((id) => !entering.has(id)),
    );
    for (const { id } of replaced)
      if (!entering.has(id) && prev.older.has(id)) removedIds.add(id);
    a = assemble(
      prev,
      prev.live.toSpliced(first, oldEnd - first, ...fresh),
      removedIds,
      prev.removed,
      (k) => k >= first - 1 && k < newEnd,
    );
  }
  const redraw = {
    ...a.kept,
    placed: a.placed,
    replaced: new Set([...entering, ...replaced.map(({ id }) => id)]),
    was: prev.removed,
  };
  return {
    ...prev,
    ...a.kept,
    decorations:
      prev.display === "asterisks"
        ? DecorationSet.empty
        : redrawChanges(prev.decorations, tr.before, index, change, redraw),
    recompared: prev.recompared + fresh.length,
  };
}

const pagesOf = (state: EditorState): PaginationState => {
  const pages = paginationKey.getState(state);
  if (pages === undefined)
    throw new RangeError(
      "the changes plugin needs the pagination plugin listed before it",
    );
  return pages;
};

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
  if (pages.change !== null && (tr.docChanged || pagesOf(old).frozen))
    return recompare({ ...prev, older }, tr, pages.index, pages.change);
  if (!tr.docChanged || !pages.frozen) return prev;
  return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
}

/** Changes since a version on the live page, listed after the pagination plugin. */
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
