// In-memory cache of decoded workspace and private-folder metadata, invalidated by each index document's (generation, headSeq).
import { jsonMap } from "@manent/crdt";
import type { Storage } from "@manent/storage";
import { indexDocId, isDocKind } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import { allWorkspaceIndexIds, loadDocFromStorage } from "./metadata.ts";
import type {
  FolderInfo,
  IndexedDocMeta,
  WorkspaceMetadata,
} from "./metadata.ts";

interface CachedWorkspaceDoc {
  readonly docId: string;
  readonly projectId: string;
  readonly kind: DocKind;
  readonly projectKind: string;
  readonly projectTitle: string;
  readonly title: string;
  readonly folderIds: readonly string[];
  readonly changedAt: number;
}

interface WorkspaceCacheEntry {
  readonly generation: number;
  readonly headSeq: number;
  readonly folders: ReadonlyMap<string, FolderInfo>;
  readonly docs: readonly CachedWorkspaceDoc[];
}

interface CachedPrivateDoc {
  readonly docId: string;
  readonly projectId: string;
  readonly kind: DocKind;
  readonly projectKind: string | null;
  readonly projectTitle: string | null;
  readonly title: string;
  readonly changedAt: number;
}

interface PrivateCacheEntry {
  readonly generation: number;
  readonly headSeq: number;
  readonly docs: readonly CachedPrivateDoc[];
}

