// Lanternfield Studios seeded in a child process after the app opens, into a staging directory.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  STAGING_DONE,
  isSeedRunning,
  readSeedRun,
  writeSeedRun,
} from "./adopt.ts";
import { isFields } from "./link.ts";

/** How often the server reads the seed's record. */
const FOLLOW_EVERY_MS = 1_000;
/** How often a stopped seed's record is read until it no longer shows it running. */
const GONE_POLL_MS = 20;
/** A background seed still running this long after it started is stopped and counts as failed. */
const SEED_RUN_LIMIT_MS = 1_200_000;
const TIMED_OUT = "the server did not answer in time";
const UNEXPECTED = "something unexpected stopped it";

/** Where the background seed writes, under the live data folder. */
export const stagingDirOf = (dataDir: string): string =>
  join(dataDir, "data", "staging", "heavy");

/**
 * Stops a seed this server did not start without signalling any process: its staging folder is
 * moved off its path, which the seed's watch ends it on, and is removed once the record there no
 * longer shows a running seed.
 */
async function retire(stagingDir: string): Promise<void> {
  const aside = `${stagingDir}-stopped-${Date.now()}`;
  try {
    await rename(stagingDir, aside);
  } catch (error) {
    // ENOENT: the folder is gone already, and a seed exits once its folder is
    if (isFields(error) && error.code === "ENOENT") return;
    throw error;
  }
  for (
    let run = readSeedRun(aside);
    run !== null && isSeedRunning(run, Date.now());
    run = readSeedRun(aside)
  )
    await Bun.sleep(GONE_POLL_MS);
  await rm(aside, { recursive: true, force: true });
}

/** A seed's start, and its child process when this server started it, else null. */
interface Seed {
  startedAt: number;
  child: Bun.Subprocess | null;
}

/**
 * Starts the seed in a staging folder emptied of what a stopped one left, under a record that
 * claims the folder for it before it runs: a seed finding its folder claimed for another exits.
 */
function spawnSeed(options: {
  command: readonly string[];
  dataDir: string;
  seedAt: number;
  owner: number;
}): Seed {
  const stagingDir = stagingDirOf(options.dataDir);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  // Bun's --no-orphans reaches a child through this variable and would end the seed with this server: its owner does
  const { BUN_FEATURE_FLAG_NO_ORPHANS: _, ...env } = process.env;
  const child = Bun.spawn(
    [
      ...options.command,
      "seed",
      "--phase",
      "background",
      "--data-dir",
      options.dataDir,
      "--seed-at",
      String(options.seedAt),
      "--owner",
      String(options.owner),
    ],
    { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  );
  const startedAt = Date.now();
  writeSeedRun(stagingDir, {
    pid: child.pid,
    startedAt,
    beatAt: startedAt,
    progress: null,
    failed: null,
    owner: options.owner,
  });
  return { startedAt, child };
}

/**
 * Follows the background seed in the staging folder, and starts one when none runs there: a seed
 * runs until its `owner` exits, so when that is the demo's supervisor a seed outlives a server it
 * killed, and the server it starts next follows the seed from where it is, for as long as its
 * record beats; a seed owned by its server ends with it. `onProgress` hears each project it writes; once
 * the seed has marked the staging whole, `onDone` adopts it. A failure, a seed that ends without
 * its mark, or one still running SEED_RUN_LIMIT_MS after it started removes the staging folder and
 * is told `onFailed`. `stop` ends the seed and removes what it wrote; an adoption under way is
 * finished first. Only a seed this server started is ever signalled.
 */
export function startBackgroundSeed(options: {
  /** What starts this server: a compiled binary alone, or Bun and the entry file. */
  command: readonly string[];
  dataDir: string;
  seedAt: number;
  /** The process whose exit ends the seed: this server's own, or the demo's supervisor (SeedRun's `owner`). */
  owner: number;
  onProgress(done: number, total: number): void;
  onDone(): Promise<void>;
  onFailed(reason: string): void;
}): { stop(): Promise<void> } {
  const stagingDir = stagingDirOf(options.dataDir);
  const found = readSeedRun(stagingDir);
  const { startedAt, child }: Seed =
    found !== null &&
    found.owner === options.owner &&
    isSeedRunning(found, Date.now())
      ? { startedAt: found.startedAt, child: null }
      : spawnSeed(options);
  let exited = false;
  void child?.exited.then(() => {
    exited = true;
  });
  // a failure and a stop may both end the seed: the second waits for the first
  let halting: Promise<void> | null = null;
  const halt = (): Promise<void> =>
    (halting ??= (async () => {
      if (child === null) return retire(stagingDir);
      child.kill("SIGKILL");
      await child.exited;
      await rm(stagingDir, { recursive: true, force: true });
    })());
  let adopting: Promise<void> | null = null;
  let ended = false;
  const end = () => {
    ended = true;
    clearInterval(timer);
  };
  const fail = async (reason: string) => {
    end();
    await halt();
    options.onFailed(reason);
  };
  const follow = () => {
    if (ended) return;
    if (existsSync(join(stagingDir, STAGING_DONE))) {
      end();
      adopting = options.onDone().catch(() => {
        // an adoption that stops keeps its mark, so the next start finishes it
        options.onFailed(UNEXPECTED);
      });
      return;
    }
    const run = readSeedRun(stagingDir);
    if (run !== null && run.progress !== null)
      options.onProgress(run.progress.done, run.progress.total);
    const isGone =
      child === null ? run === null || !isSeedRunning(run, Date.now()) : exited;
    if (run !== null && run.failed !== null) void fail(run.failed);
    else if (isGone) void fail(UNEXPECTED);
    else if (Date.now() - startedAt >= SEED_RUN_LIMIT_MS) void fail(TIMED_OUT);
  };
  const timer = setInterval(follow, FOLLOW_EVERY_MS);
  follow();
  return {
    async stop() {
      if (adopting !== null) return adopting;
      end();
      await halt();
    },
  };
}
