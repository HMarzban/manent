// Where a lock table's anchors start pages in a script, and the label each such page carries.
import type { LayoutBlock } from "../../layout-block.ts";
import type { LockAnchor, LockTable } from "../../lock-table.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { BlockMetrics } from "../../pages.ts";
import { runAt } from "./dual.ts";
import { graphemeEnd } from "./graphemes.ts";
import { resolveSpec } from "./measure.ts";

/** Joins the first and last label of a page that holds what several locked pages held. */
export const RANGE_DASH = "–";

/** A page start a lock forces, at `offset` of `block`; its label is one anchor's, or a range of several. */
export interface LockedStart {
  readonly block: number;
  readonly offset: number;
  readonly label: string;
}

/** The starts in page order, and every label any anchor of the table holds, each part of a range too. */
export interface LockPlan {
  readonly starts: readonly LockedStart[];
  readonly taken: ReadonlySet<string>;
}

/** A line of a block that a lock starts a page at, and that page's label. */
export interface LockedLine {
  readonly line: number;
  readonly label: string;
}

interface Place {
  readonly block: number;
  readonly offset: number;
}

/** Places compare as block, then offset: one number, below 2^53 for any script a string can hold. */
const OFFSET_SPAN = 2 ** 32;
const keyOf = (place: Place) => place.block * OFFSET_SPAN + place.offset;

function clusterStart(text: string, offset: number): number {
  let at = 0;
  for (
    let end = graphemeEnd(text, 0);
    end <= offset;
    end = graphemeEnd(text, at)
  )
    at = end;
  return at;
}

// Where an anchor points before the script's layout is considered; null when nothing of it is left.
function placeOf(
  anchor: LockAnchor,
  blocks: readonly LayoutBlock[],
  ids: ReadonlyMap<string, number>,
): Place | null {
  const own = ids.get(anchor.blockId);
  if (own === undefined) {
    const fallback = anchor.fallbackIds.find((id) => ids.has(id));
    return fallback === undefined
      ? null
      : { block: ids.get(fallback)!, offset: 0 };
  }
  const { offset, quote } = anchor;
  if (!(offset > 0)) return { block: own, offset: 0 };
  const { text } = blocks[own]!;
  if (
    Number.isInteger(offset) &&
    offset < text.length &&
    (quote === null || text.startsWith(quote, offset))
  )
    return { block: own, offset: clusterStart(text, offset) };
  const found = quote === null ? -1 : text.indexOf(quote);
  return found < 0
    ? { block: own + 1, offset: 0 }
    : { block: own, offset: clusterStart(text, found) };
}

// The place a page can start at: past blocks that are not printed, and at the start of a dual run,
// which is placed as one unit; null past the script's end.
function settle(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  place: Place,
): Place | null {
  let { block, offset } = place;
  for (; block < blocks.length; block++, offset = 0)
    if (resolveSpec(profile, blocks[block]!).printed) break;
  if (block >= blocks.length) return null;
  const run = runAt(blocks, profile, block);
  if (run !== null && (block !== run.start || offset > 0))
    return { block: run.start, offset: 0 };
  return { block, offset };
}

// Which keys the longest run that never goes backwards keeps; of two equally long, the one that
// keeps earlier keys.
function longestInOrder(keys: readonly number[]): boolean[] {
  // longest[i]: the length of the longest such run that starts at keys[i]
  const longest = keys.map(() => 0);
  // heads[k]: the greatest key that starts such a run of k + 1 keys, among the keys seen
  const heads: number[] = [];
  for (let i = keys.length - 1; i >= 0; i--) {
    let lo = 0;
    let hi = heads.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heads[mid]! >= keys[i]!) lo = mid + 1;
      else hi = mid;
    }
    heads[lo] = keys[i]!;
    longest[i] = lo + 1;
  }
  const kept = keys.map(() => false);
  let need = heads.length;
  let floor = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < keys.length && need > 0; i++)
    if (longest[i] === need && keys[i]! >= floor) {
      kept[i] = true;
      floor = keys[i]!;
      need--;
    }
  return kept;
}

const rangeOf = (labels: readonly string[]) =>
  labels.length === 1
    ? labels[0]!
    : `${labels[0]!}${RANGE_DASH}${labels.at(-1)!}`;

/** Every label any anchor of the table holds, each part of a range too. */
export function takenOf(locks: LockTable): Set<string> {
  return new Set(
    locks.anchors.flatMap((anchor) => anchor.label.split(RANGE_DASH)),
  );
}

/**
 * Where the table's anchors start pages. An anchor whose block is gone falls back to the start of the
 * first of its fallbacks that exists; one with nothing left adds its label to the next kept start, or
 * the last when none follows. Of the rest, the longest run whose places never go backwards is kept,
 * less any anchor whose label an earlier kept one holds; kept anchors at one place share a page.
 */
export function planLocks(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  locks: LockTable,
): LockPlan {
  const taken = takenOf(locks);
  const ids = new Map<string, number>();
  if (locks.anchors.length > 0)
    blocks.forEach((block, i) => {
      if (!ids.has(block.id)) ids.set(block.id, i);
    });
  const places = locks.anchors.map((anchor) => {
    const place = placeOf(anchor, blocks, ids);
    return place === null ? null : settle(blocks, profile, place);
  });
  const present = places.flatMap((place, i) => (place === null ? [] : [i]));
  const inOrder = longestInOrder(present.map((i) => keyOf(places[i]!)));
  const kept = new Set(present.filter((_, k) => inOrder[k]));
  const groups: { place: Place; labels: string[] }[] = [];
  const held = new Set<string>();
  let pending: string[] = [];
  places.forEach((place, i) => {
    const { label } = locks.anchors[i]!;
    if (place === null) pending.push(label);
    if (place === null || !kept.has(i) || held.has(label)) return;
    held.add(label);
    const last = groups.at(-1);
    if (last !== undefined && keyOf(last.place) === keyOf(place))
      last.labels.push(...pending, label);
    else groups.push({ place, labels: [...pending, label] });
    pending = [];
  });
  groups.at(-1)?.labels.push(...pending);
  return {
    starts: groups.map(({ place, labels }) =>
      Object.freeze({ ...place, label: rangeOf(labels) }),
    ),
    taken,
  };
}

/** By block, the offsets inside it where a lock starts a page; each is measured as a forced line start. */
export function forcedOffsets(
  starts: readonly LockedStart[],
): Map<number, number[]> {
  const forced = new Map<number, number[]>();
  for (const { block, offset } of starts)
    if (offset > 0) forced.set(block, [...(forced.get(block) ?? []), offset]);
  return forced;
}

/** By block, the line each lock start begins, the blocks measured with their forced offsets. */
export function lockedLines(
  starts: readonly LockedStart[],
  metrics: readonly BlockMetrics[],
): Map<number, LockedLine[]> {
  const locked = new Map<number, LockedLine[]>();
  for (const { block, offset, label } of starts) {
    const lineStarts = metrics[block]!.starts;
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset)
      line++;
    locked.set(block, [...(locked.get(block) ?? []), { line, label }]);
  }
  return locked;
}
