// What the harness tells each scenario process through its environment, and what a run records
// about the machine and the commit it ran on.

import { availableParallelism, totalmem } from "node:os";
import { relative } from "node:path";
import type { RunEnvironment } from "./result.ts";
import { TIER_IDS } from "./tiers/tiers.ts";
import type { ContainerLimits, TierId } from "./tiers/tiers.ts";

export const MODES = ["quick", "standard", "full"] as const;
/** The processor slowdowns a client scenario may run under. */
export const THROTTLES = [1, 4, 6] as const;

/** A scenario's run() throws this to say it cannot run here; the harness records why. */
export class NotMeasured extends Error {
  readonly code = "not_measured";
}

/** `MANENT_BENCH_TIER`, `host` when unset. Throws on a value that names no tier. */
export function benchTier(): TierId {
  const value = process.env.MANENT_BENCH_TIER;
  if (value === undefined) return "host";
  const tier = TIER_IDS.find((id) => id === value);
  if (tier === undefined)
    throw new RangeError(
      `MANENT_BENCH_TIER must be one of ${TIER_IDS.join(", ")}, not ${value}`,
    );
  return tier;
}

/** `MANENT_BENCH_THROTTLE`: the processor slowdown a client scenario applies, 1 when unset. */
export function benchThrottle(): 1 | 4 | 6 {
  const value = process.env.MANENT_BENCH_THROTTLE;
  if (value === undefined) return 1;
  const throttle = THROTTLES.find((t) => String(t) === value);
  if (throttle === undefined)
    throw new RangeError(
      `MANENT_BENCH_THROTTLE must be 1, 4 or 6, not ${value}`,
    );
  return throttle;
}

/** `MANENT_BENCH_MODE`, `standard` when unset: the sizes and durations a scenario runs. */
export function benchMode(): "quick" | "standard" | "full" {
  const value = process.env.MANENT_BENCH_MODE;
  if (value === undefined) return "standard";
  const mode = MODES.find((m) => m === value);
  if (mode === undefined)
    throw new RangeError(
      `MANENT_BENCH_MODE must be quick, standard or full, not ${value}`,
    );
  return mode;
}

/** `MANENT_BENCH_PROVE_MS`: the milliseconds a proof run adds inside each sample; null outside one. */
export function proveMs(): number | null {
  const value = process.env.MANENT_BENCH_PROVE_MS;
  if (value === undefined) return null;
  const ms = Number(value);
  if (!/^\d+$/.test(value) || ms < 1)
    throw new RangeError(
      `MANENT_BENCH_PROVE_MS must be a positive integer, not ${value}`,
    );
  return ms;
}

/** The command line this process was started with, its script relative to the working directory. */
export function commandLine(): string {
  const [, script = "", ...args] = process.argv;
  return ["bun", relative(process.cwd(), script), ...args].join(" ");
}

/**
 * What a run records about where it ran. `container` is what a tier's container saw (its limits)
 * and was told (the host's command line); null outside one, where the limits are null. The commit
 * is the one a tier's image was built from, or else git's; throws when neither names it.
 */
export function runEnvironment(
  run: {
    tier: TierId;
    throttle: 1 | 4 | 6;
    mode: "quick" | "standard" | "full";
    prove: boolean;
    corpusVersion: number;
  },
  container: { limits: ContainerLimits; command: string } | null,
): RunEnvironment {
  return {
    tier: run.tier,
    throttle: run.throttle,
    mode: run.mode,
    prove: run.prove,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    cpus: availableParallelism(),
    memoryBytes: totalmem(),
    limits: container?.limits ?? { cpus: null, memoryBytes: null },
    chromium: null,
    ...readSource(),
    corpusVersion: run.corpusVersion,
    command: container?.command ?? commandLine(),
  };
}

/** The commit measured and whether its tree had changes. A tier's image has no repository, so it carries both from its build. */
export function readSource(): { commit: string; dirty: boolean } {
  const commit = process.env.MANENT_BENCH_COMMIT;
  if (commit !== undefined && commit !== "")
    return { commit, dirty: process.env.MANENT_BENCH_DIRTY === "true" };
  return {
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
  };
}

function git(args: readonly string[]): string {
  const ran = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir });
  if (ran.exitCode !== 0)
    throw new Error(
      `git ${args.join(" ")} exited with ${ran.exitCode}: ${ran.stderr.toString().trim()}`,
    );
  return ran.stdout.toString().trim();
}

/** The environment of a scenario's processes: this one's, with the run's tier, throttle and mode, and a proof's wait. */
export function scenarioEnv(
  run: {
    tier: TierId;
    throttle: 1 | 4 | 6;
    mode: "quick" | "standard" | "full";
  },
  proveWaitMs: number | null,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && key !== "MANENT_BENCH_PROVE_MS")
      env[key] = value;
  env.MANENT_BENCH_TIER = run.tier;
  env.MANENT_BENCH_THROTTLE = String(run.throttle);
  env.MANENT_BENCH_MODE = run.mode;
  if (proveWaitMs !== null) env.MANENT_BENCH_PROVE_MS = String(proveWaitMs);
  return env;
}

/** Human-readable failure output for a scenario child that exited non-zero or was terminated by a signal. */
export function formatProcessFailure(
  rel: string,
  exitCode: number,
  signalCode: NodeJS.Signals | number | null,
  printed: string,
): string {
  const note =
    signalCode !== null
      ? `${rel}: process terminated by ${signalCode} (exit ${exitCode})`
      : `${rel}: process exited with code ${exitCode} and no output`;
  if (printed.trim() === "") return note;
  return signalCode !== null ? `${printed}\n${note}` : printed;
}
