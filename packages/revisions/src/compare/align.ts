// Which block of one version is which block of the other, where each sits, and what became of it.
import { canonicalBlock, parseFrom } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { compareBlock, textOf } from "./block-changes.ts";
import type { InlineChange } from "./block-changes.ts";
import type { CompareMode } from "./compare-mode.ts";

/** The elements that open a scene (a chapter in a manuscript). */
export const SCENE_HEADINGS = ["scene_heading", "slug", "chapter"] as const;

/** Whether the block's element is one of SCENE_HEADINGS. */
export function isSceneHeading(block: BlockJSON): boolean {
  return SCENE_HEADINGS.some((type) => type === block.attrs?.type);
}

/** The block's id as stored; null when it holds none, or holds something other than a string. */
export function idOf(block: BlockJSON): string | null {
  const id = block.attrs?.id;
  return typeof id === "string" ? id : null;
}

/**
 * One block of either side. A block without an id, or holding an id an
 * earlier block of its side holds, is added or removed under the id
 * "#older:<index>" or "#newer:<index>".
 */
export interface BlockEntry {
  readonly id: string;
  readonly kind: "unchanged" | "added" | "removed" | "changed";
  /** Its place among the blocks both sides hold differs (unchanged or changed only). */
  readonly moved: boolean;
  /** canonicalBlock of each side, unknown attributes and marks kept. */
  readonly older: BlockJSON | null;
  readonly newer: BlockJSON | null;
  /** changed: the attributes that differ, in DEFAULT_BLOCK_ATTRS order, unknown ones after by name. */
  readonly attrs: readonly string[];
  /** changed: by offset. */
  readonly inline: readonly InlineChange[];
  /** added: the block it was split from (its `from` names a block both sides hold). */
  readonly splitFrom: string | null;
  /** removed: the earlier block whose newer text ends with this block's older text. */
  readonly joinedInto: string | null;
  /** The heading of its scene: on the newer side, or the older side for a removed block. */
  readonly sceneId: string | null;
  /** removed: the nearest earlier older-side block that newer holds (null: the start). */
  readonly after: string | null;
  /** Its position among the older side's blocks; null for an added block. */
  readonly olderIndex: number | null;
}

function blocksIn(doc: DocJSON): BlockJSON[] {
  return (doc.content ?? []).flatMap((section) => section.content ?? []);
}

/** The canonical blocks of every section, in document order. */
export function canonicalBlocksOf(doc: DocJSON): BlockJSON[] {
  return blocksIn(doc).map(canonicalBlock);
}

/**
 * The indices, ascending, of the first longest strictly increasing
 * subsequence of `values` that patience sorting finds, so that ties break the
 * same way on every run.
 */
export function longestIncreasingSubsequence(
  values: readonly number[],
): number[] {
  // tops[k]: the index last placed on pile k; below[i]: the top of the pile before values[i]'s when it was placed
  const tops: number[] = [];
  const below: number[] = [];
  let firstLongest = -1;
  values.forEach((value, i) => {
    let [lo, hi] = [0, tops.length];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tops[mid]!]! < value) lo = mid + 1;
      else hi = mid;
    }
    below[i] = lo > 0 ? tops[lo - 1]! : -1;
    if (lo === tops.length) firstLongest = i;
    tops[lo] = i;
  });
  const kept: number[] = [];
  for (let i = firstLongest; i !== -1; i = below[i]!) kept.push(i);
  return kept.toReversed();
}

interface Side {
  /** As given: a block is read in canonical form only when its entry is reached. */
  readonly blocks: BlockJSON[];
  readonly ids: string[];
  /** The index of each block that holds its own id. */
  readonly at: Map<string, number>;
  /** The id of each block's scene heading; null before the first. */
  readonly scenes: (string | null)[];
}

/**
 * The id each block is compared under, by the rule BlockEntry states: its
 * own, or "#<side>:<index>" when it holds none or an earlier block holds it.
 */
export function entryIdsOf(
  blocks: readonly BlockJSON[],
  side: "older" | "newer",
): string[] {
  const owned = new Set<string>();
  return blocks.map((block, i) => {
    const own = idOf(block);
    if (own === null || owned.has(own)) return `#${side}:${i}`;
    owned.add(own);
    return own;
  });
}

function sideOf(doc: DocJSON, name: "older" | "newer"): Side {
  const blocks = blocksIn(doc);
  const side: Side = {
    blocks,
    ids: entryIdsOf(blocks, name),
    at: new Map(),
    scenes: [],
  };
  let heading: string | null = null;
  side.ids.forEach((id, i) => {
    const block = blocks[i]!;
    if (id === idOf(block)) side.at.set(id, i);
    if (isSceneHeading(block)) heading = id;
    side.scenes.push(heading);
  });
  return side;
}

const NO_CHANGE = Object.freeze({
  moved: false,
  attrs: Object.freeze([]),
  inline: Object.freeze([]),
  splitFrom: null,
  joinedInto: null,
  after: null,
});

/** A block both sides hold, `older` and `newer` canonical: unchanged, or changed with what differs in `mode`. */
export function heldEntry(
  fields: Pick<BlockEntry, "id" | "moved" | "sceneId"> & {
    readonly older: BlockJSON;
    readonly newer: BlockJSON;
    readonly olderIndex: number;
  },
  mode: CompareMode,
): BlockEntry {
  const { older, newer } = fields;
  const changes =
    JSON.stringify(older) === JSON.stringify(newer)
      ? null
      : compareBlock(older, newer, mode);
  return Object.freeze({
    ...NO_CHANGE,
    ...changes,
    id: fields.id,
    kind: changes === null ? "unchanged" : "changed",
    moved: fields.moved,
    older,
    newer,
    sceneId: fields.sceneId,
    olderIndex: fields.olderIndex,
  });
}

