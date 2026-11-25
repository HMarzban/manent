// The Trash service, which the server's configuration carries to its routes: move to Trash, restore, list and purge sweep.
import type { Home, Storage, TrashRow } from "@manent/storage";
import { indexDocId, isDocId } from "@manent/sync-protocol";
import type {
  DocKind,
  HttpErrorCode,
  TrashControlData,
  TrashListItem,
  TrashListResponse,
  TrashMoveResponse,
  TrashRestoreResponse,
} from "@manent/sync-protocol";
import type { Clock, SyncService } from "../sync/ports.ts";
import {
  deleteIndexEntry,
  findWorkspaceIndexFor,
  privateFolderIndexFor,
  readDocumentTitles,
  writeIndexTrashFields,
} from "./index-access.ts";

/** How long a document stays in Trash before a sweep tombstones it (30 days). */
export const TRASH_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** How often the live server sweeps Trash for due documents (1 hour). */
export const TRASH_SWEEP_INTERVAL_MS = 3_600_000;

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What a Trash request may be refused with, each one of `HTTP_ERROR_CODES`. */
export type TrashRefusal = Extract<
  HttpErrorCode,
  "bad_request" | "forbidden" | "not_found" | "deleted" | "busy"
>;

export type TrashOutcome<T> =
  { ok: true; value: T } | { ok: false; code: TrashRefusal };

export interface TrashService {
  move(userId: string, docId: string): Promise<TrashOutcome<TrashMoveResponse>>;
  restore(
    userId: string,
    docId: string,
  ): Promise<TrashOutcome<TrashRestoreResponse>>;
  list(
    userId: string,
    workspaceId: string,
  ): Promise<TrashOutcome<TrashListResponse>>;
  /** Tombstones every trashed document whose `purgeAfter <= nowMs`, cleans up indexes and Trash rows, and returns the count purged. */
  sweep(nowMs?: number): Promise<number>;
  /** Stops the scheduled hourly sweep timer. */
  stop(): void;
}

export interface TrashServiceOptions {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  names: (userId: string) => string;
  /** When true, schedules an initial sweep and hourly sweeps on `clock.schedule`. */
  scheduleSweep?: boolean;
}

const refused = (code: TrashRefusal) => ({ ok: false, code }) as const;

const homeKey = (home: Home): string => `${home.kind}:${home.id}`;

function encodeControl(data: TrashControlData): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

function authorizeTrash(
  storage: Storage,
  sync: SyncService,
  userId: string,
  docId: string,
): { ok: true; home: Home; kind: DocKind } | { ok: false; code: TrashRefusal } {
  if (!isDocId(docId)) return refused("bad_request");
  if (storage.directory.tombstoneOf(docId) !== null) return refused("deleted");
  if (storage.directory.placeOf(docId) === null) return refused("not_found");
  const resolved = sync.access.resolve(userId, docId);
  if (!resolved.ok) return refused(resolved.code);
  if (
    resolved.kind === "index" ||
    resolved.kind === "comments" ||
    resolved.kind === "private"
  )
    return refused("bad_request");
  const allowed =
    resolved.access.role === "owner" ||
    resolved.access.capabilities.includes("delete");
  if (!allowed) return refused("forbidden");
  return { ok: true, home: resolved.home, kind: resolved.kind };
}

type IndexTarget = { indexId: string; mapName: "documents" | "private_folder" };

function resolveRestoreTarget(
  storage: Storage,
  row: TrashRow,
): IndexTarget | null {
  if (
    row.workspaceId !== "" &&
    storage.directory.placeOf(row.workspaceId) !== null &&
    storage.directory.tombstoneOf(row.workspaceId) === null
  )
    return { indexId: row.workspaceId, mapName: "documents" };
  const privIndexId = privateFolderIndexFor(
    storage,
    row.deletedByUserId,
    row.docId,
  );
  return privIndexId === null
    ? null
    : { indexId: privIndexId, mapName: "private_folder" };
}

async function applyTrashChange(
  sync: SyncService,
  target: IndexTarget | null,
  change: {
    docId: string;
    userId: string;
    trashedAt: number | null;
    trashedByUserId: string | null;
    onCommit: () => void;
  },
): Promise<boolean> {
  if (target !== null) return writeIndexTrashFields(sync, target, change);
  change.onCommit();
  return true;
}

