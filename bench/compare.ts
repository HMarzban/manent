// Regression tracking: two runs compared metric by metric, and the baseline CI compares against,
// which keeps only what is the same on every machine.

import type { MetricSummary, ResultFile, ScenarioResult } from "./result.ts";

const SEEDED_AREAS: readonly ScenarioResult["area"][] = ["corpus", "crdt"];

/**
 * True for a metric that is the same on every machine: a size or a count of a corpus or crdt
 * scenario, built from fixed seeds, and the blocks any scenario loaded (`input_blocks`).
 */
export function isDeterministic(
  scenario: ScenarioResult,
  metric: MetricSummary,
): boolean {
  if (metric.metric === "input_blocks") return true;
  const sized = metric.unit === "count" || metric.unit === "bytes";
  return sized && SEEDED_AREAS.includes(scenario.area);
}

/** The metrics of a scenario that measured; none otherwise. */
function metricsOf(scenario: ScenarioResult | undefined): MetricSummary[] {
  return scenario?.outcome === "measured" ? scenario.metrics : [];
}

/**
 * Every metric both files hold for one measured scenario, in the baseline's order, with its p50 in
 * each. A deterministic metric regressed when it moved more than `deterministicPercent` either way;
 * any other when the candidate's p50 interval lies wholly above baseline × (1 + `timingPercent`).
 */
export function compareRuns(
  baseline: ResultFile,
  candidate: ResultFile,
  tolerance: { deterministicPercent: number; timingPercent: number },
): {
  metric: string;
  scenario: string;
  baseline: number;
  candidate: number;
  regressed: boolean;
}[] {
  return baseline.scenarios.flatMap((was) => {
    const now = candidate.scenarios.find((s) => s.id === was.id);
    return metricsOf(was).flatMap((before) => {
      const after = metricsOf(now).find((m) => m.metric === before.metric);
      if (after === undefined) return [];
      const regressed = isDeterministic(was, before)
        ? Math.abs(after.p50 - before.p50) >
          (before.p50 * tolerance.deterministicPercent) / 100
        : after.intervals.p50[0] >
          before.p50 * (1 + tolerance.timingPercent / 100);
      return [
        {
          metric: before.metric,
          scenario: was.id,
          baseline: before.p50,
          candidate: after.p50,
          regressed,
        },
      ];
    });
  });
}

/** `result` with every metric that is not deterministic removed, and every scenario left with none. */
export function toBaseline(result: ResultFile): ResultFile {
  const scenarios = result.scenarios.flatMap((s): ScenarioResult[] => {
    if (s.outcome !== "measured") return [];
    const metrics = s.metrics.filter((m) => isDeterministic(s, m));
    return metrics.length === 0 ? [] : [{ ...s, metrics }];
  });
  return { ...result, scenarios };
}
