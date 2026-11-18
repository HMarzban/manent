// Finds scenarios, runs each in fresh processes, pools their samples and
// writes the result file.

import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  assertBudgetsMatched,
  isRecord,
  judge,
  metricKey,
  readBudgets,
} from "./budgets.ts";
import type { Budget, Verdict } from "./budgets.ts";
import { bootstrapInterval, percentile } from "./stats.ts";

export const WORKLOADS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7"] as const;
export const UNITS = ["ms", "bytes", "count"] as const;

export interface Measurement {
  metric: string;
  unit: (typeof UNITS)[number];
  samples: number[];
}

export interface Scenario {
  id: string;
  /** `null` when the scenario belongs to no workload. */
  workload: (typeof WORKLOADS)[number] | null;
  /** Fresh processes the harness starts for it: 5 or more for timing, 1 for deterministic counts. */
  processes: number;
  /** Runs once in each process; samples are pooled across processes. */
  run(): Promise<Measurement[]>;
}

export interface MetricSummary {
  metric: string;
  unit: Measurement["unit"];
  /** How many samples were pooled. */
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  /** The largest sample. */
  max: number;
  intervals: {
    p50: [number, number];
    p95: [number, number];
    p99: [number, number];
  };
  verdict: Verdict;
}

interface ScenarioResult {
  id: string;
  workload: Scenario["workload"];
  processes: number;
  metrics: MetricSummary[];
}

export interface ResultFile {
  formatVersion: 1;
  /** Milliseconds since the epoch. */
  startedAt: number;
  tier: string;
  bun: string;
  platform: string;
  arch: string;
  scenarios: ScenarioResult[];
}

export interface SuiteRun {
  file: string;
  scenarios: number;
  hardFails: number;
}

export const RUN_TIER = "host";
const AREAS = ["corpus", "crdt", "client", "server"] as const;
const INTERVAL = { rounds: 1000, seed: 4747 } as const;

async function findScenarios(
  root: string,
  filter: string | undefined,
): Promise<string[]> {
  const glob = new Bun.Glob(`{${AREAS.join(",")}}/**/*.bench.ts`);
  const found: string[] = [];
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    const rel = path.split(sep).join("/");
    if (filter === undefined || rel.includes(filter)) found.push(rel);
  }
  return found.toSorted();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMeasurements(value: unknown, file: string): Measurement[] {
  if (!Array.isArray(value))
    throw new Error(`${file}: the scenario's result is not a list`);
  return value.map((item: unknown, i) => {
    const label = `${file}: measurement ${i + 1}`;
    if (!isRecord(item)) throw new Error(`${label} is not an object`);
    const { metric, samples } = item;
    if (typeof metric !== "string")
      throw new Error(`${label} needs a metric name`);
    const unit = UNITS.find((u) => u === item.unit);
    if (unit === undefined)
      throw new Error(
        `${label} has unit ${JSON.stringify(item.unit)}; use ms, bytes or count`,
      );
    if (
      !Array.isArray(samples) ||
      samples.length === 0 ||
      !samples.every(isFiniteNumber)
    )
      throw new Error(`${label} needs at least one sample, each finite`);
    return { metric, unit, samples };
  });
}

function parseScenario(value: unknown, file: string): Scenario {
  if (!isRecord(value))
    throw new Error(`${file}: the default export is not a scenario`);
  const { id, processes, run } = value;
  if (typeof id !== "string") throw new Error(`${file}: id must be a string`);
  const workload =
    value.workload === null
      ? null
      : WORKLOADS.find((w) => w === value.workload);
  if (workload === undefined)
    throw new Error(
      `${file}: workload is ${JSON.stringify(value.workload)}; use W1 to W7, or null`,
    );
  if (
    typeof processes !== "number" ||
    !Number.isInteger(processes) ||
    processes < 1
  )
    throw new Error(
      `${file}: processes must be a positive integer, not ${processes}`,
    );
  if (typeof run !== "function")
    throw new Error(`${file}: run must be a function`);
  return {
    id,
    workload,
    processes,
    run: async () => parseMeasurements(await run.call(value), file),
  };
}

async function loadScenario(file: string): Promise<Scenario> {
  const { default: exported }: { default?: unknown } = await import(file);
  return parseScenario(exported, file);
}