export function createTrashService(options: TrashServiceOptions): TrashService {
  const { storage, sync, clock, names } = options;
  const chains = new Map<string, Promise<void>>();
  let stopped = false;
  let cancelTimer: (() => void) | null = null;

  function inChain<T>(docId: string, run: () => Promise<T>): Promise<T> {
    const before = chains.get(docId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(docId, tail);
    void tail.then(() => {
      if (chains.get(docId) === tail) chains.delete(docId);
    });
    return next;
  }

  async function moveOne(
    userId: string,
    docId: string,
  ): Promise<TrashOutcome<TrashMoveResponse>> {
    const auth = authorizeTrash(storage, sync(), userId, docId);
    if (!auth.ok) return auth;
    const existing = storage.trash.get(docId);
    if (existing !== null)
      return { ok: true, value: { docId, purgeAfterAt: existing.purgeAfter } };
    const privIndexId =
      auth.home.kind === "project"
        ? privateFolderIndexFor(storage, userId, docId, auth.home)
        : null;
    const wsIndexId =
      privIndexId === null
        ? findWorkspaceIndexFor({
            storage,
            sync: sync(),
            userId,
            docId,
            home: auth.home,
          })
        : null;
    const target: IndexTarget | null =
      privIndexId !== null
        ? { indexId: privIndexId, mapName: "private_folder" }
        : wsIndexId !== null
          ? { indexId: wsIndexId, mapName: "documents" }
          : null;
    const deletedAt = clock.now();
    const purgeAfter = deletedAt + TRASH_KEEP_MS;
    const row: TrashRow = {
      docId,
      workspaceId: wsIndexId ?? "",
      home: homeKey(auth.home),
      deletedByUserId: userId,
      deletedAt,
      purgeAfter,
    };
    const ok = await applyTrashChange(sync(), target, {
      docId,
      userId,
      trashedAt: deletedAt,
      trashedByUserId: userId,
      onCommit: () => storage.trash.put(row),
    });
    if (!ok) return refused("busy");
    sync().broadcast(
      docId,
      "trashed",
      encodeControl({ userId, at: deletedAt, purgeAfterAt: purgeAfter }),
    );
    return { ok: true, value: { docId, purgeAfterAt: purgeAfter } };
  }

  async function restoreOne(
    userId: string,
    docId: string,
  ): Promise<TrashOutcome<TrashRestoreResponse>> {
    const auth = authorizeTrash(storage, sync(), userId, docId);
    if (!auth.ok) return auth;
    const existing = storage.trash.get(docId);
    if (existing === null) return { ok: true, value: { docId } };
    const ok = await applyTrashChange(
      sync(),
      resolveRestoreTarget(storage, existing),
      {
        docId,
        userId,
        trashedAt: null,
        trashedByUserId: null,
        onCommit: () => storage.trash.remove(docId),
      },
    );
    if (!ok) return refused("busy");
    sync().broadcast(
      docId,
      "untrashed",
      encodeControl({ userId, at: clock.now(), purgeAfterAt: null }),
    );
    return { ok: true, value: { docId } };
  }

  async function list(
    userId: string,
    workspaceId: string,
  ): Promise<TrashOutcome<TrashListResponse>> {
    if (!WORKSPACE_ID.test(workspaceId)) return refused("bad_request");
    const wsIndexId = indexDocId("workspace", workspaceId);
    if (!sync().access.resolve(userId, wsIndexId).ok)
      return refused("forbidden");
    const rows = storage.trash.listByWorkspace(wsIndexId);
    const titles = readDocumentTitles(storage, wsIndexId);
    const items: TrashListItem[] = [];
    for (const row of rows) {
      if (!sync().access.resolve(userId, row.docId).ok) continue;
      items.push({
        docId: row.docId,
        workspaceId,
        title: titles.get(row.docId) ?? "",
        deletedByUserId: row.deletedByUserId,
        deletedByName: names(row.deletedByUserId),
        deletedAt: row.deletedAt,
        purgeAfterAt: row.purgeAfter,
      });
    }
    return { ok: true, value: { items } };
  }

  async function purgeOne(docId: string, nowMs: number): Promise<boolean> {
    const current = storage.trash.get(docId);
    if (current === null || current.purgeAfter > nowMs) return false;
    const holders = new Set(
      storage.directory.rolesOf(docId).map((role) => role.userId),
    );
    holders.add(current.deletedByUserId);
    storage.directory.tombstone(docId, current.deletedByUserId);
    sync().removed(docId);
    if (current.workspaceId !== "")
      await deleteIndexEntry(
        sync(),
        storage,
        current.workspaceId,
        "documents",
        docId,
      );
    else
      await deleteIndexEntry(
        sync(),
        storage,
        indexDocId("user", current.deletedByUserId),
        "private_folder",
        docId,
      );
    for (const holderId of holders)
      await deleteIndexEntry(
        sync(),
        storage,
        indexDocId("user", holderId),
        "continue",
        docId,
      );
    storage.trash.remove(docId);
    return true;
  }

  async function sweep(nowMs = clock.now()): Promise<number> {
    const due = storage.trash.due(nowMs);
    if (due.length === 0) return 0;
    let purged = 0;
    for (const row of due) {
      if (await inChain(row.docId, () => purgeOne(row.docId, nowMs)))
        purged += 1;
    }
    return purged;
  }

  function scheduleNext(delayMs: number): void {
    if (stopped) return;
    cancelTimer = clock.schedule(() => {
      cancelTimer = null;
      if (stopped) return;
      void sweep()
        .catch(() => {
          // a failed scheduled sweep retries on the next hourly tick
        })
        .finally(() => {
          scheduleNext(TRASH_SWEEP_INTERVAL_MS);
        });
    }, delayMs);
  }

  if (options.scheduleSweep === true) scheduleNext(0);

  return {
    move: (userId, docId) => inChain(docId, () => moveOne(userId, docId)),
    restore: (userId, docId) => inChain(docId, () => restoreOne(userId, docId)),
    list,
    sweep,
    stop() {
      stopped = true;
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}
