// Finds scenarios, runs each in fresh processes, pools and judges their samples, and writes the
// result file. A scenario that cannot finish is recorded, and the run goes on.

import { availableParallelism } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  isInForce,
  isRecord,
  proofWaitMs,
  readBudgets,
  refusalsOf,
  summariseMetric,
  unprovedRows,
} from "./budgets.ts";
import type { Budget, JudgingRun, Reported } from "./budgets.ts";
import {
  NotMeasured,
  benchThrottle,
  benchTier,
  runEnvironment,
  scenarioEnv,
} from "./env.ts";
import { isQuiet, measurement, waitForQuiet } from "./measure.ts";
import { UNITS, WORKLOADS, writeResultFile } from "./result.ts";
import type { MetricSummary, Quiet, ScenarioResult } from "./result.ts";
import { AREAS } from "./tiers/tiers.ts";
import type { Area, ContainerLimits, TierId } from "./tiers/tiers.ts";

export { UNITS, WORKLOADS };

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

export interface SuiteRun {
  file: string;
  scenarios: number;
  hardFails: number;
  failed: number;
  notMeasured: number;
  void: number;
  inconclusive: number;
  /** Each `<scenario> <metric>`. */
  unproved: string[];
  unmatched: string[];
}

/** Until the corpus module names its version, the corpus every scenario generates is this one. */
const CORPUS_VERSION = 1;
const OUTPUT_CHARS = 4000;

interface Run extends JudgingRun {
  budgets: readonly Budget[];
  quiet: (() => Quiet) | null;
  waitMs: (ms: number) => Promise<void>;
  /** The cores this process sees, against which the load average is read. */
  cpus: number;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/** A scenario file, by its path under the suite's root. */
interface ScenarioFile {
  rel: string;
  file: string;
  area: Area;
}

/** A scenario file and what its default export declares. */
interface Found extends ScenarioFile {
  scenario: Scenario;
}

interface Row {
  scenario: string;
  metric: string;
}

function parseMeasurements(value: unknown, file: string): Measurement[] {
  if (!Array.isArray(value))
    throw new Error(`${file}: the scenario's result is not a list`);
  return value.map((item: unknown, i) => {
    const label = `${file}: measurement ${i + 1}`;
    if (!isRecord(item) || typeof item.metric !== "string")
      throw new Error(`${label} needs a metric name`);
    const unit = UNITS.find((u) => u === item.unit);
    if (unit === undefined)
      throw new Error(
        `${label} has unit ${JSON.stringify(item.unit)}; use ms, bytes, count or percent`,
      );
    const { samples } = item;
    if (!Array.isArray(samples) || !samples.every((s) => typeof s === "number"))
      throw new Error(`${label} needs a list of samples`);
    return measurement(item.metric, unit, samples);
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

/** Every scenario file of every area under `root`, by path. */
async function findScenarioFiles(root: string): Promise<ScenarioFile[]> {
  const glob = new Bun.Glob(`{${AREAS.join(",")}}/**/*.bench.ts`);
  const files: ScenarioFile[] = [];
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    const rel = path.split(sep).join("/");
    const area = AREAS.find((a) => rel.startsWith(`${a}/`));
    if (area === undefined) throw new Error(`${rel} lies in no area`);
    files.push({ rel, file: resolve(root, rel), area });
  }
  return files.toSorted((x, y) => (x.rel < y.rel ? -1 : 1));
}

/** Runs the scenario in `file` here and prints its measurements, or why it cannot run, as the last line. Used by `run.ts --child`. */
export async function runChild(file: string): Promise<void> {
  const scenario = await loadScenario(file);
  let result: Measurement[] | { notMeasured: string };
  try {
    result = await scenario.run();
  } catch (error) {
    if (!(error instanceof NotMeasured)) throw error;
    result = { notMeasured: error.message };
  }
  // A leading newline keeps the JSON on its own line after output that lacks one.
  await Bun.write(Bun.stdout, `\n${JSON.stringify(result)}\n`);
}

type ProcessResult =
  | { outcome: "measured"; measurements: Measurement[] }
  | { outcome: "not_measured"; reason: string }
  | { outcome: "failed"; exitCode: number; output: string };

/** The result a process printed on its last line, or why that line is not one. */
function readResultLine(found: Found, stdout: string): ProcessResult | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trimEnd().split("\n").at(-1) ?? "");
  } catch {
    // what went wrong is in the scenario's own output, which the caller keeps
    return `${found.rel}: the last line of output is not a result`;
  }
  if (isRecord(parsed) && typeof parsed.notMeasured === "string")
    return { outcome: "not_measured", reason: parsed.notMeasured };
  try {
    const measurements = parseMeasurements(parsed, found.rel);
    return { outcome: "measured", measurements };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error.message;
  }
}

