// Pages again after an edit: only what the edit can reach is measured and filled anew.
import type { LayoutBlock } from "../../layout-block.ts";
import type {
  BlockMetrics,
  ChangeHint,
  Page,
  Pagination,
} from "../../pages.ts";
import { runAt } from "./dual.ts";
import {
  fillPage,
  firstStart,
  hasSpeakerSuffix,
  isSceneBoundary,
  measureAt,
} from "./fill.ts";
import type { FilledPage, PageStart } from "./fill.ts";
import { createFlow, keyAt } from "./keep.ts";
import type { Flow } from "./keep.ts";
import { forcedOffsets, lockedLines, planLocks, takenOf } from "./locks.ts";
import type { LockPlan, LockedStart } from "./locks.ts";
import { pageLabels } from "./page-labels.ts";

// Where the blocks differ from the last pass's, by identity from the front and from the back.
function changeOf(
  old: readonly LayoutBlock[],
  blocks: readonly LayoutBlock[],
): ChangeHint | null {
  const shorter = Math.min(old.length, blocks.length);
  let first = 0;
  while (first < shorter && old[first] === blocks[first]) first++;
  if (first === old.length && first === blocks.length) return null;
  let tail = 0;
  while (
    tail < shorter - first &&
    old[old.length - 1 - tail] === blocks[blocks.length - 1 - tail]
  )
    tail++;
  return { first, oldEnd: old.length - tail, newEnd: blocks.length - tail };
}

// The anchors must be resolved again: an edited block is one an anchor names, or one whose id, element
// or column changed, or blocks were added or removed.
function needsResolving(
  prev: Pagination,
  blocks: readonly LayoutBlock[],
  change: ChangeHint,
): boolean {
  const { anchors } = prev.locks;
  if (anchors.length === 0) return false;
  if (change.newEnd !== change.oldEnd) return true;
  const named = new Set(
    anchors.flatMap((anchor) => [anchor.blockId, ...anchor.fallbackIds]),
  );
  for (let i = change.first; i < change.newEnd; i++) {
    const was = prev.blocks[i]!;
    const now = blocks[i]!;
    if (
      named.has(was.id) ||
      now.id !== was.id ||
      now.type !== was.type ||
      now.kind !== was.kind ||
      now.dual !== was.dual
    )
      return true;
  }
  return false;
}

// The last pass's lock starts, read back from its locked pages, at the blocks' new indexes.
function startsOf(prev: Pagination, change: ChangeHint): LockedStart[] {
  const shift = change.newEnd - change.oldEnd;
  return prev.pages
    .filter((page) => page.locked)
    .map(({ block, offset, label }) => ({
      block: block >= change.oldEnd ? block + shift : block,
      offset,
      label,
    }));
}

const placeOf = ({ block, offset }: LockedStart) => `${block}:${offset}`;

// The blocks whose lock starts differ between two lists of starts.
function relocked(
  a: readonly LockedStart[],
  b: readonly LockedStart[],
): Set<number> {
  const x = new Set(a.map(placeOf));
  const y = new Set(b.map(placeOf));
  const differ = new Set<number>();
  for (const start of [...a, ...b])
    if (!x.has(placeOf(start)) || !y.has(placeOf(start)))
      differ.add(start.block);
  return differ;
}

// The end of what the edit reaches: same-speaker suffixes up to the next scene boundary, and the
// whole of a dual run on either side.
function reachOf(
  prev: Pagination,
  blocks: readonly LayoutBlock[],
  change: ChangeHint,
): { readonly end: number; readonly resuffixed: ReadonlySet<number> } {
  const { profile } = prev;
  const shift = change.newEnd - change.oldEnd;
  const resuffixed = new Set<number>();
  let end = change.newEnd;
  for (
    let i = change.newEnd;
    i < blocks.length && !isSceneBoundary(keyAt(blocks, i));
    i++
  )
    if (
      hasSpeakerSuffix(blocks, profile, i) !==
      hasSpeakerSuffix(prev.blocks, profile, i - shift)
    ) {
      resuffixed.add(i);
      end = i + 1;
    }
  const now = runAt(blocks, profile, end);
  const was = runAt(prev.blocks, profile, end - shift);
  return {
    end: Math.max(end, now?.end ?? end, was === null ? end : was.end + shift),
    resuffixed,
  };
}

const startOf = (page: Page): PageStart => ({
  block: page.block,
  line: page.line,
  offset: page.offset,
  right: page.right,
  contd: page.contd,
  contdRight: page.contdRight,
  sceneContinued: page.sceneContinued,
  locked: page.locked,
  forced: page.forced,
  topUnits: page.topUnits,
});

