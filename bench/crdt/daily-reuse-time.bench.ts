// What loading the daily document reused for 60 days costs, against loading the last day's new one.
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";
import { LOADS, loadTimes } from "./aged-time.bench.ts";
import { DAILY, freshDaily, reusedDaily } from "./daily-reuse.bench.ts";

const scenario: Scenario = {
  id: "crdt.daily-reuse-time",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const reused = reusedDaily();
    const reusedState = reused.encodeState();
    reused.destroy();
    const fresh = freshDaily(DAILY.days);
    const freshState = fresh.encodeState();
    fresh.destroy();
    const loads = LOADS[benchMode()];
    return [
      measurement("load_ms_reused", "ms", await loadTimes(reusedState, loads)),
      measurement("load_ms_fresh", "ms", await loadTimes(freshState, loads)),
    ];
  },
};

export default scenario;