async function runProcess(
  found: Found,
  env: Record<string, string>,
): Promise<ProcessResult> {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "run.ts"), "--child", found.file],
    { stdout: "pipe", stderr: "pipe", env },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const printed = `${stdout}${stderr}`;
  const failed = (output: string): ProcessResult => ({
    outcome: "failed",
    exitCode,
    output: output.slice(-OUTPUT_CHARS),
  });
  if (exitCode !== 0) return failed(printed);
  const read = readResultLine(found, stdout);
  return typeof read === "string" ? failed(`${printed}\n${read}`) : read;
}

/** Each metric's samples, one list per process that reported it, in process order; a string when a metric has two units. */
function pool(runs: readonly Measurement[][]): Reported[] | string {
  const pooled = new Map<string, Reported>();
  for (const m of runs.flat()) {
    const seen = pooled.get(m.metric) ?? {
      metric: m.metric,
      unit: m.unit,
      raw: [],
    };
    if (seen.unit !== m.unit) return `metric ${m.metric} has two units`;
    seen.raw.push(m.samples);
    pooled.set(m.metric, seen);
  }
  return [...pooled.values()];
}

/** What a result says of its scenario whatever its outcome; quick mode runs one process. */
function scenarioBase(found: Found, run: Run) {
  const { id, workload } = found.scenario;
  const processes = run.mode === "quick" ? 1 : found.scenario.processes;
  return { id, area: found.area, workload, processes };
}

async function runScenario(found: Found, run: Run): Promise<ScenarioResult> {
  const base = scenarioBase(found, run);
  const refuse = (output: string): ScenarioResult => ({
    ...base,
    outcome: "failed",
    exitCode: 0,
    output,
  });
  const quiet =
    run.quiet === null || run.mode === "quick"
      ? null
      : await waitForQuiet({ ...run, quiet: run.quiet });
  if (quiet !== null && !isQuiet(quiet, run.cpus))
    return { ...base, outcome: "void", reason: "busy_machine", quiet };
  const startedAt = run.now();
  const prove = run.prove ? proofWaitMs(base.id, run.budgets) : null;
  const env = scenarioEnv(run, prove);
  const runs: Measurement[][] = [];
  for (let i = 0; i < base.processes; i++) {
    const ran = await runProcess(found, env);
    if (ran.outcome !== "measured") return { ...base, ...ran };
    runs.push(ran.measurements);
  }
  const reported = pool(runs);
  if (typeof reported === "string") return refuse(`${found.rel}: ${reported}`);
  const refused = refusalsOf(found.scenario, reported, run.budgets, run.mode);
  if (refused.length > 0) return refuse(refused.join("\n"));
  const rows = run.budgets.filter(
    (b) => b.scenario === base.id && isInForce(b, found.area, run),
  );
  const metrics = reported.flatMap((m) => {
    const own = rows.filter((b) => b.metric === m.metric);
    return summariseMetric(m, own, run.mode) ?? [];
  });
  const elapsedMs = run.now() - startedAt;
  return { ...base, outcome: "measured", metrics, quiet, elapsedMs };
}

/** The budget rows, once each, whose scenario no file under the root declares. */
async function unmatchedRows(
  files: readonly ScenarioFile[],
  budgets: readonly Budget[],
): Promise<Row[]> {
  const ids = new Set<string>();
  for (const f of files) ids.add((await loadScenario(f.file)).id);
  const keys = new Set(
    budgets
      .filter((b) => !ids.has(b.scenario))
      .map((b) => `${b.scenario} ${b.metric}`),
  );
  return budgets
    .filter((b) => keys.delete(`${b.scenario} ${b.metric}`))
    .map(({ scenario, metric }) => ({ scenario, metric }));
}

