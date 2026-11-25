// Lanternfield Studios' background-seed state: start-up check, adoption progress, and heavy-doc detection.
import { join } from "node:path";
import { SEED_PROJECTS, heavyHomes } from "@manent/demo";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { adoptStaging, mergeDanaFavourites, resumeStaging } from "./adopt.ts";
import { stagingDirOf } from "./background.ts";
import type { LiveTarget } from "./driver.ts";

/** The projects Lanternfield Studios' background seed writes, as its progress counts them. */
const HEAVY_TOTAL = SEED_PROJECTS.filter(
  (p) => p.workspaceId === "heavy",
).length;

/** Where the background seed adopts into: the live data and Lanternfield Studios' homes. */
const adoptionOf = (dataDir: string, live: Storage) => ({
  live,
  stagingDir: stagingDirOf(dataDir),
  dataDir: join(dataDir, "data"),
  homes: heavyHomes(),
});

/**
 * Lanternfield Studios before the server listens: an adoption under way is finished, a stopped
 * seed cleared, through storage opened and closed here. True when its seed has yet to run or still
 * runs.
 */
export async function isHeavyWaiting(dataDir: string): Promise<boolean> {
  const live = openSqliteStorage({ dir: join(dataDir, "data"), now: Date.now });
  try {
    if (live.directory.placeOf(indexDocId("workspace", "heavy")) !== null)
      return false;
    return (await resumeStaging(adoptionOf(dataDir, live))) !== "adopted";
  } finally {
    live.close();
  }
}

export interface HeavyState {
  seeding(workspaceId: string): WorkspaceRef["seeding"];
  isHomeReady(home: string): boolean;
  isHeavyProjectDoc(docId: string): boolean;
  progress(done: number, total: number): void;
  failed(): void;
  adopted(target: LiveTarget, afterAdopt?: () => void): Promise<void>;
}

/**
 * While `waiting`, `seeding` tells /api/me how far Lanternfield Studios' seed has come, and none of
 * its homes is ready until `adopted` is called.
 */
export function createHeavyState(
  waiting: boolean,
  dataDir: string,
  live: Storage,
): HeavyState {
  const adoption = adoptionOf(dataDir, live);
  const heavyIndex = indexDocId("workspace", "heavy");
  let seeding: WorkspaceRef["seeding"] = waiting
    ? { done: 0, total: HEAVY_TOTAL, failed: false }
    : null;
  return {
    seeding: (workspaceId) => (workspaceId === "heavy" ? seeding : null),
    isHomeReady: (home) => seeding === null || !adoption.homes.has(home),
    isHeavyProjectDoc(docId) {
      if (docId === heavyIndex) return false;
      const place = live.directory.placeOf(docId);
      return (
        place !== null &&
        adoption.homes.has(`${place.home.kind}:${place.home.id}`)
      );
    },
    progress(done, total) {
      seeding = { done, total, failed: false };
    },
    failed() {
      if (seeding !== null) seeding = { ...seeding, failed: true };
    },
    async adopted(target, afterAdopt) {
      const favourites = await adoptStaging(adoption);
      if (favourites !== null) await mergeDanaFavourites(target, favourites);
      afterAdopt?.();
      seeding = null;
    },
  };
}
