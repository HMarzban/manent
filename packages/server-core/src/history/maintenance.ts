// A document's history kept in shape: automatic versions thinned as they age, log versions past
// their first day turned into snapshots, purgeable logs purged, and chunks nothing names removed.
import type { DocFile, Home, Storage, VersionRow } from "@manent/storage";
import type { VersionPosition } from "@manent/sync-protocol";
import type { Clock } from "../sync/ports.ts";
import { materializeVersion } from "./content.ts";
import type { LocksAt } from "./content.ts";
import { liveChunkHashes, writeSnapshot } from "./snapshot.ts";
import { joinSummaries } from "./summaries.ts";
import { KEEP_ALL_MS, thinVersions } from "./thinning.ts";

/** The most often one document's maintenance runs on its own. */
export const MAINTAIN_EVERY_MS = 3_600_000;

/** Removes the versions thinning lets go, each summary joined to the version kept after it. */
function thin(file: DocFile, docId: string, now: number): void {
  const { remove, mergeInto } = thinVersions(file.versions.list(docId), now);
  if (remove.length === 0) return;
  file.transaction(() => {
    for (const [from, into] of mergeInto) {
      const summary = file.history.summary(from);
      if (summary !== null)
        file.history.setSummary(
          into,
          joinSummaries(file.history.summary(into), summary),
        );
    }
    file.history.remove(remove);
  });
  file.checkpoints.unpin(remove);
}

/**
 * Writes a snapshot of each log version past its first day that has none, in log order, so each
 * one's authors carry from the one before; then lets go of their pins.
 */
function fix(
  file: DocFile,
  docId: string,
  now: number,
  locksAt: LocksAt,
): void {
  const due: { version: VersionRow; at: VersionPosition }[] = [];
  for (const version of file.versions.list(docId)) {
    const { id, generation, seq, createdAt } = version;
    if (generation === null || seq === null) continue;
    if (now - createdAt < KEEP_ALL_MS || file.history.snapshotOf(id) !== null)
      continue;
    due.push({ version, at: { generation, seq } });
  }
  const inLogOrder = due.toSorted(
    (a, b) => a.at.generation - b.at.generation || a.at.seq - b.at.seq,
  );
  for (const { version, at } of inLogOrder) {
    const content = materializeVersion(file, version);
    if (content === null) continue;
    const locks = locksAt(file, docId, at);
    file.transaction(() => {
      const ref = writeSnapshot(file, { ...content, locks });
      file.history.setSnapshot(version.id, ref, content.engineVersion);
    });
  }
  file.checkpoints.unpin(due.map(({ version }) => version.id));
}

/** Purges each frozen generation past its keep whose log versions all have snapshots. */
function purge(file: DocFile, docId: string, now: number): void {
  const versions = file.versions.list(docId);
  for (const { generation, finalState, purgeAfter } of file.generations.list(
    docId,
  )) {
    if (finalState === null || now <= purgeAfter) continue;
    const held = versions.filter(
      (version) => version.generation === generation && version.seq !== null,
    );
    if (held.some((version) => file.history.snapshotOf(version.id) === null))
      continue;
    file.history.purgeLog(docId, generation);
    file.checkpoints.purge(docId, generation);
  }
}

/** Removes the chunks no manifest of any document in the file still names. */
function sweep(storage: Storage, file: DocFile, home: Home): void {
  const live = new Set<string>();
  for (const docId of storage.directory.documentsIn(home))
    for (const hash of liveChunkHashes(file, docId)) live.add(hash);
  const dead = file.history
    .chunkHashes()
    .filter((hash) => !live.has(hash.toHex()));
  if (dead.length > 0) file.history.removeChunks(dead);
}

/** Thins, fixes, purges and sweeps the document's history at `now`; nothing for a document not placed. */
export function maintainDocument(options: {
  storage: Storage;
  docId: string;
  now: number;
  locksAt: LocksAt;
}): void {
  const { storage, docId, now } = options;
  const place = storage.directory.placeOf(docId);
  if (place === null) return;
  const file = storage.open(place.home);
  thin(file, docId, now);
  fix(file, docId, now, options.locksAt);
  purge(file, docId, now);
  sweep(storage, file, place.home);
}

/** A document's maintenance, now or, on its own, at most once per MAINTAIN_EVERY_MS. */
export interface Maintenance {
  now(docId: string): void;
  /** Never throws: a pass that fails runs again on a later call. */
  soon(docId: string): void;
}

export function createMaintenance(options: {
  storage: Storage;
  clock: Clock;
  locksAt: LocksAt;
}): Maintenance {
  const { storage, clock, locksAt } = options;
  /** By document: when its maintenance last ran on its own. */
  const ranAt = new Map<string, number>();
  const now = (docId: string): void =>
    maintainDocument({ storage, docId, now: clock.now(), locksAt });
  return {
    now,
    soon(docId) {
      const at = clock.now();
      const last = ranAt.get(docId);
      if (last !== undefined && at - last < MAINTAIN_EVERY_MS) return;
      ranAt.set(docId, at);
      try {
        now(docId);
      } catch {
        // a damaged chunk or a busy file stops this pass only: nothing waits on it, and it runs
        // again after a later version or the room's next unload
      }
    },
  };
}