export interface SearchMetadataCache {
  readWorkspace(workspaceIndexId: string): WorkspaceMetadata;
  readPrivateFolder(userId: string): Map<string, IndexedDocMeta>;
  collectAll(): Map<string, IndexedDocMeta>;
  clear(): void;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

function ancestorChain(
  startFolderId: string | null,
  folders: ReadonlyMap<string, FolderInfo>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor = startFolderId;
  while (cursor !== null && !seen.has(cursor)) {
    const folder = folders.get(cursor);
    if (folder === undefined) break;
    seen.add(cursor);
    chain.push(cursor);
    cursor = folder.parentId;
  }
  return chain;
}

function decodeWorkspaceEntry(
  storage: Storage,
  workspaceIndexId: string,
  generation: number,
  headSeq: number,
): WorkspaceCacheEntry | null {
  const place = storage.directory.placeOf(workspaceIndexId);
  if (place === null) return null;
  const loaded = loadDocFromStorage(storage, workspaceIndexId, place.home);
  if (loaded === null) return null;
  try {
    const folders = new Map<string, FolderInfo>();
    for (const [id, raw] of Object.entries(
      jsonMap(loaded.doc, "folders").entries(),
    )) {
      if (!isPlainObject(raw) || typeof raw.name !== "string") continue;
      const parentId = typeof raw.parentId === "string" ? raw.parentId : null;
      folders.set(id, { id, name: raw.name, parentId });
    }
    const projects = new Map<
      string,
      { title: string; kind: string; folderId: string | null }
    >();
    for (const [id, raw] of Object.entries(
      jsonMap(loaded.doc, "projects").entries(),
    )) {
      if (
        !isPlainObject(raw) ||
        typeof raw.title !== "string" ||
        typeof raw.kind !== "string"
      )
        continue;
      const folderId = typeof raw.folderId === "string" ? raw.folderId : null;
      projects.set(id, { title: raw.title, kind: raw.kind, folderId });
    }
    const docs: CachedWorkspaceDoc[] = [];
    for (const [docId, raw] of Object.entries(
      jsonMap(loaded.doc, "documents").entries(),
    )) {
      if (
        !isPlainObject(raw) ||
        typeof raw.title !== "string" ||
        typeof raw.kind !== "string" ||
        !isDocKind(raw.kind)
      )
        continue;
      const projectId =
        typeof raw.projectId === "string" ? raw.projectId : null;
      const project = projectId === null ? undefined : projects.get(projectId);
      if (projectId === null || project === undefined) continue;
      const changedAt = isSafeInt(raw.editedAt)
        ? raw.editedAt
        : isSafeInt(raw.createdAt)
          ? raw.createdAt
          : 0;
      docs.push({
        docId,
        projectId,
        kind: raw.kind,
        projectKind: project.kind,
        projectTitle: project.title,
        title: raw.title,
        folderIds: ancestorChain(project.folderId, folders),
        changedAt,
      });
    }
    return { generation, headSeq, folders, docs };
  } finally {
    loaded.doc.destroy();
  }
}

function decodePrivateEntry(
  storage: Storage,
  userIndexId: string,
  generation: number,
  headSeq: number,
): PrivateCacheEntry | null {
  const place = storage.directory.placeOf(userIndexId);
  if (place === null) return null;
  const loaded = loadDocFromStorage(storage, userIndexId, place.home);
  if (loaded === null) return null;
  try {
    const entries = jsonMap(loaded.doc, "private_folder").entries();
    const projects = new Map<string, { title: string; kind: string }>();
    for (const [id, raw] of Object.entries(entries)) {
      if (
        isPlainObject(raw) &&
        !("projectId" in raw) &&
        typeof raw.title === "string" &&
        typeof raw.kind === "string"
      )
        projects.set(id, { title: raw.title, kind: raw.kind });
    }
    const docs: CachedPrivateDoc[] = [];
    for (const [docId, raw] of Object.entries(entries)) {
      if (
        !isPlainObject(raw) ||
        !("projectId" in raw) ||
        typeof raw.projectId !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.kind !== "string" ||
        !isDocKind(raw.kind)
      )
        continue;
      const project = projects.get(raw.projectId);
      const changedAt = isSafeInt(raw.editedAt)
        ? raw.editedAt
        : isSafeInt(raw.createdAt)
          ? raw.createdAt
          : 0;
      docs.push({
        docId,
        projectId: raw.projectId,
        kind: raw.kind,
        projectKind: project?.kind ?? null,
        projectTitle: project?.title ?? null,
        title: raw.title,
        changedAt,
      });
    }
    return { generation, headSeq, docs };
  } finally {
    loaded.doc.destroy();
  }
}

/** Caches workspace and private-folder metadata in memory, re-decoding a Yjs index doc only when its head advances. */
export function createSearchMetadataCache(
  storage: Storage,
): SearchMetadataCache {
  const workspaces = new Map<string, WorkspaceCacheEntry>();
  const privates = new Map<string, PrivateCacheEntry>();

  function readWorkspace(workspaceIndexId: string): WorkspaceMetadata {
    const emptyFolders = new Map<string, FolderInfo>();
    const docs = new Map<string, IndexedDocMeta>();
    const place = storage.directory.placeOf(workspaceIndexId);
    if (
      place === null ||
      storage.directory.tombstoneOf(workspaceIndexId) !== null
    ) {
      workspaces.delete(workspaceIndexId);
      return { workspaceIndexId, folders: emptyFolders, docs };
    }
    const row = storage.open(place.home).log.get(workspaceIndexId);
    if (row === null) {
      workspaces.delete(workspaceIndexId);
      return { workspaceIndexId, folders: emptyFolders, docs };
    }
    let entry = workspaces.get(workspaceIndexId);
    if (
      entry === undefined ||
      entry.generation !== row.generation ||
      entry.headSeq !== row.headSeq
    ) {
      const decoded = decodeWorkspaceEntry(
        storage,
        workspaceIndexId,
        row.generation,
        row.headSeq,
      );
      if (decoded === null) {
        workspaces.delete(workspaceIndexId);
        return { workspaceIndexId, folders: emptyFolders, docs };
      }
      workspaces.set(workspaceIndexId, decoded);
      entry = decoded;
    }
    for (const item of entry.docs) {
      const docPlace = storage.directory.placeOf(item.docId);
      if (
        docPlace === null ||
        docPlace.home.kind !== "project" ||
        docPlace.home.id !== item.projectId
      )
        continue;
      docs.set(item.docId, {
        docId: item.docId,
        workspaceIndexId,
        kind: item.kind,
        projectKind: item.projectKind,
        projectTitle: item.projectTitle,
        title: item.title,
        folderIds: item.folderIds,
        changedAt: item.changedAt,
      });
    }
    return { workspaceIndexId, folders: entry.folders, docs };
  }

  function readPrivateFolder(userId: string): Map<string, IndexedDocMeta> {
    const docs = new Map<string, IndexedDocMeta>();
    const userIndexId = indexDocId("user", userId);
    const place = storage.directory.placeOf(userIndexId);
    if (place === null || storage.directory.tombstoneOf(userIndexId) !== null) {
      privates.delete(userIndexId);
      return docs;
    }
    const row = storage.open(place.home).log.get(userIndexId);
    if (row === null) {
      privates.delete(userIndexId);
      return docs;
    }
    let entry = privates.get(userIndexId);
    if (
      entry === undefined ||
      entry.generation !== row.generation ||
      entry.headSeq !== row.headSeq
    ) {
      const decoded = decodePrivateEntry(
        storage,
        userIndexId,
        row.generation,
        row.headSeq,
      );
      if (decoded === null) {
        privates.delete(userIndexId);
        return docs;
      }
      privates.set(userIndexId, decoded);
      entry = decoded;
    }
    for (const item of entry.docs) {
      const docPlace = storage.directory.placeOf(item.docId);
      if (
        docPlace === null ||
        docPlace.home.kind !== "project" ||
        docPlace.home.id !== item.projectId
      )
        continue;
      docs.set(item.docId, {
        docId: item.docId,
        workspaceIndexId: null,
        kind: item.kind,
        projectKind: item.projectKind,
        projectTitle: item.projectTitle,
        title: item.title,
        folderIds: [],
        changedAt: item.changedAt,
      });
    }
    return docs;
  }

  return {
    readWorkspace,
    readPrivateFolder,
    collectAll() {
      const all = new Map<string, IndexedDocMeta>();
      for (const wsIndexId of allWorkspaceIndexIds(storage)) {
        const ws = readWorkspace(wsIndexId);
        for (const [docId, meta] of ws.docs) all.set(docId, meta);
      }
      for (const home of storage.directory.homes()) {
        if (home.kind !== "user") continue;
        for (const [docId, meta] of readPrivateFolder(home.id))
          if (!all.has(docId)) all.set(docId, meta);
      }
      return all;
    },
    clear() {
      workspaces.clear();
      privates.clear();
    },
  };
}
