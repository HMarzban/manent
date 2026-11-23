// The staging directory of a background seed: the record of the seed writing it, and its move into the live data
// directory, in an order a crash cannot break.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { openSqliteStorage, parseHome } from "@manent/storage";
import type { DocDirectory, Home, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import { isFields } from "./link.ts";

/** The empty file the seed writes once the staging seed is whole: adoption may start, and start again. */
export const STAGING_DONE = "done";
/** The seed's record, rewritten whole as it goes. */
const STAGING_RUN = "run.json";

/** What a background seed records in its staging folder, so that a server started after it can follow it. */
export interface SeedRun {
  /** Which seed wrote it, with `startedAt`; never signalled, as another process may hold it since. */
  pid: number;
  startedAt: number;
  /** When it last rewrote its record, which it does every second it is free to while it runs. */
  beatAt: number;
  /** Projects written, of how many; null until the first is. */
  progress: { done: number; total: number } | null;
  /** The clause its failure is told with; null while it runs. */
  failed: string | null;
}

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** The record in `stagingDir`; null when there is none or it is not one. */
export function readSeedRun(stagingDir: string): SeedRun | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(stagingDir, STAGING_RUN), "utf8"));
  } catch {
    // no seed has started writing here yet; the record is only ever replaced whole
    return null;
  }
  if (!isFields(value)) return null;
  const { pid, startedAt, beatAt, progress, failed } = value;
  if (!isCount(pid) || !isCount(startedAt) || !isCount(beatAt)) return null;
  if (failed !== null && typeof failed !== "string") return null;
  if (progress === null) return { pid, startedAt, beatAt, progress, failed };
  if (!isFields(progress)) return null;
  const { done, total } = progress;
  return isCount(done) && isCount(total)
    ? { pid, startedAt, beatAt, progress: { done, total }, failed }
    : null;
}

/** Replaces the record in `stagingDir` whole, so that a reader never sees half of it. */
export function writeSeedRun(stagingDir: string, run: SeedRun): void {
  const path = join(stagingDir, STAGING_RUN);
  writeFileSync(`${path}.tmp`, JSON.stringify(run));
  renameSync(`${path}.tmp`, path);
}

/** True while the process `pid` exists, whoever runs it. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, run by another user; ESRCH: it has exited
    return isFields(error) && error.code === "EPERM";
  }
}

/**
 * A record not rewritten for this long is a seed that has stopped, however it ended. The seed
 * beats every second, but building a project can hold it for most of a minute.
 */
const BEAT_LIMIT_MS = 300_000;

/**
 * True while the seed the record names may still run at `now`: it has not failed, has rewritten its
 * record lately, and its process id has not exited. The id alone never proves the seed runs, since
 * another process may hold it since; a beat after `now` (a clock set back) is not a recent one.
 */
export function isSeedRunning(run: SeedRun, now: number): boolean {
  const since = now - run.beatAt;
  return (
    run.failed === null &&
    since >= 0 &&
    since < BEAT_LIMIT_MS &&
    isAlive(run.pid)
  );
}

interface AdoptOptions {
  live: Storage;
  stagingDir: string;
  dataDir: string;
  homes: ReadonlySet<string>;
}

/** A home's file and its checkpoints, beside the SQLite files that may still hold their tail. */
const filesOf = (home: string): string[] => {
  const base = home.replace(":", "-");
  return [".sqlite", ".checkpoints.sqlite"].flatMap((end) =>
    ["", "-wal", "-shm"].map((side) => `${base}${end}${side}`),
  );
};

/** `docId` placed in `live` as `staged` placed it, with each role it holds there that `live` lacks. */
function placeAs(
  staged: DocDirectory,
  live: DocDirectory,
  docId: string,
  home: Home,
): void {
  const place = staged.placeOf(docId);
  if (place === null) return;
  const roles = staged.rolesOf(docId);
  const owner = roles.find((r) => r.role === "owner")?.userId ?? "";
  live.place(docId, home, place.kind, owner);
  for (const { userId, role, capabilities } of roles)
    if (live.roleOf(docId, userId) === null)
      live.setRole(docId, userId, role, capabilities);
}

/**
 * Moves a whole staging seed into the live data: (1) each home's files renamed into `dataDir`,
 * replacing any of the same name; (2) every document but the index placed, with its roles; (3)
 * last, the index, whose place is the mark that adoption is complete; (4) the staging removed.
 * Run again from (1) after a crash, it ends the same.
 */
export async function adoptStaging(options: AdoptOptions): Promise<void> {
  const { live, stagingDir, dataDir, homes } = options;
  for (const home of homes)
    for (const name of filesOf(home))
      if (existsSync(join(stagingDir, name)))
        await rename(join(stagingDir, name), join(dataDir, name));
  const staged = openSqliteStorage({ dir: stagingDir, now: () => 0 });
  const index = indexDocId("workspace", "heavy");
  try {
    for (const key of homes) {
      const home = parseHome(key);
      if (home === null) continue;
      for (const docId of staged.directory.documentsIn(home))
        if (docId !== index)
          placeAs(staged.directory, live.directory, docId, home);
    }
    const indexPlace = staged.directory.placeOf(index);
    if (indexPlace !== null)
      placeAs(staged.directory, live.directory, index, indexPlace.home);
  } finally {
    staged.close();
  }
  await rm(stagingDir, { recursive: true, force: true });
}

/**
 * The start-up rule for a staging directory a stopped server left: a whole seed is adopted, from
 * its first step again; a seed still running is left to run, for the server to follow; anything
 * else is removed with the staging folder.
 */
export async function resumeStaging(
  options: AdoptOptions,
): Promise<"adopted" | "running" | "cleared"> {
  const { stagingDir } = options;
  if (existsSync(join(stagingDir, STAGING_DONE))) {
    await adoptStaging(options);
    return "adopted";
  }
  const run = readSeedRun(stagingDir);
  if (run !== null && isSeedRunning(run, Date.now())) return "running";
  await rm(dirname(stagingDir), { recursive: true, force: true });
  return "cleared";
}
