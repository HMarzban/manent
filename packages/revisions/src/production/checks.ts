// The checks a script in production passes before a revision is issued.
import type { LockAnchorRecord, Pagination } from "@manent/pagination";
import type { FlatBlock } from "@manent/schema";
import { fragmentRuns } from "./fragments.ts";
import type { LockedLayout } from "./locked-pages.ts";
import type { SceneNumberRecord } from "./model.ts";
import { compareSceneNumbers } from "./scene-numbers.ts";

/** One check's finding. A check that needs attention lists what it found, in page or scene order. */
export type ProductionCheck =
  | { kind: "numbers_unchanged"; ok: true }
  | { kind: "numbers_changed"; ok: false; scenes: string[] }
  | { kind: "pages_intact"; ok: true }
  | { kind: "pages_moved"; ok: false; pages: string[] }
  | { kind: "empty_page"; ok: false; page: string }
  | { kind: "overflow"; ok: false; page: string; next: string }
  | {
      kind: "fragments";
      ok: false;
      first: string;
      last: string;
      labels: string[];
    }
  | { kind: "omitted"; ok: false; scenes: string[] };

// Joins the labels of locked pages that print as one, as the engine writes them.
const RANGE_DASH = "–";

function isNumberedHeading(block: FlatBlock): boolean {
  return block.attrs.type === "scene_heading" || block.attrs.type === "slug";
}

// Every issued number no heading holds any more, and both numbers of a heading that holds another than
// its own. Issued numbers are distinct, so a number two headings hold is one of these.
function changedNumbers(
  flat: readonly FlatBlock[],
  issued: readonly SceneNumberRecord[],
): string[] {
  const own = new Map(
    issued
      .filter((record) => !record.reserved)
      .map((record) => [record.blockId, record.num]),
  );
  const changed = new Set<string>();
  const present = new Set<string>();
  for (const block of flat) {
    const { id, num } = block.attrs;
    if (!isNumberedHeading(block) || id === null) continue;
    present.add(id);
    const issuedNum = own.get(id) ?? null;
    if (num === issuedNum) continue;
    if (issuedNum !== null) changed.add(issuedNum);
    if (num !== null) changed.add(num);
  }
  for (const [blockId, num] of own) if (!present.has(blockId)) changed.add(num);
  return [...changed].toSorted(compareSceneNumbers);
}

// The anchors whose block and fallbacks are all gone: their pages join the next one that has content.
function emptyAnchors(layout: LockedLayout): Set<string> {
  const ids = new Set(layout.pagination.blocks.map((block) => block.id));
  return new Set(
    layout.locks.anchors
      .filter(
        (anchor) =>
          !ids.has(anchor.blockId) &&
          !anchor.fallbackIds.some((id) => ids.has(id)),
      )
      .map((anchor) => anchor.label),
  );
}

// The labels of anchors with something left that start no page: the engine ignored them as out of order.
function movedAnchors(
  layout: LockedLayout,
  empty: ReadonlySet<string>,
): string[] {
  const held = new Set(
    layout.pagination.pages.flatMap((page) => page.label.split(RANGE_DASH)),
  );
  return layout.locks.anchors
    .map((anchor) => anchor.label)
    .filter((label) => !empty.has(label) && !held.has(label));
}

// One per locked page whose content runs onto a page with a label no record holds: the first such page.
// A new page before every locked page belongs to the first locked page.
function overflows(
  p: Pagination,
  records: readonly LockAnchorRecord[],
): ProductionCheck[] {
  const held = new Set(records.map((record) => record.label));
  const found: ProductionCheck[] = [];
  let parent: string | null = null;
  let before: string | null = null;
  for (const page of p.pages) {
    if (page.locked) {
      if (parent === null && before !== null)
        found.push({
          kind: "overflow",
          ok: false,
          page: page.label,
          next: before,
        });
      parent = page.label;
      before = null;
    } else if (!held.has(page.label) && before === null) {
      before = page.label;
      if (parent !== null)
        found.push({ kind: "overflow", ok: false, page: parent, next: before });
    }
  }
  return found;
}

function omittedScenes(flat: readonly FlatBlock[]): string[] {
  return flat.flatMap((block) =>
    isNumberedHeading(block) && block.attrs.omitted && block.attrs.num !== null
      ? [block.attrs.num]
      : [],
  );
}

/**
 * The checks of `flat`, laid out as `layout` under `records`, against the scene numbers issued so far, in
 * this order: scene numbers, locked pages, one per emptied locked page, one per overflowing locked page,
 * one per run of fragments, and the omitted scenes. The last four appear only when they find something.
 */
export function productionChecks(input: {
  flat: readonly FlatBlock[];
  layout: LockedLayout;
  records: readonly LockAnchorRecord[];
  issued: readonly SceneNumberRecord[];
}): ProductionCheck[] {
  const { flat, layout, records, issued } = input;
  const scenes = changedNumbers(flat, issued);
  const empty = emptyAnchors(layout);
  const pages = movedAnchors(layout, empty);
  const omitted = omittedScenes(flat);
  return [
    scenes.length === 0
      ? { kind: "numbers_unchanged", ok: true }
      : { kind: "numbers_changed", ok: false, scenes },
    pages.length === 0
      ? { kind: "pages_intact", ok: true }
      : { kind: "pages_moved", ok: false, pages },
    ...[...empty].map((page): ProductionCheck => ({
      kind: "empty_page",
      ok: false,
      page,
    })),
    ...overflows(layout.pagination, records),
    ...fragmentRuns(layout.pagination, records).map(
      ({ labels }): ProductionCheck => ({
        kind: "fragments",
        ok: false,
        first: labels[0]!,
        last: labels.at(-1)!,
        labels: [...labels],
      }),
    ),
    ...(omitted.length === 0
      ? []
      : [{ kind: "omitted", ok: false, scenes: omitted } as const]),
  ];
}
