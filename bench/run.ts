// `bun run bench` runs the suite on every tier, on one (`--tier`, `--throttle`), or one area;
// `compare`, `baseline`, `fetch-traces`, `report` and `publish` manage results and the report.
// `--inside` runs a tier inside its container; `--child <file>` runs one scenario.

import { readFileSync } from "node:fs";
import { compareRuns, toBaseline } from "./compare.ts";
import { fetchTraces } from "./corpus/traces.ts";
import { MODES, THROTTLES, benchTier, commandLine } from "./env.ts";
import { runChild, runSuite } from "./harness.ts";
import { readQuiet } from "./measure.ts";
import { reportOf, resultFilesIn } from "./report/generate.ts";
import { publishRuns } from "./report/publish.ts";
import { readResultFile } from "./result.ts";
import type { ResultFile, ScenarioResult } from "./result.ts";
import { lastLine, runTiers } from "./tiers/orchestrate.ts";
import type { Docker, TierRun } from "./tiers/orchestrate.ts";
import {
  AREAS,
  JUDGED_ON,
  TIERS,
  TIER_IDS,
  checkTierLimits,
  readContainerLimits,
} from "./tiers/tiers.ts";
import type { TierId } from "./tiers/tiers.ts";

export interface BenchArgs {
  /** null: every tier, in order. */
  tier: TierId | null;
  throttle: 1 | 4 | 6;
  filter: string | null;
  mode: (typeof MODES)[number];
  prove: boolean;
  /** null: run the suite. */
  subcommand: { name: string; args: string[] } | null;
}

const ROOT = "bench";
const RESULTS = "bench/results";
const PUBLISHED = "docs/benchmark";
const TOLERANCE = { deterministicPercent: 2, timingPercent: 25 };
const VALUE_OPTIONS = [
  "--tier",
  "--throttle",
  "--filter",
  "--child",
  "--command",
];
const FLAGS = ["--quick", "--full", "--prove", "--inside"];

/** The runs of `bun run bench`: the processor slowdown is measured on typing. */
const EVERY_TIER: readonly TierRun[] = [
  { tier: "D-small", throttle: 1, filter: null },
  { tier: "D-modest", throttle: 1, filter: null },
  { tier: "D-modest", throttle: 4, filter: "client/typing/" },
  { tier: "D-modest", throttle: 6, filter: "client/typing/" },
  { tier: "D-typical", throttle: 1, filter: null },
  { tier: "host", throttle: 1, filter: null },
];

function tierOf(value: string): TierId {
  const tier = TIER_IDS.find((id) => id === value);
  if (tier === undefined)
    throw new RangeError(
      `--tier must be one of ${TIER_IDS.join(", ")}, not ${value}`,
    );
  return tier;
}

function throttleOf(value: string | undefined, tier: TierId | null): 1 | 4 | 6 {
  if (value === undefined) return 1;
  if (tier === null) throw new RangeError("--throttle needs --tier");
  const throttle = THROTTLES.find((t) => String(t) === value);
  const { throttles } = TIERS[tier];
  if (throttle === undefined || !throttles.includes(throttle))
    throw new RangeError(
      `tier ${tier} runs at ${throttles.map((t) => `${t}x`).join(", ")} only, not ${value}x`,
    );
  return throttle;
}

function modeOf(flags: ReadonlySet<string>): BenchArgs["mode"] {
  if (flags.has("--quick")) return "quick";
  return flags.has("--full") ? "full" : "standard";
}

function subcommandOf(
  values: ReadonlyMap<string, string>,
  flags: ReadonlySet<string>,
  words: readonly string[],
): BenchArgs["subcommand"] {
  const child = values.get("--child");
  if (child !== undefined) return { name: "child", args: [child] };
  const command = values.get("--command");
  if (flags.has("--inside"))
    return { name: "inside", args: command === undefined ? [] : [command] };
  const [word, ...rest] = words;
  if (word === undefined || AREAS.some((a) => a === word)) return null;
  return { name: word, args: rest };
}

/** The command line of `bun run bench`. Throws on an option it does not know or a value it cannot use. */
export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (VALUE_OPTIONS.includes(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      values.set(arg, value);
    } else if (FLAGS.includes(arg)) flags.add(arg);
    else if (arg.startsWith("--"))
      throw new Error(`${arg} is not an option of bun run bench`);
    else words.push(arg);
  }
  const area = AREAS.find((a) => a === words[0]) ?? null;
  if (area !== null && values.has("--filter"))
    throw new Error("an area and --filter cannot be combined");
  const named = values.get("--tier");
  let tier: TierId | null = area === null ? null : JUDGED_ON[area];
  if (named !== undefined) tier = tierOf(named);
  return {
    tier,
    throttle: throttleOf(values.get("--throttle"), tier),
    filter: area === null ? (values.get("--filter") ?? null) : `${area}/`,
    mode: modeOf(flags),
    prove: flags.has("--prove"),
    subcommand: subcommandOf(values, flags, words),
  };
}

/** The `docker` command; `missing` when it is not installed. */
const docker: Docker = async (args) => {
  if (Bun.which("docker") === null) return { missing: true };
  const child = Bun.spawn(["docker", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
};

/** A file's text, or null when it cannot be read: a cgroup v1 host has no such file. */
function readSystemFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    // a missing limit file reads as no limit, which checkTierLimits refuses
    return null;
  }
}

