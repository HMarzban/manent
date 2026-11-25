// How the report reads a number out of the result files: the tier columns, the run a cell comes
// from, and every number's printed form.

import type {
  BudgetStat,
  MetricSummary,
  ResultFile,
  ScenarioResult,
} from "../result.ts";
import { TIERS } from "../tiers/tiers.ts";
import type { Area, TierId } from "../tiers/tiers.ts";

/** One result file given to the report, with the name it is published under. */
export interface Run {
  file: string;
  result: ResultFile;
}

export interface Column {
  tier: TierId;
  throttle: 1 | 4 | 6;
  label: string;
}

/** The tier columns, in the order every table prints them. */
export const COLUMNS: readonly Column[] = Object.freeze([
  { tier: "D-modest", throttle: 1, label: "D-modest" },
  { tier: "D-modest", throttle: 4, label: "D-modest 4x" },
  { tier: "D-modest", throttle: 6, label: "D-modest 6x" },
  { tier: "D-typical", throttle: 1, label: "D-typical" },
  { tier: "D-small", throttle: 1, label: "D-small" },
  { tier: "host", throttle: 1, label: "host" },
]);

export const NOT_MEASURED = "not measured";

/** The column label of a run: its tier, and its slowdown when it is not 1x. */
export function labelOf(environment: {
  tier: TierId;
  throttle: 1 | 4 | 6;
}): string {
  const { tier, throttle } = environment;
  return throttle === 1 ? tier : `${tier} ${throttle}x`;
}

/** The runs a report reads metrics from: every run but a proof run. */
function measuring(runs: readonly Run[]): Run[] {
  return runs.filter((r) => !r.result.environment.prove);
}

const isColumnOf = (run: Run, column: Column): boolean =>
  run.result.environment.tier === column.tier &&
  run.result.environment.throttle === column.throttle;

/** The columns a table of `areas` shows: those of a run holding a scenario of one of the areas, and host only beside D-modest. */
export function columnsOf(
  runs: readonly Run[],
  areas: readonly Area[],
): Column[] {
  const shown = COLUMNS.filter((c) =>
    measuring(runs).some(
      (r) =>
        isColumnOf(r, c) &&
        r.result.scenarios.some((s) => areas.includes(s.area)),
    ),
  );
  const modest = shown.some((c) => c.label === "D-modest");
  return shown.filter((c) => c.tier !== "host" || modest);
}

/** Two strings in code-unit order, for a sort that must not depend on the order on disk. */
export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Newest first; a tie is broken by the file's name. */
function newestFirst(a: Run, b: Run): number {
  return b.result.startedAt - a.result.startedAt || byText(a.file, b.file);
}

/** Scenario `id` in a column: from the newest run that measured it, else the newest that holds it; null when none does. */
export function scenarioIn(
  runs: readonly Run[],
  column: Column,
  id: string,
): ScenarioResult | null {
  const holding = measuring(runs)
    .filter((r) => isColumnOf(r, column))
    .toSorted(newestFirst)
    .map((r) => r.result.scenarios.find((s) => s.id === id) ?? null)
    .filter((s) => s !== null);
  return holding.find((s) => s.outcome === "measured") ?? holding[0] ?? null;
}

/** The area of scenario `id`, as any run recorded it; null when no run holds it. */
export function areaOf(runs: readonly Run[], id: string): Area | null {
  for (const run of runs) {
    const found = run.result.scenarios.find((s) => s.id === id);
    if (found !== undefined) return found.area;
  }
  return null;
}

/** A measured scenario's metric; null when the scenario did not measure or did not report it. */
export function metricOf(
  scenario: ScenarioResult | null,
  metric: string,
): MetricSummary | null {
  if (scenario === null || scenario.outcome !== "measured") return null;
  return scenario.metrics.find((m) => m.metric === metric) ?? null;
}

/**
 * Whether a column has a cell for scenario `id` in a table of every area: its tier runs the
 * scenario's area, and host only where D-modest does. A scenario no run holds has none.
 */
export function hasCell(
  runs: readonly Run[],
  column: Column,
  id: string,
): boolean {
  const area = areaOf(runs, id);
  if (area === null) return false;
  if (column.tier === "host" && !TIERS["D-modest"].areas.includes(area))
    return false;
  return TIERS[column.tier].areas.includes(area);
}

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A number with `decimals` places and a comma every three digits. */
function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  const sign = text.startsWith("-") ? "-" : "";
  const [whole = "", fraction] = text.slice(sign.length).split(".");
  return `${sign}${grouped(whole)}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** Milliseconds: one decimal under 100, none from 100. */
export function formatMs(ms: number): string {
  return fixed(ms, Math.abs(ms) < 100 ? 1 : 0);
}

/** A count: an integer with a comma every three digits; a ratio keeps one decimal. */
export function formatCount(count: number): string {
  return fixed(count, Number.isInteger(count) ? 0 : 1);
}

/** A count and its noun: `1 process`, `5 processes`. */
export const plural = (n: number, one: string, many: string): string =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

/** Bytes in MB of 1,000,000 bytes, with one decimal. */
export function formatBytes(bytes: number): string {
  return `${fixed(bytes / 1_000_000, 1)} MB`;
}

/** The value of one stat of a metric, in its unit; a percentile of a timing carries its interval. */
export function formatStat(m: MetricSummary, stat: BudgetStat): string {
  const value = m[stat];
  switch (m.unit) {
    case "ms": {
      if (stat === "max") return `${formatMs(value)} ms`;
      const [lo, hi] = m.intervals[stat];
      return `${formatMs(value)} ms (${formatMs(lo)}–${formatMs(hi)})`;
    }
    case "bytes":
      return formatBytes(value);
    case "count":
      return formatCount(value);
    case "percent":
      return `${fixed(value, 1)} %`;
    default:
      return m.unit satisfies never;
  }
}

/** One stat of one metric in a column: its value, or `not measured`. */
export function statCell(
  runs: readonly Run[],
  column: Column,
  row: { scenario: string; metric: string; stat: BudgetStat },
): string {
  const m = metricOf(scenarioIn(runs, column, row.scenario), row.metric);
  return m === null ? NOT_MEASURED : formatStat(m, row.stat);
}

function cellText(cell: string): string {
  return cell.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** A Markdown table, its columns padded as the repository's formatter lays them out. */
export function table(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [header, ...rows].map((cells) =>
    header.map((_, i) => cellText(cells[i] ?? "")),
  );
  const widths = header.map((_, i) =>
    Math.max(3, ...lines.map((cells) => cells[i]!.length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, i) => cell.padEnd(widths[i]!)).join(" | ")} |`;
  const [head, ...body] = lines;
  return [
    line(head!),
    line(widths.map((w) => "-".repeat(w))),
    ...body.map(line),
  ].join("\n");
}
