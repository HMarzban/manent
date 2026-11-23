// Lanternfield Studios seeded in a child process after the app opens, into a staging directory.
import { existsSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  SEED_RUN_LIMIT_MS,
  STAGING_DONE,
  isAlive,
  isSeedRunning,
  readSeedRun,
} from "./adopt.ts";

/** How often the server reads the seed's record. */
const FOLLOW_EVERY_MS = 1_000;
/** How often a stopped seed is looked for until it is gone. */
const GONE_POLL_MS = 20;
const TIMED_OUT = "the server did not answer in time";
const UNEXPECTED = "something unexpected stopped it";

/** Where the background seed writes, under the live data folder. */
export const stagingDirOf = (dataDir: string): string =>
  join(dataDir, "data", "staging", "heavy");

/** Resolves once the process `pid` has exited. */
async function goneOf(pid: number): Promise<void> {
  while (isAlive(pid)) await Bun.sleep(GONE_POLL_MS);
}

/** A seed's process: its child, when this server started it, else null. */
interface Seed {
  pid: number;
  startedAt: number;
  child: Bun.Subprocess | null;
}

/**
 * Starts the seed in a staging folder emptied of what a stopped one left: it writes its record
 * there, and stops by itself once the process that started this server has exited.
 */
function spawnSeed(options: {
  command: readonly string[];
  dataDir: string;
  seedAt: number;
}): Seed {
  rmSync(stagingDirOf(options.dataDir), { recursive: true, force: true });
  // Bun's --no-orphans reaches every child through this variable, and would end the seed with a server killed without warning
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
      String(process.ppid),
    ],
    { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  );
  return { pid: child.pid, startedAt: Date.now(), child };
}

/**
 * Follows the background seed in the staging folder, and starts one when none runs there: a seed
 * a server killed without stopping keeps running, so the server started after it follows it from
 * where it is. `onProgress` hears each project it writes; once the seed has marked the staging
 * whole, `onDone` adopts it. A failure, a seed that exits without its mark, or one still running
 * SEED_RUN_LIMIT_MS after it started removes the staging folder and is told `onFailed`.
 * `stop` ends the seed and removes what it wrote; an adoption under way is finished first.
 */
export function startBackgroundSeed(options: {
  /** What starts this server: a compiled binary alone, or Bun and the entry file. */
  command: readonly string[];
  dataDir: string;
  seedAt: number;
  onProgress(done: number, total: number): void;
  onDone(): Promise<void>;
  onFailed(reason: string): void;
}): { stop(): Promise<void> } {
  const stagingDir = stagingDirOf(options.dataDir);
  const found = readSeedRun(stagingDir);
  const { pid, startedAt, child }: Seed =
    found !== null && isSeedRunning(found, Date.now())
      ? { pid: found.pid, startedAt: found.startedAt, child: null }
      : spawnSeed(options);
  let exited = false;
  void child?.exited.then(() => {
    exited = true;
  });
  const isGone = () => (child === null ? !isAlive(pid) : exited);
  // never a process id the seed no longer holds
  const kill = () => {
    if (isGone()) return;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ESRCH: it exited since it was looked for
    }
  };
  let adopting: Promise<void> | null = null;
  let ended = false;
  const end = () => {
    ended = true;
    clearInterval(timer);
  };
  const fail = async (reason: string) => {
    end();
    kill();
    await rm(stagingDir, { recursive: true, force: true });
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
    if (run !== null && run.failed !== null) void fail(run.failed);
    else if (isGone()) void fail(UNEXPECTED);
    else if (Date.now() - startedAt >= SEED_RUN_LIMIT_MS) void fail(TIMED_OUT);
  };
  const timer = setInterval(follow, FOLLOW_EVERY_MS);
  follow();
  return {
    async stop() {
      if (adopting !== null) return adopting;
      end();
      kill();
      await (child?.exited ?? goneOf(pid));
      await rm(stagingDir, { recursive: true, force: true });
    },
  };
}
