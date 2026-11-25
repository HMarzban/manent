// What the suite does not measure because it is not built here, and the report's list of
// everything that was not measured, with why.

import { PERF_MARKS } from "@manent/perf";
import type { Budget } from "../budgets.ts";
import type { ScenarioResult, Unit } from "../result.ts";
import { lastLine } from "../tiers/orchestrate.ts";
import {
  BUDGET_MAP,
  judgedScenario,
  judgingColumn,
  rowVerdict,
} from "./budget-map.ts";
import type { Held } from "./budget-map.ts";
import { formatCount, labelOf, metricOf } from "./format.ts";
import type { Run } from "./format.ts";
import type { SmokeResult } from "./smoke.ts";
import { NO_SMOKE, REASONS, notMeasuredLine } from "./text.ts";

export interface NotBuilt {
  what: string;
  reason: string;
}

export const NOT_BUILT: readonly NotBuilt[] = Object.freeze([
  {
    what: "The daily show and the news hour: their rundowns, 5,000 versions a day, 25 writers and 200 readers per rundown",
    reason: "they need the rundown, which a later stage builds",
  },
  {
    what: "Prompter-feed staleness",
    reason: "the prompter feed is built in a later stage",
  },
  {
    what: "The log of 900,000 updates behind a W1 typing run",
    reason:
      "typing reads only the live document, and the log lies outside it; the log's growth is measured by `server.persistence`",
  },
  {
    what: "The other writers and readers of W6 and W7, and W7's 200 versions",
    reason: "each is measured with one typist and no versions",
  },
  {
    what: "The 24-hour soak",
    reason: "it is run by hand, not in a published run",
  },
  {
    what: "Storage pressure in a browser; desktop sleep and wake, update and rollback, timed; power loss; Firefox and WebKit timings; real modest hardware",
    reason: "a later stage measures them",
  },
  {
    what: "A central-authority baseline on the same editing traces, and other CRDT libraries on the same workloads",
    reason: "a later stage measures them",
  },
]);

const EDITABLE_METRICS: readonly string[] = [
  "first_editable_cold",
  "first_editable_warm",
  "first_editable_offline",
];
/** A row whose hard fail is longer than this is not proved. */
const PROOF_LIMIT_MS = 60_000;

const runLabel = (run: Run): string =>
  `${labelOf(run.result.environment)}${run.result.environment.prove ? ", proof" : ""}`;

/** Why a scenario of a run did not measure; null when it did. */
function outcomeReason(s: ScenarioResult): string | null {
  switch (s.outcome) {
    case "measured":
      return null;
    case "not_measured":
      return s.reason;
    case "void":
      return REASONS.busy(
        formatCount(s.quiet.load),
        formatCount(s.quiet.spread),
      );
    case "failed":
      return REASONS.failed(lastLine(s.output));
  }
}

/** Why a proof does not run for a row; null when it does. `unit` is null when the proof did not measure the metric. */
function proofExemption(b: Budget, unit: Unit | null): string | null {
  if (PERF_MARKS.includes(b.metric) || EDITABLE_METRICS.includes(b.metric))
    return REASONS.proofMarks;
  if (b.hardFail > PROOF_LIMIT_MS) return REASONS.proofLong;
  return unit !== null && unit !== "ms" ? REASONS.proofUnits : null;
}

function proofLines(proof: Run): string[] {
  return BUDGET_MAP.flatMap((row) =>
    row.held.type === "scenarios" ? row.held.budgets : [],
  ).flatMap((b) => {
    const s = proof.result.scenarios.find((x) => x.id === b.scenario);
    if (s === undefined) return [];
    const reason = proofExemption(b, metricOf(s, b.metric)?.unit ?? null);
    return reason === null
      ? []
      : [notMeasuredLine(`${b.scenario} ${b.metric}`, reason)];
  });
}

/** Which of `budgets` no run holds, and which the run that judges them did not judge. */
function scenarioReasons(
  runs: readonly Run[],
  budgets: readonly Budget[],
): string[] {
  const unheld = new Set<string>();
  const unjudged = new Map<string, Set<string>>();
  for (const b of budgets) {
    const column = judgingColumn(runs, b.scenario);
    const s = judgedScenario(runs, b.scenario);
    const m = metricOf(s, b.metric);
    if (column === null) unheld.add(b.scenario);
    // a scenario that did not measure has its own line, with its reason
    else if (s !== null && s.outcome !== "measured") continue;
    else if (m === null || m.verdict === "no_budget")
      unjudged.set(
        column.label,
        (unjudged.get(column.label) ?? new Set()).add(
          `${b.scenario} ${b.metric}`,
        ),
      );
  }
  return [
    ...(unheld.size > 0 ? [REASONS.noRun([...unheld])] : []),
    ...[...unjudged].map(([tier, items]) =>
      REASONS.notJudged(tier, [...items]),
    ),
  ];
}

/** Why each part of a not-measured budget row is not measured, where no other line of the section says it. */
function rowReasons(
  runs: readonly Run[],
  smoke: readonly SmokeResult[],
  held: Held,
): string[] {
  switch (held.type) {
    case "scenarios":
      return scenarioReasons(runs, held.budgets);
    case "smoke":
      return smoke.length === 0
        ? [NO_SMOKE]
        : smoke
            .filter((s) => s.idleMemory === null)
            .map((s) => REASONS.noIdleReading(s.platform));
    case "not_measured":
      return [held.reason];
    case "test":
    case "not_built":
      return [];
  }
}

/** One line for everything that was not measured, and why. */
export function notMeasuredSection(
  runs: readonly Run[],
  smoke: readonly SmokeResult[],
): string {
  const outcomes = runs.flatMap((run) =>
    run.result.scenarios.flatMap((s) => {
      const reason = outcomeReason(s);
      return reason === null
        ? []
        : [notMeasuredLine(`${s.id} on ${runLabel(run)}`, reason)];
    }),
  );
  const rowsOf = (key: "unmatched" | "unproved", reason: string): string[] =>
    runs.flatMap((run) =>
      run.result[key].map((r) =>
        notMeasuredLine(`${r.scenario} ${r.metric}`, reason),
      ),
    );
  const budgets = BUDGET_MAP.flatMap((row) => {
    if (rowVerdict(runs, smoke, row).kind !== "not_measured") return [];
    const reasons = [...new Set(rowReasons(runs, smoke, row.held))];
    return reasons.length === 0
      ? []
      : [notMeasuredLine(`${row.area} — ${row.metric}`, reasons.join("; "))];
  });
  const lines = [
    ...outcomes,
    ...rowsOf("unmatched", REASONS.unmatched),
    ...rowsOf("unproved", REASONS.unproved),
    ...runs.filter((r) => r.result.environment.prove).flatMap(proofLines),
    ...budgets,
    ...NOT_BUILT.map((item) => notMeasuredLine(item.what, item.reason)),
  ];
  return [...new Set(lines)].join("\n");
}