/** A tier's container runs its tier, or records every scenario as not measured when its limits are not the tier's. */
async function runInside(
  args: BenchArgs,
  command: string | null,
): Promise<string> {
  const tier = TIERS[benchTier()];
  const limits = readContainerLimits(readSystemFile);
  const check = checkTierLimits(tier, limits);
  const run = await runSuite({
    root: ROOT,
    outDir: RESULTS,
    tier: tier.id,
    mode: args.mode,
    prove: args.prove,
    areas: tier.areas,
    quiet: readQuiet,
    ...(args.filter === null ? {} : { filter: args.filter }),
    ...(check.ok ? {} : { cannotRun: check.reason }),
    container: { limits, command: command ?? commandLine() },
  });
  return run.file;
}

/** Prints what a run recorded; true when it is broken: a scenario could not finish, or a row is unproved or has no scenario. */
function printRun(path: string, file: ResultFile): boolean {
  const { tier, throttle, mode } = file.environment;
  const count = (outcome: ScenarioResult["outcome"]): number =>
    file.scenarios.filter((s) => s.outcome === outcome).length;
  console.log(`Tier: ${tier} · ${throttle}x · ${mode}`);
  console.log(
    `${file.scenarios.length} scenarios: ${count("measured")} measured, ${count("failed")} could not finish, ${count("not_measured")} not measured, ${count("void")} void`,
  );
  for (const s of file.scenarios)
    if (s.outcome === "failed")
      console.log(`${s.id} could not finish: ${lastLine(s.output)}`);
  for (const row of file.unmatched)
    console.log(`${row.scenario} ${row.metric} has a budget and no scenario`);
  for (const row of file.unproved)
    console.log(
      `${row.scenario} ${row.metric} cannot fail its budget: its samples do not pass through the shared measuring path`,
    );
  console.log(`Results: ${path}`);
  return (
    count("failed") > 0 || file.unproved.length > 0 || file.unmatched.length > 0
  );
}

/** Prints each run; 1 when any is broken, else 0, whatever the verdicts. */
async function printRuns(paths: readonly string[]): Promise<number> {
  let broken = false;
  for (const path of paths)
    if (printRun(path, await readResultFile(path))) broken = true;
  return broken ? 1 : 0;
}

/** Prints each metric of `candidate` that regressed from `baseline`; 1 when any did. */
async function compare(files: readonly string[]): Promise<number> {
  const [baseline, candidate] = files;
  if (baseline === undefined || candidate === undefined || files.length > 2)
    throw new Error("compare needs a baseline file and a candidate file");
  const rows = compareRuns(
    await readResultFile(baseline),
    await readResultFile(candidate),
    TOLERANCE,
  );
  const regressed = rows.filter((r) => r.regressed);
  for (const r of regressed)
    console.log(
      `${r.scenario} ${r.metric} regressed from ${r.baseline} to ${r.candidate}`,
    );
  return regressed.length > 0 ? 1 : 0;
}

async function writeBaseline(files: readonly string[]): Promise<number> {
  const [file, ...more] = files;
  if (file === undefined || more.length > 0)
    throw new Error("baseline needs one result file");
  const baseline = toBaseline(await readResultFile(file));
  const path = `${ROOT}/baseline.json`;
  await Bun.write(path, `${JSON.stringify(baseline, null, 2)}\n`);
  // The baseline is tracked, so it is written as the format check expects.
  const formatted = Bun.spawn([process.execPath, "fmt", path], {
    stdout: "ignore",
    stderr: "inherit",
  });
  return formatted.exited;
}

/** Downloads every locked trace and prints one line for each; 1 when any was not fetched. */
async function fetchAll(): Promise<number> {
  const fetched = await fetchTraces({ dir: `${ROOT}/corpus/traces`, fetch });
  for (const { name, reason } of fetched)
    console.log(
      reason === null
        ? `${name} fetched`
        : `${name} could not be fetched: ${reason}`,
    );
  return fetched.every((f) => f.ok) ? 0 : 1;
}

/** Copies chosen result files into docs/benchmark/runs/ and writes docs/benchmark/report.md from all of them. */
async function publish(files: readonly string[]): Promise<number> {
  if (files.length === 0)
    throw new Error("publish needs at least one result file");
  const { report, runs } = await publishRuns({ files, outDir: PUBLISHED });
  console.log(
    `Published ${report} from ${runs.length} ${runs.length === 1 ? "run" : "runs"}`,
  );
  return 0;
}

/** The one tier asked for, or every tier in order, each with the filter asked for. */
function runsOf(args: BenchArgs): TierRun[] {
  const { tier, throttle, filter } = args;
  if (tier !== null) return [{ tier, throttle, filter }];
  return EVERY_TIER.map((r) => ({ ...r, filter: filter ?? r.filter }));
}

async function main(args: BenchArgs): Promise<number> {
  const { subcommand, mode, prove } = args;
  if (subcommand === null) {
    const runs = runsOf(args);
    const files = await runTiers({
      root: ROOT,
      outDir: RESULTS,
      runs,
      mode,
      prove,
      docker,
    });
    return printRuns(files);
  }
  switch (subcommand.name) {
    case "child":
      await runChild(subcommand.args[0] ?? "");
      return 0;
    case "inside":
      return printRuns([await runInside(args, subcommand.args[0] ?? null)]);
    case "compare":
      return compare(subcommand.args);
    case "baseline":
      return writeBaseline(subcommand.args);
    case "fetch-traces":
      return fetchAll();
    case "report":
      process.stdout.write(
        await reportOf(
          subcommand.args.length > 0
            ? subcommand.args
            : await resultFilesIn(RESULTS),
        ),
      );
      return 0;
    case "publish":
      return publish(subcommand.args);
    default:
      throw new Error(`bun run bench has no subcommand ${subcommand.name}`);
  }
}

if (import.meta.main)
  process.exit(await main(parseBenchArgs(process.argv.slice(2))));
