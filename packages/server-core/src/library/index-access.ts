// Server-held index lookups and authority index updates used by TrashService.
import { ORIGIN_LOAD, createDoc, jsonMap, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { SyncService } from "../sync/ports.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Loads the committed CRDT state of a placed document from storage; caller must destroy it. */
export function loadCommittedDoc(
  storage: Storage,
  docId: string,
): CrdtDoc | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0);
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

/** Every placed, non-tombstoned workspace index id in server-held storage. */
function workspaceIndexIds(storage: Storage): string[] {
  const { directory } = storage;
  const ids: string[] = [];
  for (const home of directory.homes()) {
    if (home.kind !== "project") continue;
    const place = directory.placeOf(home.id);
    if (
      place !== null &&
      place.kind === "index" &&
      place.home.kind === "project" &&
      place.home.id === home.id &&
      directory.tombstoneOf(home.id) === null
    )
      ids.push(home.id);
  }
  return ids;
}

/**
 * Finds the workspace index that holds `docId` with server-verified ownership: caller has access to the
 * workspace index, `home` is a project home, `documents[docId].projectId === home.id`, and `projects[home.id]`
 * exists in that workspace index. Never scans workspaces for `user:` homes.
 */
export function findWorkspaceIndexFor(options: {
  storage: Storage;
  sync: SyncService;
  userId: string;
  docId: string;
  home: Home;
}): string | null {
  const { storage, sync, userId, docId, home } = options;
  if (home.kind !== "project") return null;
  const docHolders = storage.directory
    .rolesOf(docId)
    .map((entry) => entry.userId);
  let bestIndexId: string | null = null;
  let bestScore = -1;
  for (const indexId of workspaceIndexIds(storage)) {
    if (!sync.access.resolve(userId, indexId).ok) continue;
    const doc = loadCommittedDoc(storage, indexId);
    if (doc === null) continue;
    let matches = false;
    try {
      const entry = jsonMap(doc, "documents").get(docId);
      matches =
        isPlainObject(entry) &&
        entry.projectId === home.id &&
        jsonMap(doc, "projects").get(home.id) !== null;
    } finally {
      doc.destroy();
    }
    if (!matches) continue;
    const members = new Set(
      storage.directory.rolesOf(indexId).map((entry) => entry.userId),
    );
    let score = 0;
    for (const holder of docHolders) if (members.has(holder)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestIndexId = indexId;
    }
  }
  return bestIndexId;
}

/** Returns `userId`'s private index id if its `private_folder` map holds a matching document entry for `docId`, else null. */
export function privateFolderIndexFor(
  storage: Storage,
  userId: string,
  docId: string,
  home?: Home,
): string | null {
  if (home !== undefined && home.kind !== "project") return null;
  const userIndexId = indexDocId("user", userId);
  if (
    storage.directory.placeOf(userIndexId) === null ||
    storage.directory.tombstoneOf(userIndexId) !== null
  )
    return null;
  const doc = loadCommittedDoc(storage, userIndexId);
  if (doc === null) return null;
  try {
    const entry = jsonMap(doc, "private_folder").get(docId);
    if (!isPlainObject(entry) || typeof entry.projectId !== "string")
      return null;
    if (home !== undefined && entry.projectId !== home.id) return null;
    return userIndexId;
  } finally {
    doc.destroy();
  }
}

/** Reads `docId -> title` from a workspace index's `documents` map. */
export function readDocumentTitles(
  storage: Storage,
  wsIndexId: string,
): Map<string, string> {
  const titles = new Map<string, string>();
  const doc = loadCommittedDoc(storage, wsIndexId);
  if (doc === null) return titles;
  try {
    for (const [docId, raw] of Object.entries(
      jsonMap(doc, "documents").entries(),
    )) {
      if (isPlainObject(raw) && typeof raw.title === "string")
        titles.set(docId, raw.title);
    }
  } finally {
    doc.destroy();
  }
  return titles;
}

/** Updates `trashedAt` and `trashedByUserId` on an index entry and runs `onCommit` inside the write's transaction. */
export async function writeIndexTrashFields(
  sync: SyncService,
  target: { indexId: string; mapName: "documents" | "private_folder" },
  update: {
    docId: string;
    userId: string;
    trashedAt: number | null;
    trashedByUserId: string | null;
    onCommit: () => void;
  },
): Promise<boolean> {
  const written = await sync.authorityWrite(target.indexId, {
    userId: update.userId,
    origin: "system",
    edit(doc) {
      const map = jsonMap(doc, target.mapName);
      const current = map.get(update.docId);
      if (isPlainObject(current))
        map.set(update.docId, {
          ...current,
          trashedAt: update.trashedAt,
          trashedByUserId: update.trashedByUserId,
        });
      return { ok: true };
    },
    inTransaction() {
      update.onCommit();
    },
  });
  return written.ok;
}

/** Deletes `docId` from an index map if the index is placed and not tombstoned. */
export async function deleteIndexEntry(
  sync: SyncService,
  storage: Storage,
  indexId: string,
  mapName: "documents" | "private_folder" | "continue",
  docId: string,
): Promise<void> {
  if (
    storage.directory.placeOf(indexId) === null ||
    storage.directory.tombstoneOf(indexId) !== null
  )
    return;
  await sync.authorityWrite(indexId, {
    userId: SYSTEM_USER_ID,
    origin: "system",
    edit(doc) {
      const map = jsonMap(doc, mapName);
      if (map.get(docId) !== null) map.delete(docId);
      return { ok: true };
    },
    inTransaction() {
      // index cleanup stores no auxiliary control rows
    },
  });
}
