// The budgets file: its rows, its reader, and the verdict of a value against a row.

import { join } from "node:path";

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

export type Verdict = "no_budget" | "pass" | "over_budget" | "hard_fail";

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

/** The key of a scenario's metric in the set `assertBudgetsMatched` reads. */
export function metricKey(scenario: string, metric: string): string {
  return `${scenario}\n${metric}`;
}

/** Throws unless every applying row names a metric this run measured, so a renamed metric cannot drop its budget. */
export function assertBudgetsMatched(
  table: BudgetTable,
  measured: ReadonlySet<string>,
): void {
  table.budgets.forEach((b, i) => {
    if (!measured.has(metricKey(b.scenario, b.metric)))
      throw new Error(
        `${table.file}: budget row ${i + 1} (${b.scenario} ${b.metric}) matches no measured metric`,
      );
  });
}
