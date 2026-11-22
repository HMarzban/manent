// The staging directory of a background seed moved into the live data directory, in an order a crash cannot break.
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { openSqliteStorage, parseHome } from "@manent/storage";
import type { DocDirectory, Home, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";

/** The empty file the parent writes once the staging seed is whole: adoption may start, and start again. */
export const STAGING_DONE = "done";

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
 * its first step again; anything else is removed with the staging folder.
 */
export async function resumeStaging(
  options: AdoptOptions,
): Promise<"adopted" | "cleared"> {
  if (existsSync(join(options.stagingDir, STAGING_DONE))) {
    await adoptStaging(options);
    return "adopted";
  }
  await rm(dirname(options.stagingDir), { recursive: true, force: true });
  return "cleared";
}
