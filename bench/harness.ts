// Finds scenarios, runs each in fresh processes, and summarises their samples
// as nearest-rank percentiles with bootstrap intervals. Never a mean.

import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface Measurement {
  metric: string;
  unit: "ms" | "bytes" | "count";
  samples: number[];
}

export interface Scenario {
  id: string;
  workload: "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "W7" | null;
  /** Fresh processes the harness starts for it: 5 or more for timing, 1 for deterministic counts. */
  processes: number;
  /** Runs once in each process; samples are pooled across processes. */
  run(): Promise<Measurement[]>;
}

export interface Budget {
  scenario: string;
  metric: string;
  stat: "p50" | "p95" | "p99" | "max";
  budget: number;
  hardFail: number;
}

type Verdict = "no_budget" | "pass" | "over_budget" | "hard_fail";

export const RUN_TIER = "host";
const AREAS = ["corpus", "crdt", "client", "server"] as const;
const STATS = [
  ["p50", 50],
  ["p95", 95],
  ["p99", 99],
] as const;
const INTERVAL = { rounds: 1000, seed: 4747 } as const;
const UNITS: readonly string[] = ["ms", "bytes", "count"];
const WORKLOADS: readonly (string | null)[] = [
  "W1",
  "W2",
  "W3",
  "W4",
  "W5",
  "W6",
  "W7",
  null,
];

/** Nearest rank on a sorted copy: the smallest sample with at least p % of samples at or below it. */
export function percentile(samples: readonly number[], p: number): number {
  return nearestRank(Float64Array.from(samples).toSorted(), p);
}

function nearestRank(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) throw new RangeError("no samples");
  if (!(p >= 0 && p <= 100))
    throw new RangeError(`percentile out of range: ${p}`);
  const rank = Math.max(1, Math.ceil((p * sorted.length) / 100));
  return sorted[rank - 1]!;
}

/** A 32-bit seeded generator (mulberry32), so an interval is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 95 % percentile-bootstrap interval of the p-th percentile. */
export function bootstrapInterval(
  samples: readonly number[],
  p: number,
  options: { rounds: number; seed: number },
): [number, number] {
  if (samples.length === 0) throw new RangeError("no samples");
  if (!Number.isInteger(options.rounds) || options.rounds < 1)
    throw new RangeError(
      `rounds must be a positive integer: ${options.rounds}`,
    );
  const random = seededRandom(options.seed);
  const n = samples.length;
  const resample = new Float64Array(n);
  let estimates = new Float64Array(options.rounds);
  for (let round = 0; round < options.rounds; round++) {
    for (let i = 0; i < n; i++)
      resample[i] = samples[Math.floor(random() * n)]!;
    estimates[round] = nearestRank(resample.toSorted(), p);
  }
  estimates = estimates.toSorted();
  return [nearestRank(estimates, 2.5), nearestRank(estimates, 97.5)];
}

/** Within budget when at or under it; a hard fail when over `hardFail`. */
export function judge(value: number, budget: Budget | undefined): Verdict {
  if (budget === undefined) return "no_budget";
  if (value > budget.hardFail) return "hard_fail";
  if (value > budget.budget) return "over_budget";
  return "pass";
}

interface BudgetFile {
  formatVersion: number;
  tier: string;
  budgets: Budget[];
}

async function budgetsFor(root: string, tier: string): Promise<Budget[]> {
  const file = Bun.file(join(root, "budgets.json"));
  if (!(await file.exists())) return [];
  const parsed = (await file.json()) as BudgetFile;
  return parsed.tier === tier ? parsed.budgets : [];
}

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

function checkScenario(value: unknown, file: string): Scenario {
  const s = value as Partial<Scenario> | undefined;
  if (
    typeof s !== "object" ||
    s === null ||
    typeof s.id !== "string" ||
    !WORKLOADS.includes(s.workload ?? null) ||
    !Number.isInteger(s.processes) ||
    (s.processes ?? 0) < 1 ||
    typeof s.run !== "function"
  )
    throw new Error(`${file}: the default export is not a scenario`);
  return s as Scenario;
}

function checkMeasurements(value: unknown, file: string): Measurement[] {
  const ok =
    Array.isArray(value) &&
    value.every(
      (m: Partial<Measurement> | null) =>
        typeof m === "object" &&
        m !== null &&
        typeof m.metric === "string" &&
        typeof m.unit === "string" &&
        UNITS.includes(m.unit) &&
        Array.isArray(m.samples) &&
        m.samples.length > 0 &&
        m.samples.every((x) => typeof x === "number" && Number.isFinite(x)),
    );
  if (!ok)
    throw new Error(`${file}: the scenario's result is not measurements`);
  return value as Measurement[];
}

