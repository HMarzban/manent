// A comparison of two long versions delivered in slices, so that none holds the main thread long.
import type { DocJSON } from "@manent/schema";
import { alignedEntries } from "./align.ts";
import type { CompareMode } from "./compare-mode.ts";
import { createComparisonBuilder } from "./comparison.ts";
import type { Comparison } from "./comparison.ts";

/**
 * Yields the comparison so far once `sliceMs` of `now()` (milliseconds) have
 * passed since the slice began, checked after each entry is made, so that a
 * slice runs over by at most one block however long a scene runs; returns
 * the whole one, equal to compareDocs.
 */
export function* sliceComparison(
  older: DocJSON,
  newer: DocJSON,
  options: { mode?: CompareMode; now: () => number; sliceMs: number },
): Generator<Comparison, Comparison> {
  const mode = options.mode ?? "full";
  const builder = createComparisonBuilder({ mode });
  let empty = true;
  let sliceStartAt = options.now();
  for (const entry of alignedEntries(older, newer, mode)) {
    if (!empty && options.now() - sliceStartAt >= options.sliceMs) {
      yield builder.comparison();
      sliceStartAt = options.now();
    }
    builder.add(entry);
    empty = false;
  }
  return builder.comparison();
}
