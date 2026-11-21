// The budgets file: its rows, its reader, and how a run's samples are judged against them,
// refused, or proved able to fail them.

import { join } from "node:path";
import { PERF_MARKS, percentile, summarise } from "@manent/perf";
import type { Summary } from "@manent/perf";
import { INTERACTION_METRICS, afterWarmup } from "./measure.ts";
import type { MetricSummary, Unit } from "./result.ts";
import { JUDGED_ON } from "./tiers/tiers.ts";
import type { Area, TierId } from "./tiers/tiers.ts";

export const BUDGET_STATS = ["p50", "p95", "p99", "max"] as const;

export interface Budget {
  scenario: string;
  metric: string;
  stat: (typeof BUDGET_STATS)[number];
  budget: number;
  hardFail: number;
}

export interface BudgetTable {
  file: string;
  /** The rows that apply to this run: every row when the file's tier is the run's, otherwise none. */
  budgets: Budget[];
}

export const VERDICTS = [
  "no_budget",
  "pass",
  "over_budget",
  "hard_fail",
  "inconclusive",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** An object that is not an array, whose fields can be read one by one. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBudgetRow(row: unknown, label: string): Budget {
  if (!isRecord(row)) throw new Error(`${label} needs a scenario and a metric`);
  const { scenario, metric, budget, hardFail } = row;
  if (typeof scenario !== "string" || typeof metric !== "string")
    throw new Error(`${label} needs a scenario and a metric`);
  const stat = BUDGET_STATS.find((s) => s === row.stat);
  if (stat === undefined)
    throw new Error(
      `${label} has stat ${JSON.stringify(row.stat)}; use p50, p95, p99 or max`,
    );
  if (
    typeof budget !== "number" ||
    typeof hardFail !== "number" ||
    !Number.isFinite(budget) ||
    !Number.isFinite(hardFail) ||
    budget > hardFail
  )
    throw new Error(
      `${label} needs a finite budget and hardFail, with budget at or under hardFail`,
    );
  return { scenario, metric, stat, budget, hardFail };
}

/** Reads `budgets.json` under `root`; no file means no budgets. Every row is checked, whatever its tier. */
export async function readBudgets(
  root: string,
  tier: string,
): Promise<BudgetTable> {
  const path = join(root, "budgets.json");
  const file = Bun.file(path);
  if (!(await file.exists())) return { file: path, budgets: [] };
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path} is not JSON`, { cause });
  }
  if (!isRecord(parsed) || parsed.formatVersion !== 1)
    throw new Error(`${path}: formatVersion must be 1`);
  if (typeof parsed.tier !== "string")
    throw new Error(`${path}: tier must be a string`);
  if (!Array.isArray(parsed.budgets))
    throw new Error(`${path}: budgets must be a list`);
  const budgets = parsed.budgets.map((row: unknown, i) =>
    parseBudgetRow(row, `${path}: budget row ${i + 1}`),
  );
  return { file: path, budgets: parsed.tier === tier ? budgets : [] };
}

/** Within budget when at or under it; a hard fail when over `hardFail`. */
export function judge(
  value: number,
  budget: Budget,
): Exclude<Verdict, "no_budget"> {
  if (value > budget.hardFail) return "hard_fail";
  if (value > budget.budget) return "over_budget";
  return "pass";
}

/** Decided only when the interval lies wholly at or under the budget, or wholly over the budget or the hard fail. */
export function judgeInterval(
  interval: [number, number],
  budget: Budget,
): "pass" | "over_budget" | "hard_fail" | "inconclusive" {
  const [lo, hi] = interval;
  if (hi <= budget.budget) return "pass";
  if (lo > budget.hardFail) return "hard_fail";
  if (lo > budget.budget && hi <= budget.hardFail) return "over_budget";
  return "inconclusive";
}

/** The fewest kept samples, across all processes, over which each percentile is judged. */
const MIN_SAMPLES = { p50: 10, p95: 40, p99: 200 } as const;
/** The fewest kept samples of an interaction metric in each process. */
const MIN_INTERACTIONS_A_PROCESS = 200;
/** Rows of the soaks, which apply only to a full run. */
const SOAKS: readonly string[] = ["server.soak", "soak-client-120"];

/** What decides whether a budget applies to a run. */
export interface JudgingRun {
  tier: TierId;
  throttle: 1 | 4 | 6;
  mode: "quick" | "standard" | "full";
  prove: boolean;
}

/** A row applies on the tier that judges its area, at 1x, outside quick mode and proof; a soak's only in full mode. */
export function isInForce(row: Budget, area: Area, run: JudgingRun): boolean {
  if (SOAKS.includes(row.scenario) && run.mode !== "full") return false;
  return (
    run.tier === JUDGED_ON[area] &&
    run.throttle === 1 &&
    run.mode !== "quick" &&
    !run.prove
  );
}

/** A percentile row on a timing that some process sampled more than once is judged on its interval. */
function isIntervalJudged(
  row: Budget,
  unit: Unit,
  raw: readonly (readonly number[])[],
): boolean {
  return (
    row.stat !== "max" &&
    unit === "ms" &&
    raw.some((process) => process.length > 1)
  );
}

/** One metric's kept samples, by process, and their summary. */
interface Judged {
  unit: Unit;
  summary: Summary;
  raw: readonly (readonly number[])[];
  /** A keystroke or frame metric, which needs MIN_INTERACTIONS_A_PROCESS samples in each process. */
  interaction: boolean;
}

interface RowVerdict {
  verdict: Exclude<Verdict, "no_budget">;
  verdictReason: MetricSummary["verdictReason"];
}

function judgeRow(row: Budget, m: Judged): RowVerdict {
  if (row.stat === "max" || !isIntervalJudged(row, m.unit, m.raw))
    return { verdict: judge(m.summary[row.stat], row), verdictReason: null };
  const pooled = m.raw.flat();
  if (pooled.every((sample) => sample === pooled[0]))
    return { verdict: "inconclusive", verdictReason: "constant" };
  const few =
    pooled.length < MIN_SAMPLES[row.stat] ||
    (m.interaction &&
      m.raw.some((process) => process.length < MIN_INTERACTIONS_A_PROCESS));
  if (few) return { verdict: "inconclusive", verdictReason: "too_few_samples" };
  return {
    verdict: judgeInterval(m.summary.intervals[row.stat], row),
    verdictReason: null,
  };
}

/** Worst first: a decided miss outranks an undecided row, which outranks a pass. */
const SEVERITY: Readonly<Record<RowVerdict["verdict"], number>> = Object.freeze(
  {
    hard_fail: 3,
    over_budget: 2,
    inconclusive: 1,
    pass: 0,
  },
);

/**
 * The verdict of one metric under the rows in force for it: the worst of theirs, the stat of the
 * row that gave it, and why it is undecided. No row: no_budget.
 */
function judgeMetric(
  rows: readonly Budget[],
  m: Judged,
): {
  verdict: Verdict;
  verdictReason: RowVerdict["verdictReason"];
  judgedStat: Budget["stat"] | null;
} {
  let worst: (RowVerdict & { judgedStat: Budget["stat"] }) | null = null;
  for (const row of rows) {
    const v = judgeRow(row, m);
    if (worst === null || SEVERITY[v.verdict] > SEVERITY[worst.verdict])
      worst = { ...v, judgedStat: row.stat };
  }
  return (
    worst ?? { verdict: "no_budget", verdictReason: null, judgedStat: null }
  );
}

/** One metric as a scenario's processes reported it: one list of samples per process that reported it. */
export interface Reported {
  metric: string;
  unit: Unit;
  raw: number[][];
}

/** The fewest processes a scenario with a row judged on an interval runs. */
const TIMING_PROCESSES = 5;

/**
 * Why a scenario that ran is refused, one line each: a budgeted metric it did not report, and,
 * outside quick mode, too few processes for a row judged on an interval. Empty when it stands.
 */
export function refusalsOf(
  scenario: { id: string; processes: number },
  reported: readonly Reported[],
  budgets: readonly Budget[],
  mode: JudgingRun["mode"],
): string[] {
  const { id, processes } = scenario;
  const rows = budgets.filter((b) => b.scenario === id);
  const missing = new Set(
    rows
      .map((b) => b.metric)
      .filter((metric) => !reported.some((m) => m.metric === metric)),
  );
  const lines = [...missing].map(
    (metric) => `${id} ${metric} was budgeted and not measured`,
  );
  const timed = rows.some((row) =>
    reported.some(
      (m) => m.metric === row.metric && isIntervalJudged(row, m.unit, m.raw),
    ),
  );
  if (mode !== "quick" && processes < TIMING_PROCESSES && timed)
    lines.push(
      `${id}: a timing scenario needs at least ${TIMING_PROCESSES} processes, not ${processes}`,
    );
  return lines;
}

/** The product marks behind time to first editable, whose recording path the marks' own tests prove. */
const EDITABLE_METRICS: readonly string[] = [
  "first_editable_cold",
  "first_editable_warm",
  "first_editable_offline",
];
/** A row whose hard fail is longer than this is not proved: a proof would take an hour. */
const PROOF_LIMIT_MS = 60_000;

/** A row a proof does not run for: a product mark's, or one whose hard fail is too long to prove. */
function isProofExempt(row: Budget): boolean {
  return (
    PERF_MARKS.includes(row.metric) ||
    EDITABLE_METRICS.includes(row.metric) ||
    row.hardFail > PROOF_LIMIT_MS
  );
}

/** The milliseconds a proof adds inside each sample of scenario `id`: twice its largest hard fail; null when it has no row to prove. */
export function proofWaitMs(
  id: string,
  budgets: readonly Budget[],
): number | null {
  const rows = budgets.filter((b) => b.scenario === id && !isProofExempt(b));
  if (rows.length === 0) return null;
  return Math.max(1, Math.ceil(2 * Math.max(...rows.map((b) => b.hardFail))));
}

/**
 * The rows of scenario `id`, once each, whose point value in a proof run is not a hard fail. Rows on
 * bytes, counts and percents are not proved here: their owners' unit tests make them fail.
 */
export function unprovedRows(
  id: string,
  metrics: readonly MetricSummary[],
  budgets: readonly Budget[],
): { scenario: string; metric: string }[] {
  const unproved = new Set(
    budgets
      .filter((b) => b.scenario === id && !isProofExempt(b))
      .filter((b) => {
        const m = metrics.find((x) => x.metric === b.metric);
        return m !== undefined && m.unit === "ms" && !(m[b.stat] > b.hardFail);
      })
      .map((b) => b.metric),
  );
  return [...unproved].map((metric) => ({ scenario: id, metric }));
}

/**
 * One metric's summary over the samples each process kept, judged by `rows` (those in force for
 * it): outside quick mode an interaction metric's warm-up is dropped first. Null when nothing is kept.
 */
export function summariseMetric(
  m: Reported,
  rows: readonly Budget[],
  mode: JudgingRun["mode"],
): MetricSummary | null {
  const interaction = INTERACTION_METRICS.includes(m.metric);
  const warm = m.raw.map((samples) =>
    interaction && mode !== "quick"
      ? afterWarmup(samples)
      : { kept: samples, dropped: 0 },
  );
  const raw = warm.map((w) => w.kept).filter((kept) => kept.length > 0);
  if (raw.length === 0) return null;
  const summary = summarise(raw.flat());
  const p50s = raw.map((kept) => percentile(kept, 50));
  return {
    metric: m.metric,
    unit: m.unit,
    ...summary,
    processP50: [Math.min(...p50s), Math.max(...p50s)],
    warmup: warm.reduce((sum, w) => sum + w.dropped, 0),
    ...judgeMetric(rows, { unit: m.unit, summary, raw, interaction }),
    raw,
  };
}
