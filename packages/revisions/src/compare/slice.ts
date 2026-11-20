// A comparison of two long versions delivered scene by scene, so that no slice holds the main thread long.
import type { DocJSON } from "@manent/schema";
import { alignedEntries } from "./align.ts";
import type { BlockEntry } from "./align.ts";
import type { CompareMode } from "./compare-mode.ts";
import { comparisonOf } from "./comparison.ts";
import type { Comparison } from "./comparison.ts";

/**
 * Yields the comparison so far at the first scene boundary after each
 * `sliceMs` of `now()` (milliseconds), and returns the whole one, equal to
 * compareDocs.
 */
export function* sliceComparison(
  older: DocJSON,
  newer: DocJSON,
  options: { mode?: CompareMode; now: () => number; sliceMs: number },
): Generator<Comparison, Comparison> {
  const mode = options.mode ?? "full";
  const entries: BlockEntry[] = [];
  let sliceStartAt = options.now();
  for (const entry of alignedEntries(older, newer, mode)) {
    const last = entries.at(-1);
    if (
      last !== undefined &&
      last.sceneId !== entry.sceneId &&
      options.now() - sliceStartAt >= options.sliceMs
    ) {
      yield comparisonOf(mode, entries);
      sliceStartAt = options.now();
    }
    entries.push(entry);
  }
  return comparisonOf(mode, entries);
}
