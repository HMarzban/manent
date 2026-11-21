// Comparing two versions of a 2,000-page script in slices, as the History tab does on the main
// thread: the whole comparison, and the longest slice it ran without yielding.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { sliceComparison } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { editedScript } from "./compare.bench.ts";

const EDITS = 2_000;
/** The longest slice of a comparison on the main thread, in milliseconds, as the History tab asks. */
const COMPARE_SLICE_MS = 8;
/** The real clock, in milliseconds. */
const now = (): number => performance.now();

/** Comparisons a process when not given: 8 outside quick mode, so five processes give the 40 a p95 is judged over. */
const SAMPLES = { quick: 3, standard: 8, full: 8 } as const;

/** The time of the whole comparison and of its longest slice, in milliseconds. */
async function sliced(
  older: DocJSON,
  newer: DocJSON,
): Promise<[number, number]> {
  const slices = sliceComparison(older, newer, {
    now,
    sliceMs: COMPARE_SLICE_MS,
  });
  const steps: number[] = [];
  const progress = { done: false };
  const all = await sampleMs(async () => {
    while (!progress.done)
      steps.push(
        await sampleMs(() => {
          progress.done = slices.next().done === true;
        }),
      );
  });
  return [all, Math.max(...steps)];
}

/**
 * `compare_ms` and `longest_slice_ms`: `samples` sliced comparisons (default by mode, SAMPLES) of a
 * 2,000-page script with itself 2,000 edits later.
 */
export function sliceScenario(options: { samples?: number } = {}): Scenario {
  const { samples } = options;
  return {
    id: "history.compare.2000",
    workload: "W7",
    processes: 5,
    async run(): Promise<Measurement[]> {
      const older = corpusDoc(generateBlocks("screenplay", 45_000, 7));
      const newer = editedScript(older, EDITS);
      const runs: [number, number][] = [];
      for (let n = 0; n < (samples ?? SAMPLES[benchMode()]); n++)
        runs.push(await sliced(older, newer));
      return [
        { metric: "compare_ms", unit: "ms", samples: runs.map(([all]) => all) },
        {
          metric: "longest_slice_ms",
          unit: "ms",
          samples: runs.map(([, longest]) => longest),
        },
      ];
    },
  };
}

export default sliceScenario();
