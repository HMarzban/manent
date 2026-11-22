// The result file a run writes: its shape, its writer, and its reader, which checks every field
// before trusting it.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BUDGET_STATS, VERDICTS, isRecord } from "./budgets.ts";
import type { Verdict } from "./budgets.ts";
import { MODES, THROTTLES } from "./env.ts";
import { AREAS, TIER_IDS } from "./tiers/tiers.ts";
import type { Area, TierId } from "./tiers/tiers.ts";

export const WORKLOADS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7"] as const;
export const UNITS = ["ms", "bytes", "count", "percent"] as const;

export type Unit = (typeof UNITS)[number];
export type Workload = (typeof WORKLOADS)[number];
export type BudgetStat = (typeof BUDGET_STATS)[number];

export interface RunEnvironment {
  tier: TierId;
  throttle: 1 | 4 | 6;
  mode: "quick" | "standard" | "full";
  prove: boolean;
  bun: string;
  platform: string;
  arch: string;
  /** What the process sees: os.availableParallelism() and os.totalmem(). */
  cpus: number;
  memoryBytes: number;
  /** The container's limits; null on host. */
  limits: { cpus: number | null; memoryBytes: number | null };
  chromium: string | null;
  commit: string;
  dirty: boolean;
  corpusVersion: number;
  command: string;
}

export interface MetricSummary {
  metric: string;
  unit: Unit;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  intervals: {
    p50: [number, number];
    p95: [number, number];
    p99: [number, number];
  };
  /** The lowest and highest p50 of one process: the spread between processes. */
  processP50: [number, number];
  /** Samples discarded in all processes before these, as warm-up. */
  warmup: number;
  verdict: Verdict;
  verdictReason: "too_few_samples" | "constant" | null;
  judgedStat: BudgetStat | null;
  /** The kept samples, one array per process, in order. */
  raw: number[][];
}

/** The quiet check: the 1-minute load average, and the calibration's p90 ÷ p10. */
export interface Quiet {
  load: number;
  spread: number;
}

export type ScenarioResult = {
  id: string;
  area: Area;
  workload: Workload | null;
  processes: number;
} & (
  | {
      outcome: "measured";
      metrics: MetricSummary[];
      /** null when no check ran (quick mode, unit tests). */
      quiet: Quiet | null;
      elapsedMs: number;
    }
  | {
      outcome: "failed";
      /** 0 when the harness itself refused the scenario. */
      exitCode: number;
      /** The last 4,000 characters of stdout and stderr. */
      output: string;
    }
  | { outcome: "not_measured"; reason: string }
  | { outcome: "void"; reason: "busy_machine"; quiet: Quiet }
);

export interface ResultFile {
  formatVersion: 2;
  /** Milliseconds since the epoch. */
  startedAt: number;
  finishedAt: number;
  environment: RunEnvironment;
  scenarios: ScenarioResult[];
  /** Unfiltered runs: budget rows no discovered scenario declares. */
  unmatched: { scenario: string; metric: string }[];
  /** Proof runs: timing rows whose samples bypass the measuring path. */
  unproved: { scenario: string; metric: string }[];
}

const REASONS = ["too_few_samples", "constant"] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

/** Reads the fields of one JSON object, naming the field it refuses. */
class Fields {
  readonly #path: string;
  readonly #value: Record<string, unknown>;

  constructor(path: string, value: unknown) {
    if (!isRecord(value)) throw new Error(`${path} is not an object`);
    this.#path = path;
    this.#value = value;
  }

  #refuse(key: string, wanted: string): Error {
    return new Error(
      `${this.#path}.${key} must be ${wanted}, not ${JSON.stringify(this.#value[key])}`,
    );
  }

  value(key: string): unknown {
    return this.#value[key];
  }

  at(key: string): string {
    return `${this.#path}.${key}`;
  }

  number(key: string): number {
    const v = this.#value[key];
    if (!isFiniteNumber(v)) throw this.#refuse(key, "a finite number");
    return v;
  }

  /** `read(key)`, or null when the field is null. */
  nullable<T>(key: string, read: (key: string) => T): T | null {
    return this.#value[key] === null ? null : read(key);
  }

  string(key: string): string {
    const v = this.#value[key];
    if (typeof v !== "string") throw this.#refuse(key, "a string");
    return v;
  }

  boolean(key: string): boolean {
    const v = this.#value[key];
    if (typeof v !== "boolean") throw this.#refuse(key, "true or false");
    return v;
  }

  oneOf<T>(key: string, values: readonly T[]): T {
    const found = values.find((v) => v === this.#value[key]);
    if (found === undefined)
      throw this.#refuse(key, `one of ${values.join(", ")}`);
    return found;
  }

  list(key: string): unknown[] {
    const v = this.#value[key];
    if (!Array.isArray(v)) throw this.#refuse(key, "a list");
    return v;
  }

  pair(key: string): [number, number] {
    const [lo, hi, ...rest] = this.list(key);
    if (!isFiniteNumber(lo) || !isFiniteNumber(hi) || rest.length > 0)
      throw this.#refuse(key, "two finite numbers");
    return [lo, hi];
  }

  numberLists(key: string): number[][] {
    const lists = this.list(key);
    const read = lists.filter(isNumberList);
    if (read.length !== lists.length)
      throw this.#refuse(key, "lists of finite numbers");
    return read.map((list) => [...list]);
  }
}

