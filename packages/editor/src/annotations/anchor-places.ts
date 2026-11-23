// Where each annotation's range is in the script: found when the list changes, then again only in the blocks a
// transaction replaced.
import type { ChangeHint } from "@manent/pagination";
import { resolveAnchor } from "@manent/revisions";
import type { AnchorBlock } from "@manent/revisions";
import type { TextAnchor } from "@manent/schema";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import type { Annotation } from "./annotations-options.ts";

/**
 * An anchored annotation and where its range last resolved: `anchor` is the host's with that block, start and end,
 * and `block` the block's place in the index, null once the text is removed.
 */
export interface Place {
  readonly annotation: Annotation;
  readonly anchor: TextAnchor;
  readonly block: number | null;
}

/** The blocks on each side of an anchor's block that are searched for its quote. */
const NEIGHBOURS = 2;

const sameAnchor = (a: TextAnchor | null, b: TextAnchor): boolean =>
  a !== null &&
  a.blockId === b.blockId &&
  a.start === b.start &&
  a.end === b.end &&
  a.quote === b.quote &&
  a.prefix === b.prefix &&
  a.suffix === b.suffix;

function anchorBlock(index: BlockIndex, i: number): AnchorBlock {
  const node = index.doc.nodeAt(blockPos(index, i))!;
  return { id: index.blocks[i]!.id, text: node.textContent };
}

/** `anchor` resolved among block `centre` and its neighbours; removed when there is no such block. */
function placed(
  annotation: Annotation,
  anchor: TextAnchor,
  index: BlockIndex,
  centre: number | null,
): Place {
  const removed = { annotation, anchor, block: null };
  if (centre === null) return removed;
  const from = Math.max(0, centre - NEIGHBOURS);
  const to = Math.min(index.blocks.length, centre + NEIGHBOURS + 1);
  const around: AnchorBlock[] = [];
  for (let i = from; i < to; i++) around.push(anchorBlock(index, i));
  const found = resolveAnchor(anchor, around);
  if (!found.ok) return removed;
  const { blockId, start, end } = found;
  return {
    annotation,
    anchor: { ...anchor, blockId, start, end },
    block: from + around.findIndex((block) => block.id === blockId),
  };
}

/** The first block carrying each id among blocks [from, to). */
function blocksById(
  index: BlockIndex,
  from: number,
  to: number,
): Map<string, number> {
  const ids = new Map<string, number>();
  for (let i = from; i < to; i++) {
    const { id } = index.blocks[i]!;
    if (id !== "" && !ids.has(id)) ids.set(id, i);
  }
  return ids;
}

/**
 * The places of `list`'s anchored annotations, in its order. One whose anchor is unchanged keeps its place in
 * `prev`, so a range found in another block stays found; the rest are resolved around their own block.
 */
export function placeList(
  list: readonly Annotation[],
  prev: readonly Place[],
  index: BlockIndex,
): Place[] {
  const kept = new Map(prev.map((place) => [place.annotation.id, place]));
  let ids: Map<string, number> | null = null;
  return list.flatMap((annotation) => {
    const { anchor } = annotation;
    if (anchor === null) return [];
    const before = kept.get(annotation.id);
    if (before !== undefined && sameAnchor(before.annotation.anchor, anchor))
      return [{ ...before, annotation }];
    ids ??= blocksById(index, 0, index.blocks.length);
    return [placed(annotation, anchor, index, ids.get(anchor.blockId) ?? null)];
  });
}

/** The ids `next` has removed that were not removed in `prev`. */
export function newlyRemoved(
  prev: readonly Place[],
  next: readonly Place[],
): string[] {
  const was = new Set(
    prev.filter((p) => p.block === null).map((p) => p.annotation.id),
  );
  return next
    .filter((p) => p.block === null && !was.has(p.annotation.id))
    .map((p) => p.annotation.id);
}

/**
 * The places once `change` replaced blocks [first, oldEnd) with blocks [first, newEnd) of `index`, and the ids
 * whose text it removed. Only a place in a replaced block is resolved again, around its block or, when that is
 * gone, around where it was; a removed one is tried again when a block with its id comes back.
 */
export function followChange(
  places: readonly Place[],
  index: BlockIndex,
  change: ChangeHint,
): { places: Place[]; removed: string[] } {
  const { first, oldEnd, newEnd } = change;
  const entering = blocksById(index, first, newEnd);
  const removed: string[] = [];
  const next = places.map((place) => {
    const { annotation, anchor, block } = place;
    if (block === null) {
      const back = entering.get(anchor.blockId);
      return back === undefined
        ? place
        : placed(annotation, anchor, index, back);
    }
    if (block < first) return place;
    if (block >= oldEnd) return { ...place, block: block + newEnd - oldEnd };
    const near = Math.min(
      Math.max(first, Math.min(block, newEnd - 1)),
      index.blocks.length - 1,
    );
    const now = placed(
      annotation,
      anchor,
      index,
      entering.get(anchor.blockId) ?? near,
    );
    if (now.block === null) removed.push(annotation.id);
    return now;
  });
  return { places: next, removed };
}
