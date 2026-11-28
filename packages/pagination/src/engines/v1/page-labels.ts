// The label each page of a pagination takes, from its locked pages and the labels between them.
import type { FilledPage } from "./fill.ts";
import { lockedAt } from "./keep.ts";
import type { Flow } from "./keep.ts";
import { labelsBetween } from "./labels.ts";

/**
 * The pages' labels: with no lock anchors 1, 2, 3 …; otherwise a locked page takes its lock's label,
 * and each run of pages before, between and after locked pages the labels between theirs, passing
 * over every label in `taken` and every label given so far.
 */
export function pageLabels(
  flow: Flow,
  pages: readonly FilledPage[],
  taken: ReadonlySet<string>,
): string[] {
  const labels: string[] = [];
  const given = new Set(taken);
  const give = (lower: string | null, upper: string | null, count: number) => {
    for (const label of labelsBetween(lower, upper, count, given)) {
      labels.push(label);
      given.add(label);
    }
  };
  let lower: string | null = null;
  let run = 0;
  pages.forEach((page, k) => {
    if ("blank" in page && page.blank === true) return;
    const lock = lockedAt(flow, page.block, page.line);
    if (lock === null) return;
    give(lower, lock, k - run);
    labels.push(lock);
    lower = lock;
    run = k + 1;
  });
  give(lower, null, pages.length - run);
  return labels;
}