function suiteRun(
  file: string,
  scenarios: readonly ScenarioResult[],
  rows: { unproved: readonly Row[]; unmatched: readonly Row[] },
): SuiteRun {
  const outcomes = (outcome: ScenarioResult["outcome"]): number =>
    scenarios.filter((s) => s.outcome === outcome).length;
  const metrics = scenarios.flatMap((s) =>
    s.outcome === "measured" ? s.metrics : [],
  );
  const verdicts = (verdict: MetricSummary["verdict"]): number =>
    metrics.filter((m) => m.verdict === verdict).length;
  const named = (list: readonly Row[]): string[] =>
    list.map((r) => `${r.scenario} ${r.metric}`);
  return {
    file,
    scenarios: scenarios.length,
    hardFails: verdicts("hard_fail"),
    failed: outcomes("failed"),
    notMeasured: outcomes("not_measured"),
    void: outcomes("void"),
    inconclusive: verdicts("inconclusive"),
    unproved: named(rows.unproved),
    unmatched: named(rows.unmatched),
  };
}

/**
 * Runs every scenario under `root` of `areas` (default: all) whose path contains `filter`, and
 * writes the result file. `now` is in milliseconds since the epoch; `tier` and `throttle` default
 * to the environment's. A proof runs only scenarios with a row to prove; `cannotRun` records every
 * chosen scenario as not measured, for that reason, and runs none; `container` is what a tier's
 * container records in place of this process's limits and command line.
 */
export async function runSuite(options: {
  root: string;
  outDir: string;
  filter?: string;
  now?: () => number;
  tier?: TierId;
  throttle?: 1 | 4 | 6;
  mode?: "quick" | "standard" | "full";
  prove?: boolean;
  areas?: readonly Area[];
  quiet?: () => Quiet;
  waitMs?: (ms: number) => Promise<void>;
  cannotRun?: string;
  container?: { limits: ContainerLimits; command: string };
}): Promise<SuiteRun> {
  const { filter, cannotRun, prove = false, now = Date.now } = options;
  const startedAt = now();
  const judging: JudgingRun = {
    tier: options.tier ?? benchTier(),
    throttle: options.throttle ?? benchThrottle(),
    mode: prove ? "quick" : (options.mode ?? "standard"),
    prove,
  };
  const { budgets } = await readBudgets(options.root, "D-modest");
  const run: Run = {
    ...judging,
    budgets,
    quiet: options.quiet ?? null,
    waitMs: options.waitMs ?? ((ms) => Bun.sleep(ms)),
    cpus: availableParallelism(),
    now,
  };
  const files = await findScenarioFiles(options.root);
  const areas = options.areas ?? AREAS;
  const scenarios: ScenarioResult[] = [];
  const unproved: Row[] = [];
  for (const f of files) {
    if (!areas.includes(f.area)) continue;
    if (filter !== undefined && !f.rel.includes(filter)) continue;
    const found = { ...f, scenario: await loadScenario(f.file) };
    const { id } = found.scenario;
    if (cannotRun !== undefined) {
      const base = scenarioBase(found, run);
      scenarios.push({ ...base, outcome: "not_measured", reason: cannotRun });
    } else if (!prove || proofWaitMs(id, budgets) !== null) {
      const result = await runScenario(found, run);
      scenarios.push(result);
      if (prove && result.outcome === "measured")
        unproved.push(...unprovedRows(id, result.metrics, budgets));
    }
  }
  const unmatched =
    filter === undefined ? await unmatchedRows(files, budgets) : [];
  const file = await writeResultFile(options.outDir, {
    formatVersion: 2,
    startedAt,
    finishedAt: now(),
    environment: runEnvironment(
      { ...judging, corpusVersion: CORPUS_VERSION },
      options.container ?? null,
    ),
    scenarios,
    unmatched,
    unproved,
  });
  return suiteRun(file, scenarios, { unproved, unmatched });
}
