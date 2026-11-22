// Lanternfield Studios seeded in a child process after the app opens, into a staging directory.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STAGING_DONE } from "./adopt.ts";

/** A background seed still running this long is killed and counts as failed. */
const SEED_CHILD_TIMEOUT_MS = 1_200_000;
const TIMED_OUT = "the server did not answer in time";
const UNEXPECTED = "something unexpected stopped it";

/** Where the background seed writes, under the live data folder. */
export const stagingDirOf = (dataDir: string): string =>
  join(dataDir, "data", "staging", "heavy");

type ChildMessage =
  | { t: "progress"; done: number; total: number }
  | { t: "done" }
  | { t: "failed"; reason: string };

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** A message the seed child sends; null for anything else. */
function readMessage(value: unknown): ChildMessage | null {
  if (typeof value !== "object" || value === null || !("t" in value))
    return null;
  if (value.t === "done") return { t: "done" };
  if (value.t === "failed" && "reason" in value)
    return typeof value.reason === "string"
      ? { t: "failed", reason: value.reason }
      : null;
  if (value.t !== "progress" || !("done" in value) || !("total" in value))
    return null;
  const { done, total } = value;
  return isCount(done) && isCount(total)
    ? { t: "progress", done, total }
    : null;
}

/**
 * Spawns the background seed: `onProgress` hears each project it writes; once the staging seed is
 * whole its mark is written and `onDone` adopts it. A failure, a child that exits without `done`, or
 * one still running at SEED_CHILD_TIMEOUT_MS removes the staging folder and is told `onFailed`.
 * `stop` ends the child and removes what it wrote; an adoption under way is finished first.
 */
export function startBackgroundSeed(options: {
  execPath: string;
  entry: string;
  dataDir: string;
  seedAt: number;
  onProgress(done: number, total: number): void;
  onDone(): Promise<void>;
  onFailed(reason: string): void;
}): { stop(): Promise<void> } {
  const stagingDir = stagingDirOf(options.dataDir);
  let reason: string | null = null;
  let adopting: Promise<void> | null = null;
  let stopped = false;
  const child = Bun.spawn(
    [
      options.execPath,
      "--no-orphans",
      options.entry,
      "seed",
      "--phase",
      "background",
      "--data-dir",
      options.dataDir,
      "--seed-at",
      String(options.seedAt),
    ],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      ipc(raw) {
        const message = readMessage(raw);
        if (message?.t === "progress")
          options.onProgress(message.done, message.total);
        if (message?.t === "failed") reason = message.reason;
        if (message?.t !== "done" || stopped) return;
        adopting = (async () => {
          await mkdir(stagingDir, { recursive: true });
          await writeFile(join(stagingDir, STAGING_DONE), "");
          await options.onDone();
        })().catch(() => {
          // an adoption that stops keeps its mark, so the next start finishes it
          options.onFailed(UNEXPECTED);
        });
      },
    },
  );
  const timer = setTimeout(() => {
    reason = TIMED_OUT;
    child.kill("SIGKILL");
  }, SEED_CHILD_TIMEOUT_MS);
  const ended = child.exited.then(async () => {
    clearTimeout(timer);
    if (adopting !== null || stopped) return;
    await rm(stagingDir, { recursive: true, force: true });
    options.onFailed(reason ?? UNEXPECTED);
  });
  return {
    async stop() {
      stopped = true;
      child.kill("SIGKILL");
      await ended;
      if (adopting !== null) await adopting;
      else await rm(stagingDir, { recursive: true, force: true });
    },
  };
}
