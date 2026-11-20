// The pages of a script in production: its locks, the rule that lets an issued A-page absorb its
// parent's overflow, and the label a page's overflow would take.
import { toLockTable } from "@manent/pagination";
import type {
  Engine,
  LayoutBlock,
  LockAnchorRecord,
  LockTable,
  PageProfile,
  Pagination,
} from "@manent/pagination";

export interface LockedLayout {
  readonly locks: LockTable;
  readonly pagination: Pagination;
  /** Labels of issue anchors set aside so that their pages absorb their parent's overflow. */
  readonly dropped: readonly string[];
}

const LEADING_LETTERS = /^[A-Z]+/;

function prefixAndRest(label: string): readonly [string, string] {
  const rest = label.replace(LEADING_LETTERS, "");
  return [label.slice(0, label.length - rest.length), rest];
}

// `label` is `locked` with letters put in front: A12A before 12A, AA12A before A12A, the label the
// engine gives a page when no letter is left before the next locked page.
function isPrefixedOf(label: string, locked: string): boolean {
  const [prefix, rest] = prefixAndRest(label);
  const [lockedPrefix, lockedRest] = prefixAndRest(locked);
  return (
    rest === lockedRest &&
    prefix.length > lockedPrefix.length &&
    prefix.startsWith(lockedPrefix)
  );
}

const isAbsorbing = (record: LockAnchorRecord) =>
  record.source === "issue" && record.level === 1;

// The labels, in page order, of absorbing anchors whose page a page before it is prefixed onto.
function collisions(
  p: Pagination,
  records: readonly LockAnchorRecord[],
): string[] {
  const absorbing = new Set(
    records.filter(isAbsorbing).map((record) => record.label),
  );
  const found = new Set<string>();
  let next: string | null = null;
  for (const page of p.pages.toReversed()) {
    if (page.locked) next = page.label;
    else if (
      next !== null &&
      absorbing.has(next) &&
      isPrefixedOf(page.label, next)
    )
      found.add(next);
  }
  return [...found].toReversed();
}

/**
 * The pages under the records. Where a parent's overflow would be labelled with a prefix in front of
 * a page that a level-1 issue anchor starts, that anchor is set aside and the script laid out again,
 * so the overflow takes the A-page's label; once the parent fits, the anchor holds again. An anchor
 * of another level or source is never set aside.
 */
export function lockedPagination(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  records: readonly LockAnchorRecord[],
  engine: Engine,
): LockedLayout {
  let kept = records;
  const dropped: string[] = [];
  for (;;) {
    const locks = toLockTable(kept);
    const pagination = engine.paginate(blocks, profile, locks);
    const colliding = new Set(collisions(pagination, kept));
    if (colliding.size === 0)
      return Object.freeze({
        locks,
        pagination,
        dropped: Object.freeze(dropped),
      });
    kept = kept.filter(
      (record) => !(isAbsorbing(record) && colliding.has(record.label)),
    );
    dropped.push(...colliding);
  }
}

/**
 * The label the page's overflow would take, by the engine's rule ("12A" after 12, "12B" after a
 * derived 12A, "A12A" before a locked 12A), or the next page's own label where an issue anchor
 * starts it and the engine's label would be prefixed onto it, since that page absorbs the overflow.
 */
export function nextLabel(
  p: Pagination,
  pageIndex: number,
  engine: Engine,
): string {
  const { pages } = p;
  const before = pages.findLastIndex(
    (page, k) => k <= pageIndex && page.locked,
  );
  const after = pages.findIndex((page, k) => k > pageIndex && page.locked);
  const lower = before < 0 ? null : pages[before]!.label;
  const upper = after < 0 ? null : pages[after]!.label;
  const taken = new Set(p.locks.anchors.map((anchor) => anchor.label));
  const label = engine
    .labelsBetween(lower, upper, pageIndex - before + 1, taken)
    .at(-1)!;
  const absorbs =
    upper !== null &&
    isPrefixedOf(label, upper) &&
    p.locks.anchors.some(
      (anchor) => anchor.label === upper && anchor.source === "issue",
    );
  return absorbs ? upper : label;
}