async function loadScenario(file: string): Promise<Scenario> {
  const module = (await import(file)) as { default?: unknown };
  return checkScenario(module.default, file);
}

/** Runs the scenario in `file` here and prints its measurements as the last line. Used by `run.ts --child`. */
export async function runChild(file: string): Promise<void> {
  const scenario = await loadScenario(file);
  const measurements = checkMeasurements(await scenario.run(), file);
  await Bun.write(Bun.stdout, `${JSON.stringify(measurements)}\n`);
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
  const lastLine = stdout.trimEnd().split("\n").at(-1) ?? "";
  if (code !== 0)
    throw new Error(`${file} exited with ${code}:\n${stderr}${stdout}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new Error(`${file}: the last line of output is not JSON:\n${stdout}`);
  }
  return checkMeasurements(parsed, file);
}

interface MetricSummary {
  metric: string;
  unit: Measurement["unit"];
  n: number;
  p50: number;
  p95: number;
  p99: number;
  intervals: {
    p50: [number, number];
    p95: [number, number];
    p99: [number, number];
  };
  verdict: Verdict;
}

function pool(file: string, runs: Measurement[][]): Map<string, Measurement> {
  const pooled = new Map<string, Measurement>();
  for (const run of runs)
    for (const m of run) {
      const seen = pooled.get(m.metric);
      if (seen === undefined) {
        pooled.set(m.metric, { ...m, samples: [...m.samples] });
      } else if (seen.unit !== m.unit) {
        throw new Error(`${file}: metric ${m.metric} has two units`);
      } else {
        for (const sample of m.samples) seen.samples.push(sample);
      }
    }
  return pooled;
}

function summarise(
  scenario: Scenario,
  m: Measurement,
  budgets: readonly Budget[],
): MetricSummary {
  const [p50, p95, p99] = STATS.map(([, p]) => percentile(m.samples, p)) as [
    number,
    number,
    number,
  ];
  const [i50, i95, i99] = STATS.map(([, p]) =>
    bootstrapInterval(m.samples, p, INTERVAL),
  ) as [[number, number], [number, number], [number, number]];
  const budget = budgets.find(
    (b) => b.scenario === scenario.id && b.metric === m.metric,
  );
  const value =
    budget === undefined
      ? 0
      : budget.stat === "max"
        ? m.samples.reduce((a, b) => Math.max(a, b))
        : { p50, p95, p99 }[budget.stat];
  return {
    metric: m.metric,
    unit: m.unit,
    n: m.samples.length,
    p50,
    p95,
    p99,
    intervals: { p50: i50, p95: i95, p99: i99 },
    verdict: judge(value, budget),
  };
}

/** `2026-11-17T10:00:00.000Z` becomes `2026-11-17T10-00-00Z`. */
function fileStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
}

export async function runSuite(options: {
  root: string;
  outDir: string;
  filter?: string;
  now?: () => Date;
}): Promise<{ file: string; scenarios: number; hardFails: number }> {
  const startedAt = (options.now ?? (() => new Date()))();
  const budgets = await budgetsFor(options.root, RUN_TIER);
  const results = [];
  let hardFails = 0;
  for (const rel of await findScenarios(options.root, options.filter)) {
    const file = resolve(options.root, rel);
    const scenario = await loadScenario(file);
    const runs: Measurement[][] = [];
    for (let i = 0; i < scenario.processes; i++)
      runs.push(await runProcess(file));
    const metrics = [...pool(rel, runs).values()].map((m) =>
      summarise(scenario, m, budgets),
    );
    hardFails += metrics.filter((m) => m.verdict === "hard_fail").length;
    results.push({
      id: scenario.id,
      workload: scenario.workload,
      processes: scenario.processes,
      metrics,
    });
  }
  await mkdir(options.outDir, { recursive: true });
  const file = join(options.outDir, `${fileStamp(startedAt)}.json`);
  const body = {
    formatVersion: 1,
    startedAt: startedAt.toISOString(),
    tier: RUN_TIER,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    scenarios: results,
  };
  await Bun.write(file, `${JSON.stringify(body, null, 2)}\n`);
  return { file, scenarios: results.length, hardFails };
}