/** Runs the scenario in `file` here and prints its measurements as the last line. Used by `run.ts --child`. */
export async function runChild(file: string): Promise<void> {
  const scenario = await loadScenario(file);
  const measurements = await scenario.run();
  // A leading newline keeps the JSON on its own line after output that lacks one.
  await Bun.write(Bun.stdout, `\n${JSON.stringify(measurements)}\n`);
}

async function runProcess(file: string): Promise<Measurement[]> {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "run.ts"), "--child", file],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`${file} exited with ${code}:\n${stderr}${stdout}`);
  const lastLine = stdout.trimEnd().split("\n").at(-1) ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine);
  } catch (cause) {
    throw new Error(
      `${file}: the last line of output is not JSON:\n${stdout}`,
      {
        cause,
      },
    );
  }
  return parseMeasurements(parsed, file);
}

/** Joins each metric's samples across processes, in process order. */
function pool(file: string, runs: Measurement[][]): Measurement[] {
  const pooled = new Map<string, Measurement>();
  for (const run of runs)
    for (const m of run) {
      const seen = pooled.get(m.metric);
      if (seen === undefined) {
        pooled.set(m.metric, { ...m, samples: [...m.samples] });
        continue;
      }
      if (seen.unit !== m.unit)
        throw new Error(`${file}: metric ${m.metric} has two units`);
      for (const sample of m.samples) seen.samples.push(sample);
    }
  return [...pooled.values()];
}

function summarise(
  scenario: Scenario,
  m: Measurement,
  budgets: readonly Budget[],
): MetricSummary {
  const { samples } = m;
  const stats = {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.reduce((a, b) => Math.max(a, b)),
  };
  const budget = budgets.find(
    (b) => b.scenario === scenario.id && b.metric === m.metric,
  );
  return {
    metric: m.metric,
    unit: m.unit,
    samples: samples.length,
    ...stats,
    intervals: {
      p50: bootstrapInterval(samples, 50, INTERVAL),
      p95: bootstrapInterval(samples, 95, INTERVAL),
      p99: bootstrapInterval(samples, 99, INTERVAL),
    },
    verdict: budget ? judge(stats[budget.stat], budget) : "no_budget",
  };
}

async function runScenario(
  root: string,
  rel: string,
  budgets: readonly Budget[],
): Promise<ScenarioResult> {
  const file = resolve(root, rel);
  const scenario = await loadScenario(file);
  const runs: Measurement[][] = [];
  for (let i = 0; i < scenario.processes; i++)
    runs.push(await runProcess(file));
  return {
    id: scenario.id,
    workload: scenario.workload,
    processes: scenario.processes,
    metrics: pool(rel, runs).map((m) => summarise(scenario, m, budgets)),
  };
}

/** `2026-11-17T10:00:00.000Z` becomes `2026-11-17T10-00-00Z`. */
function fileStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
}

/** Writes `result` under `outDir`, named for its start, and returns the file's path. */
async function writeResult(
  outDir: string,
  result: ResultFile,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${fileStamp(result.startedAt)}.json`);
  await Bun.write(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}

/** Runs every scenario under `root` whose path contains `filter`; `now` is in milliseconds since the epoch. */
export async function runSuite(options: {
  root: string;
  outDir: string;
  filter?: string;
  now?: () => number;
}): Promise<SuiteRun> {
  const startedAt = (options.now ?? Date.now)();
  const table = await readBudgets(options.root, RUN_TIER);
  const scenarios: ScenarioResult[] = [];
  for (const rel of await findScenarios(options.root, options.filter))
    scenarios.push(await runScenario(options.root, rel, table.budgets));
  if (options.filter === undefined)
    assertBudgetsMatched(
      table,
      new Set(
        scenarios.flatMap((s) =>
          s.metrics.map((m) => metricKey(s.id, m.metric)),
        ),
      ),
    );
  const file = await writeResult(options.outDir, {
    formatVersion: 1,
    startedAt,
    tier: RUN_TIER,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    scenarios,
  });
  const hardFails = scenarios
    .flatMap((s) => s.metrics)
    .filter((m) => m.verdict === "hard_fail").length;
  return { file, scenarios: scenarios.length, hardFails };
}
