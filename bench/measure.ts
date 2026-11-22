// The one measuring path of every timed sample, the warm-up rule, and the check that the machine
// is quiet enough to time.

import { loadavg } from "node:os";
import { percentile } from "@manent/perf";
import { proveMs } from "./env.ts";
import type { Measurement } from "./harness.ts";
import type { Quiet } from "./result.ts";

/**
 * Times one sample with performance.now(); in proof mode, busy-waits proveMs() inside the timed span.
 * A synchronous `fn` is timed to its return, and an error it throws is thrown here, not returned.
 */
export function sampleMs(fn: () => void | Promise<void>): Promise<number> {
  const waitMs = proveMs();
  const startMs = performance.now();
  const done = fn();
  if (done instanceof Promise) return done.then(() => endOf(startMs, waitMs));
  return Promise.resolve(endOf(startMs, waitMs));
}

function endOf(startMs: number, waitMs: number | null): number {
  let endMs = performance.now();
  if (waitMs !== null) {
    const untilMs = endMs + waitMs;
    while (endMs < untilMs) endMs = performance.now();
  }
  return endMs - startMs;
}

/** Metrics of keystrokes and frames, whose first samples of a process are a warm-up. Every other metric is of whole operations
 *  (an open, a load, a merge, a click, a theme switch) and keeps every sample, because each starts from a fresh state by construction. */
export const INTERACTION_METRICS: readonly string[] = Object.freeze([
  "keystroke_paint",
  "keystroke_paint_remote",
  "keystroke_paint_alone",
  "keystroke_paint_realistic",
  "keystroke_paint_extreme",
  "keystroke_paint_rewrite",
  "keystroke_saved",
  "dispatch",
  "frame_ms",
]);

export const WARMUP = { interactions: 20, fraction: 0.1 } as const;

/** Drops the first max(interactions, ⌊fraction × length⌋) samples of one process. */
export function afterWarmup(samples: readonly number[]): {
  kept: number[];
  dropped: number;
} {
  const dropped = Math.min(
    samples.length,
    Math.max(WARMUP.interactions, Math.floor(WARMUP.fraction * samples.length)),
  );
  return { kept: samples.slice(dropped), dropped };
}

/** A copy of `samples` as one metric's measurement. RangeError on an empty list or a sample that is not finite. */
export function measurement(
  metric: string,
  unit: Measurement["unit"],
  samples: readonly number[],
): Measurement {
  if (samples.length === 0)
    throw new RangeError(`${metric} needs at least one sample`);
  const bad = samples.find((sample) => !Number.isFinite(sample));
  if (bad !== undefined)
    throw new RangeError(`${metric} has a sample that is not finite: ${bad}`);
  return { metric, unit, samples: [...samples] };
}

/** The count metric "input_blocks": what the scenario loaded. */
export function inputBlocks(blocks: number): Measurement {
  return measurement("input_blocks", "count", [blocks]);
}

export const QUIET = {
  spread: 1.25,
  retries: 12,
  waitMs: 5000,
  calibrationRuns: 21,
  calibrationIterations: 2_000_000,
} as const;

/** The highest 1-minute load average that counts as quiet: max(1, 0.25 × the cores the process sees). */
export function quietLoad(cpus: number): number {
  return Math.max(1, 0.25 * cpus);
}

/** The xorshift loop's last state, kept so the loop cannot be optimised away. */
let calibrationSink = 0;

function calibrationRun(): void {
  let x = 1;
  for (let i = 0; i < QUIET.calibrationIterations; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
  }
  calibrationSink ^= x;
}

/** Times calibrationRuns runs of a fixed loop (calibrationIterations steps of a 32-bit xorshift from seed 1, its result kept) and returns their p90 ÷ p10. */
export function calibrationSpread(): number {
  const times = Array.from({ length: QUIET.calibrationRuns }, () => {
    const startMs = performance.now();
    calibrationRun();
    return performance.now() - startMs;
  });
  return percentile(times, 90) / percentile(times, 10);
}

/** The load average and the calibration spread this machine shows now. */
export function readQuiet(): Quiet {
  return { load: loadavg()[0] ?? 0, spread: calibrationSpread() };
}

/** Quiet when the load is at most quietLoad(cpus) and the spread at most QUIET.spread. */
export function isQuiet(quiet: Quiet, cpus: number): boolean {
  return quiet.load <= quietLoad(cpus) && quiet.spread <= QUIET.spread;
}

/** The last quiet check, after waiting QUIET.waitMs between checks, up to QUIET.retries times, while the machine is busy. */
export async function waitForQuiet(options: {
  quiet: () => Quiet;
  cpus: number;
  waitMs: (ms: number) => Promise<void>;
}): Promise<Quiet> {
  let seen = options.quiet();
  for (let i = 0; i < QUIET.retries && !isQuiet(seen, options.cpus); i++) {
    await options.waitMs(QUIET.waitMs);
    seen = options.quiet();
  }
  return seen;
}
