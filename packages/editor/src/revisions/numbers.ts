// Production's layout of the live script, derived scene numbers and omitted scenes, the numbers an edit may not
// carry, the lock table its pages keep, and the engine that lays them out.
import type {
  Engine,
  LayoutPatches,
  LockAnchorRecord,
  Pagination,
} from "@manent/pagination";
import {
  baseEngine,
  deriveNumbers,
  elasticEngine,
  findCollisions,
  lockedPagination,
  productionLayout,
} from "@manent/revisions";
import type { LockedLayout } from "@manent/revisions";
import type { FlatBlock } from "@manent/schema";
import type { EditorState, Transaction } from "prosemirror-state";
import type { PaginationState } from "../pagination/plugin.ts";
import type { RevisionKept } from "./derive.ts";
import type { ProductionView } from "./plugin.ts";

/** A heading that carries a scene number: a scene heading or a slug. */
export function isNumberedHeading(type: unknown): boolean {
  return type === "scene_heading" || type === "slug";
}

/** The patches that lay the script out as production shows it: numbers derived for new headings, omitted scenes hidden. */
export function layoutOf(
  flat: readonly FlatBlock[],
  view: ProductionView,
): LayoutPatches {
  const headings = flat.flatMap(({ attrs }) =>
    isNumberedHeading(attrs.type) && attrs.id !== null
      ? [{ blockId: attrs.id, num: attrs.num }]
      : [],
  );
  return productionLayout(
    flat,
    deriveNumbers(headings, view.numbering, view.used),
  );
}

/**
 * The engine production's pages are laid out by: while `records` hold an import anchor, the elastic engine over
 * `engine`'s base, so each imported page is drawn whole; else the base itself. `engine` when it already is that one.
 */
export function productionEngine(
  engine: Engine,
  records: readonly LockAnchorRecord[],
): Engine {
  return records.some((record) => record.source === "import")
    ? elasticEngine(engine)
    : baseEngine(engine);
}

/** The pages' blocks laid out under `records`, as the issued file lays them out. */
function lockedOf(
  pages: PaginationState,
  records: readonly LockAnchorRecord[],
): LockedLayout {
  const { engine, profile } = pages.settings;
  return lockedPagination(
    pages.index.blocks,
    profile,
    records,
    baseEngine(engine),
  );
}

/**
 * Whether a set-aside anchor may hold again after a change to pages `from` to `to`: the change reached the pages
 * from the locked page before its label to the label's page, which alone decide whether the parent still
 * overflows, since that locked page starts hard. A missing label means the overflow is gone; laid out again,
 * the anchor holds, so this cannot repeat on the next change.
 */
function reachesSetAside(
  p: Pagination,
  dropped: readonly string[],
  from: number,
  to: number,
): boolean {
  return dropped.some((label) => {
    const at = p.pages.findIndex((page) => page.label === label);
    if (at < 0) return true;
    const before = p.pages.findLastIndex((page, k) => k < at && page.locked);
    return from <= at && to >= Math.max(before, 0);
  });
}

/**
 * Whether the pages, laid out under `locked`'s table, must be laid out again from the records: a page the
 * change reached collides with an issued A-page, or the change may let a set-aside anchor hold again.
 */
function needsRelock(
  pages: PaginationState,
  locked: LockedLayout,
  records: readonly LockAnchorRecord[],
): boolean {
  const { change, pagination: p, settings } = pages;
  if (change === null || settings.locks !== locked.locks) return false;
  const pageAt = (block: number): number =>
    block < p.blocks.length
      ? settings.engine.pageOf(p, block, 0)
      : p.pages.length - 1;
  const from = pageAt(change.first);
  const to = pageAt(Math.max(change.first, change.newEnd - 1));
  if (reachesSetAside(p, locked.dropped, from, to)) return true;
  return findCollisions(p, records, from).length > 0;
}

const sameLabels = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((label, i) => label === b[i]);

/**
 * The lock table brought up to date with the pages: laid out again once the layout has reached the pagination,
 * when the records change, or when the pages a change reached show an issued A-page that should take its parent's
 * overflow, or one set aside that may hold again. The table keeps its identity while it says the same.
 */
export function withPages(
  kept: RevisionKept,
  pages: PaginationState,
): RevisionKept {
  const { view } = kept;
  if (view === null) return kept;
  let { locked, records } = kept;
  const settled = pages.index.layoutKey === (kept.layout?.key ?? null);
  if (
    settled &&
    (records !== view.records ||
      (locked !== null && needsRelock(pages, locked, view.records)))
  ) {
    const fresh = lockedOf(pages, view.records);
    if (
      locked === null ||
      records !== view.records ||
      !sameLabels(fresh.dropped, locked.dropped)
    )
      locked = fresh;
    records = view.records;
  }
  if (locked !== null && locked.pagination !== pages.pagination)
    locked = { ...locked, pagination: pages.pagination };
  if (
    locked === kept.locked &&
    records === kept.records &&
    kept.pagination === pages.pagination
  )
    return kept;
  return { ...kept, locked, records, pagination: pages.pagination };
}

// y-sync marks every change it brings from the CRDT as never an undo step, as it does an undo of its own
const isLocalEdit = (tr: Transaction): boolean =>
  tr.docChanged && tr.getMeta("addToHistory") !== false;

/** The ranges of `state.doc` the local transactions among `trs` replaced. */
function localRanges(
  trs: readonly Transaction[],
): { from: number; to: number }[] {
  let ranges: { from: number; to: number }[] = [];
  for (const tr of trs) {
    ranges = ranges.map(({ from, to }) => ({
      from: tr.mapping.map(from, -1),
      to: tr.mapping.map(to, 1),
    }));
    if (!isLocalEdit(tr)) continue;
    tr.mapping.maps.forEach((map, k) => {
      const rest = tr.mapping.slice(k + 1);
      map.forEach((_from, _to, from, to) =>
        ranges.push({ from: rest.map(from, -1), to: rest.map(to, 1) }),
      );
    });
  }
  return ranges;
}

/**
 * Sets `num` back to the number issued for each block a local edit among `trs` reached, or to null, so a number
 * pasted from elsewhere never leaves this device; a remote change is left alone. Null when nothing differs.
 */
export function clearedNumbers(
  trs: readonly Transaction[],
  state: EditorState,
  view: ProductionView,
): Transaction | null {
  const tr = state.tr;
  const seen = new Set<number>();
  for (const { from, to } of localRanges(trs))
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== "block") return true;
      if (seen.has(pos)) return false;
      seen.add(pos);
      const id: unknown = node.attrs.id;
      const issued =
        typeof id === "string" ? (view.issuedNumbers.get(id) ?? null) : null;
      if (node.attrs.num !== issued) tr.setNodeAttribute(pos, "num", issued);
      return false;
    });
  return tr.docChanged ? tr : null;
}
