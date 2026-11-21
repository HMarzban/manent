// Comparing two versions of a 2,000-page script in slices, as the History tab does on the main
// thread: the whole comparison, and the longest slice it ran without yielding.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { sliceComparison } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { Measurement, Scenario } from "../../harness.ts";
import { editedScript } from "./compare.bench.ts";

const EDITS = 2_000;
/** The longest slice of a comparison on the main thread, in milliseconds, as the History tab asks. */
const COMPARE_SLICE_MS = 8;
/** The real clock, in milliseconds. */
const now = (): number => performance.now();

/** The time of the whole comparison and of its longest slice, in milliseconds. */
function sliced(older: DocJSON, newer: DocJSON): [number, number] {
  const slices = sliceComparison(older, newer, {
    now,
    sliceMs: COMPARE_SLICE_MS,
  });
  const start = now();
  let longest = 0;
  for (;;) {
    const sliceStart = now();
    const { done } = slices.next();
    longest = Math.max(longest, now() - sliceStart);
    if (done === true) return [now() - start, longest];
  }
}

/**
 * `compare_ms` and `longest_slice_ms`: `samples` sliced comparisons (default 3) of a 2,000-page
 * script with itself 2,000 edits later.
 */
export function sliceScenario(options: { samples?: number } = {}): Scenario {
  const { samples = 3 } = options;
  return {
    id: "history.compare.2000",
    workload: "W7",
    processes: 5,
    run(): Promise<Measurement[]> {
      const older = corpusDoc(generateBlocks("screenplay", 45_000, 7));
      const newer = editedScript(older, EDITS);
      const runs = Array.from({ length: samples }, () => sliced(older, newer));
      return Promise.resolve([
        { metric: "compare_ms", unit: "ms", samples: runs.map(([all]) => all) },
        {
          metric: "longest_slice_ms",
          unit: "ms",
          samples: runs.map(([, longest]) => longest),
        },
      ]);
    },
  };
}

export default sliceScenario();
