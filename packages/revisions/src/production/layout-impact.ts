// Which locked pages a change of layout would give A-pages, and which it would leave ending early.
import type {
  Engine,
  LayoutBlock,
  LockAnchorRecord,
  PageProfile,
} from "@manent/pagination";
import { productionChecks } from "./checks.ts";
import { lockedPagination } from "./locked-pages.ts";
import type { LockedLayout } from "./locked-pages.ts";

// The overflow checks need only the pages and the records.
function overflowing(
  layout: LockedLayout,
  records: readonly LockAnchorRecord[],
): Set<string> {
  return new Set(
    productionChecks({ flat: [], layout, records, issued: [] }).flatMap(
      (check) => (check.kind === "overflow" ? [check.page] : []),
    ),
  );
}

// By locked label, in page order, the units of blank at the foot of the last page its content fills.
function blanks(layout: LockedLayout, engine: Engine): Map<string, number> {
  const blank = new Map<string, number>();
  let label: string | null = null;
  for (const page of layout.pagination.pages) {
    if (page.locked) label = page.label;
    if (label !== null)
      blank.set(label, engine.fillUnits(layout.pagination, page.index));
  }
  return blank;
}

/**
 * The locked labels, in page order, whose content overflows onto a new A-page only under `after`, and the
 * others whose content ends further from the foot of its page under `after` than under `before`.
 */
export function layoutImpact(
  blocks: readonly LayoutBlock[],
  before: PageProfile,
  after: PageProfile,
  records: readonly LockAnchorRecord[],
  engine: Engine,
): { gainAPages: string[]; fallShort: string[] } {
  const was = lockedPagination(blocks, before, records, engine);
  const now = lockedPagination(blocks, after, records, engine);
  const overflowed = overflowing(was, records);
  const gaining = [...overflowing(now, records)].filter(
    (label) => !overflowed.has(label),
  );
  const gains = new Set(gaining);
  const wasBlank = blanks(was, engine);
  const fallShort = [...blanks(now, engine)]
    .filter(([label, units]) => {
      const previous = wasBlank.get(label);
      return !gains.has(label) && previous !== undefined && units > previous;
    })
    .map(([label]) => label);
  return { gainAPages: gaining, fallShort };
}