/** A block only the newer side holds, `newer` canonical. */
export function addedEntry(
  fields: Pick<BlockEntry, "id" | "splitFrom" | "sceneId"> & {
    readonly newer: BlockJSON;
  },
): BlockEntry {
  return Object.freeze({
    ...NO_CHANGE,
    id: fields.id,
    kind: "added",
    older: null,
    newer: fields.newer,
    splitFrom: fields.splitFrom,
    sceneId: fields.sceneId,
    olderIndex: null,
  });
}

/**
 * A block only the older side holds, `older` canonical; `at` is the newer
 * side's block `fields.after`, null when that is null. It is joined into
 * `after` when its text is not empty and `at`'s text ends with it.
 */
export function removedEntry(
  fields: Pick<BlockEntry, "id" | "sceneId" | "after"> & {
    readonly older: BlockJSON;
    readonly olderIndex: number;
  },
  at: BlockJSON | null,
): BlockEntry {
  const text = textOf(fields.older);
  const joined = at !== null && text !== "" && textOf(at).endsWith(text);
  return Object.freeze({
    ...NO_CHANGE,
    id: fields.id,
    kind: "removed",
    older: fields.older,
    newer: null,
    joinedInto: joined ? fields.after : null,
    sceneId: fields.sceneId,
    after: fields.after,
    olderIndex: fields.olderIndex,
  });
}

interface Removal {
  readonly index: number;
  readonly after: string | null;
}

interface Alignment {
  older: Side;
  newer: Side;
  /** Older indices of the blocks both sides hold that keep their place. */
  staying: Set<number>;
  /** The removed blocks before each block that keeps its place (null: at the end), in older order. */
  removedBefore: Map<string | null, Removal[]>;
}

function align(olderDoc: DocJSON, newerDoc: DocJSON): Alignment {
  const older = sideOf(olderDoc, "older");
  const newer = sideOf(newerDoc, "newer");
  const positions = newer.ids.flatMap((id) => older.at.get(id) ?? []);
  const staying = new Set(
    longestIncreasingSubsequence(positions).map((k) => positions[k]!),
  );
  // for each older block, the next one after it that keeps its place
  const reversed: (string | null)[] = [];
  let next: string | null = null;
  for (let i = older.ids.length - 1; i >= 0; i--) {
    reversed.push(next);
    if (staying.has(i)) next = older.ids[i]!;
  }
  const precedes = reversed.toReversed();
  const removedBefore = new Map<string | null, Removal[]>();
  let after: string | null = null;
  older.ids.forEach((id, i) => {
    if (newer.at.has(id)) {
      after = id;
      return;
    }
    const before = precedes[i]!;
    const here = removedBefore.get(before);
    if (here === undefined) removedBefore.set(before, [{ index: i, after }]);
    else here.push({ index: i, after });
  });
  return { older, newer, staying, removedBefore };
}

function held(a: Alignment, j: number, mode: CompareMode): BlockEntry {
  const id = a.newer.ids[j]!;
  const newer = canonicalBlock(a.newer.blocks[j]!);
  const sceneId = a.newer.scenes[j]!;
  const i = a.older.at.get(id);
  if (i === undefined) {
    const from = newer.attrs?.from;
    const origin =
      parseFrom(typeof from === "string" ? from : null)?.originId ?? null;
    const splitFrom =
      origin !== null && a.older.at.has(origin) && a.newer.at.has(origin)
        ? origin
        : null;
    return addedEntry({ id, newer, splitFrom, sceneId });
  }
  const older = canonicalBlock(a.older.blocks[i]!);
  const moved = !a.staying.has(i);
  return heldEntry({ id, moved, older, newer, sceneId, olderIndex: i }, mode);
}

function removed(a: Alignment, { index, after }: Removal): BlockEntry {
  const into = after === null ? undefined : a.newer.at.get(after);
  return removedEntry(
    {
      id: a.older.ids[index]!,
      older: canonicalBlock(a.older.blocks[index]!),
      sceneId: a.older.scenes[index]!,
      after,
      olderIndex: index,
    },
    into === undefined ? null : a.newer.blocks[into]!,
  );
}

/**
 * Every block of both sides as an entry, in newer's order, each removed one
 * right before the next block after it on the older side that keeps its
 * place (at the end when none does), removed ones there in older order. A
 * block both sides hold is compared only when its entry is reached.
 */
export function* alignedEntries(
  olderDoc: DocJSON,
  newerDoc: DocJSON,
  mode: CompareMode,
): Generator<BlockEntry, void> {
  const a = align(olderDoc, newerDoc);
  const removedBefore = function* (before: string | null) {
    for (const removal of a.removedBefore.get(before) ?? [])
      yield removed(a, removal);
  };
  for (let j = 0; j < a.newer.ids.length; j++) {
    const id = a.newer.ids[j]!;
    const i = a.older.at.get(id);
    if (i !== undefined && a.staying.has(i)) yield* removedBefore(id);
    yield held(a, j, mode);
  }
  yield* removedBefore(null);
}
