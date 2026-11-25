// Client memory soak: one browser tab and 3 realistic writers on a 120-page script for the mode's
// soak length (or MANENT_SOAK_MINUTES), sampling JavaScript heap and DOM nodes every minute.
import { PROFILES } from "@manent/demo";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { domNodes, heapBytes, startBenchDemo } from "../driver.ts";
import {
  regionsIn,
  shareRoles,
  startPeople,
  waitForServer,
} from "../people.ts";
import { openCorpusScript, scriptBlocks } from "../typing/run-typing.ts";

const PAGES = 120;
const WRITERS = ["sam", "leo", "ana"] as const;
const MINUTE_MS = 60_000;
const SOAK_MINUTES = { quick: 1, standard: 10, full: 120 } as const;

function soakDurationMinutes(): number {
  const raw = process.env.MANENT_SOAK_MINUTES;
  if (raw === undefined || raw === "") return SOAK_MINUTES[benchMode()];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new RangeError(
      `MANENT_SOAK_MINUTES must be a positive number, not ${raw}`,
    );
  return parsed;
}

/** Ordinary least-squares slope in bytes per minute across equally spaced minute samples. */
function slopePerMinute(
  values: readonly number[],
  stepMinutes: number,
): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = ((n - 1) * stepMinutes) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i * stepMinutes - meanX;
    num += dx * (values[i]! - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

const scenario: Scenario = {
  id: "soak-client-120",
  workload: "W1",
  processes: 1,
  async run(): Promise<Measurement[]> {
    const minutes = soakDurationMinutes();
    const demo = await startBenchDemo();
    try {
      const p = await demo.openPage({ userId: "dana" });
      try {
        const { d, docId } = await openCorpusScript(p.page, PAGES);
        await waitForServer(demo, {
          userId: "dana",
          docId,
          blocks: d.blocks,
        });
        await shareRoles(
          demo,
          docId,
          WRITERS.map((userId) => ({
            userId,
            role: "edit",
            capabilities: [],
          })),
        );
        const blocks = await scriptBlocks(p.page);
        const regions = regionsIn(blocks, 0.1, 0.9, WRITERS.length);
        const started = await startPeople({
          demo,
          docId,
          people: WRITERS.map((userId, i) => ({
            userId,
            profile: PROFILES.realistic,
            region: regions[i]!,
            markers: false,
          })),
          seed: 600,
        });
        try {
          const heaps: number[] = [];
          const nodes: number[] = [];
          const steps = Math.max(1, Math.round(minutes));
          const stepMs = (minutes * MINUTE_MS) / steps;
          if (steps === 1) {
            heaps.push(await heapBytes(p));
            nodes.push(await domNodes(p));
          }
          for (let i = 0; i < steps; i++) {
            await Bun.sleep(stepMs);
            heaps.push(await heapBytes(p));
            nodes.push(await domNodes(p));
          }
          const firstHeap = heaps[0]!;
          const lastHeap = heaps.at(-1)!;
          const firstNodes = nodes[0]!;
          const lastNodes = nodes.at(-1)!;
          const heapGrowth =
            firstHeap === 0 ? 0 : ((lastHeap - firstHeap) / firstHeap) * 100;
          const nodeGrowth =
            firstNodes === 0
              ? 0
              : ((lastNodes - firstNodes) / firstNodes) * 100;
          return [
            measurement("heap_growth", "percent", [heapGrowth]),
            measurement("heap_slope", "bytes", [
              slopePerMinute(heaps, stepMs / MINUTE_MS),
            ]),
            measurement("node_growth", "percent", [nodeGrowth]),
            inputBlocks(d.blocks),
          ];
        } finally {
          await started.stop();
        }
      } finally {
        await p.close();
      }
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
