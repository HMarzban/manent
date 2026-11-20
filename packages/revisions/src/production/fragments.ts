// Runs of short issued A-pages that would fit back onto one page.
import { UNITS_PER_LINE } from "@manent/pagination";
import type { LockAnchorRecord, Page, Pagination } from "@manent/pagination";

/** Page labels in page order: ["40A", "40B", "40C"]. */
export interface FragmentRun {
  readonly labels: readonly string[];
}

// The run's lines, and the first page's top furniture, fit on one page.
function fitsOnePage(p: Pagination, run: readonly Page[]): boolean {
  const lines = run.reduce(
    (units, page) => units + page.usedUnits - page.topUnits,
    0,
  );
  return run[0]!.topUnits + lines <= p.profile.linesPerPage * UNITS_PER_LINE;
}

/**
 * Every run of two or more consecutive pages each started by an issue anchor, so all of one parent,
 * the page before the run, whose lines together fit on one page.
 */
export function fragmentRuns(
  p: Pagination,
  records: readonly LockAnchorRecord[],
): FragmentRun[] {
  const issued = new Set(
    records
      .filter((record) => record.source === "issue")
      .map((record) => record.label),
  );
  const runs: Page[][] = [];
  let open = false;
  for (const page of p.pages) {
    const fragment = page.locked && issued.has(page.label);
    if (fragment && open) runs.at(-1)!.push(page);
    else if (fragment) runs.push([page]);
    open = fragment;
  }
  return runs
    .filter((run) => run.length >= 2 && fitsOnePage(p, run))
    .map((run) => ({ labels: run.map((page) => page.label) }));
}