function readEnvironment(f: Fields): RunEnvironment {
  const limits = new Fields(f.at("limits"), f.value("limits"));
  return {
    tier: f.oneOf("tier", TIER_IDS),
    throttle: f.oneOf("throttle", THROTTLES),
    mode: f.oneOf("mode", MODES),
    prove: f.boolean("prove"),
    bun: f.string("bun"),
    platform: f.string("platform"),
    arch: f.string("arch"),
    cpus: f.number("cpus"),
    memoryBytes: f.number("memoryBytes"),
    limits: {
      cpus: limits.nullable("cpus", (k) => limits.number(k)),
      memoryBytes: limits.nullable("memoryBytes", (k) => limits.number(k)),
    },
    chromium: f.nullable("chromium", (k) => f.string(k)),
    commit: f.string("commit"),
    dirty: f.boolean("dirty"),
    corpusVersion: f.number("corpusVersion"),
    command: f.string("command"),
  };
}

function readQuietOf(f: Fields, key: string): Quiet {
  const q = new Fields(f.at(key), f.value(key));
  return { load: q.number("load"), spread: q.number("spread") };
}

function readMetric(f: Fields): MetricSummary {
  const intervals = new Fields(f.at("intervals"), f.value("intervals"));
  return {
    metric: f.string("metric"),
    unit: f.oneOf("unit", UNITS),
    samples: f.number("samples"),
    p50: f.number("p50"),
    p95: f.number("p95"),
    p99: f.number("p99"),
    max: f.number("max"),
    intervals: {
      p50: intervals.pair("p50"),
      p95: intervals.pair("p95"),
      p99: intervals.pair("p99"),
    },
    processP50: f.pair("processP50"),
    warmup: f.number("warmup"),
    verdict: f.oneOf("verdict", VERDICTS),
    verdictReason: f.nullable("verdictReason", (k) => f.oneOf(k, REASONS)),
    judgedStat: f.nullable("judgedStat", (k) => f.oneOf(k, BUDGET_STATS)),
    raw: f.numberLists("raw"),
  };
}

function readScenario(f: Fields): ScenarioResult {
  const base = {
    id: f.string("id"),
    area: f.oneOf("area", AREAS),
    workload: f.nullable("workload", (k) => f.oneOf(k, WORKLOADS)),
    processes: f.number("processes"),
  };
  const outcome = f.oneOf("outcome", [
    "measured",
    "failed",
    "not_measured",
    "void",
  ] as const);
  switch (outcome) {
    case "measured":
      return {
        ...base,
        outcome,
        metrics: f
          .list("metrics")
          .map((m, i) => readMetric(new Fields(`${f.at("metrics")}[${i}]`, m))),
        quiet: f.nullable("quiet", (k) => readQuietOf(f, k)),
        elapsedMs: f.number("elapsedMs"),
      };
    case "failed":
      return {
        ...base,
        outcome,
        exitCode: f.number("exitCode"),
        output: f.string("output"),
      };
    case "not_measured":
      return { ...base, outcome, reason: f.string("reason") };
    case "void":
      return {
        ...base,
        outcome,
        reason: f.oneOf("reason", ["busy_machine"] as const),
        quiet: readQuietOf(f, "quiet"),
      };
  }
}

function readRows(
  f: Fields,
  key: string,
): { scenario: string; metric: string }[] {
  return f.list(key).map((row, i) => {
    const r = new Fields(`${f.at(key)}[${i}]`, row);
    return { scenario: r.string("scenario"), metric: r.string("metric") };
  });
}

/** Reads and checks the result file at `path`. Throws, naming the field, on anything it does not expect. */
export async function readResultFile(path: string): Promise<ResultFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await Bun.file(path).text());
  } catch (cause) {
    throw new Error(`${path} is not JSON`, { cause });
  }
  const f = new Fields(path, parsed);
  if (f.value("formatVersion") === 1)
    throw new Error(
      `${path}: formatVersion 1 is from before tiers; run it again`,
    );
  f.oneOf("formatVersion", [2] as const);
  return {
    formatVersion: 2,
    startedAt: f.number("startedAt"),
    finishedAt: f.number("finishedAt"),
    environment: readEnvironment(
      new Fields(f.at("environment"), f.value("environment")),
    ),
    scenarios: f
      .list("scenarios")
      .map((s, i) => readScenario(new Fields(`${f.at("scenarios")}[${i}]`, s))),
    unmatched: readRows(f, "unmatched"),
    unproved: readRows(f, "unproved"),
  };
}

/** `2026-11-17T10:00:00.000Z` becomes `2026-11-17T10-00-00Z`. */
function fileStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
}

/** Writes `result` under `outDir`, named for its start (`-2`, `-3`… after a name already taken), and returns the file's path. */
export async function writeResultFile(
  outDir: string,
  result: ResultFile,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const file = join(outDir, `${fileStamp(result.startedAt)}${suffix}.json`);
    if (await Bun.file(file).exists()) continue;
    await Bun.write(file, `${JSON.stringify(result, null, 2)}\n`);
    return file;
  }
}