const isSameRight = (was: Page["right"], now: Page["right"], shift: number) =>
  was === null
    ? now === null
    : now !== null && was.block + shift === now.block && was.line === now.line;

// The last pass's page that opens as `start` does, `shift` blocks earlier; -1 for none.
function sameStart(
  pages: readonly Page[],
  start: PageStart,
  shift: number,
): number {
  const block = start.block - shift;
  let lo = 0;
  let hi = pages.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid]!.block < block) lo = mid + 1;
    else hi = mid;
  }
  for (let k = lo; k < pages.length && pages[k]!.block === block; k++) {
    const page = pages[k]!;
    if (
      page.line === start.line &&
      isSameRight(page.right, start.right, shift) &&
      page.contd === start.contd &&
      page.contdRight === start.contdRight &&
      page.sceneContinued === start.sceneContinued &&
      page.locked === start.locked &&
      page.forced === start.forced
    )
      return k;
  }
  return -1;
}

function shifted(page: Page, shift: number): FilledPage {
  return {
    ...page,
    block: page.block + shift,
    readAhead: page.readAhead + shift,
    right:
      page.right === null
        ? null
        : Object.freeze({ ...page.right, block: page.right.block + shift }),
  };
}

interface Kept {
  readonly page: FilledPage;
  /** The last pass's page object, while its block indexes still hold. */
  readonly old: Page | null;
}

// The pages from `from` on: filled again until a page opens at or past `end` as one of the last pass's
// did, then the last pass's from there, shifted.
function refill(
  prev: Pagination,
  flow: Flow,
  from: number,
  end: number,
  shift: number,
): Kept[] {
  const kept: Kept[] = [];
  let at: PageStart | null =
    from === 0 ? firstStart(flow) : startOf(prev.pages[from]!);
  while (at !== null) {
    const { page, next } = fillPage(flow, at);
    kept.push({ page, old: null });
    const same =
      next !== null && next.block >= end
        ? sameStart(prev.pages, next, shift)
        : -1;
    if (same >= 0) {
      for (const old of prev.pages.slice(same))
        kept.push(
          shift === 0
            ? { page: old, old }
            : { page: shifted(old, shift), old: null },
        );
      return kept;
    }
    at = next;
  }
  return kept;
}

/**
 * The pages of `blocks` after an edit to `prev.blocks`, with `prev`'s profile and locks: the same as
 * `paginate` gives. A block that is the same object keeps its metrics; filling restarts at the first
 * page that looked at a changed block and stops where a page opens as one of `prev` did, the rest of
 * `prev`'s pages following. Nothing changed returns `prev` itself.
 */
export function repaginate(
  prev: Pagination,
  blocks: readonly LayoutBlock[],
  change?: ChangeHint,
): Pagination {
  const edit = change ?? changeOf(prev.blocks, blocks);
  if (edit === null) return prev;
  const own = Object.freeze([...blocks]);
  const { profile, locks } = prev;
  const shift = edit.newEnd - edit.oldEnd;
  const reach = reachOf(prev, own, edit);
  let { end } = reach;
  const before = startsOf(prev, edit);
  const plan: LockPlan = needsResolving(prev, own, edit)
    ? planLocks(own, profile, locks)
    : { starts: before, taken: takenOf(locks) };
  const moved = relocked(before, plan.starts);
  let first = edit.first;
  for (const block of moved) {
    first = Math.min(first, block);
    end = Math.max(end, block + 1);
  }
  const forced = forcedOffsets(plan.starts);
  const metrics: readonly BlockMetrics[] = Object.freeze(
    own.map((_, i) =>
      (i >= edit.first && i < edit.newEnd) ||
      reach.resuffixed.has(i) ||
      moved.has(i)
        ? measureAt(own, profile, i, forced.get(i) ?? [])
        : prev.metrics[i < edit.first ? i : i - shift]!,
    ),
  );
  const flow = createFlow(
    own,
    profile,
    metrics,
    lockedLines(plan.starts, metrics),
  );
  // a page that read the last block also found nothing after it, which a block added at the end changes
  const reached = Math.min(first, prev.blocks.length - 1);
  const restart = prev.pages.findIndex((page) => page.readAhead >= reached);
  const from = restart < 0 ? prev.pages.length - 1 : restart;
  const kept: Kept[] = [
    ...prev.pages.slice(0, from).map((old) => ({ page: old, old })),
    ...refill(prev, flow, from, end, shift),
  ];
  const labels = pageLabels(
    flow,
    kept.map(({ page }) => page),
    plan.taken,
  );
  return Object.freeze({
    engineVersion: prev.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(
      kept.map(({ page, old }, index) =>
        old !== null && old.index === index && old.label === labels[index]
          ? old
          : Object.freeze({ ...page, index, label: labels[index]! }),
      ),
    ),
  });
}
