// Server-held metadata and CRDT document loading for full-text search indexing and filtering.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { indexDocId, isDocKind } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";

export interface FolderInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface IndexedDocMeta {
  readonly docId: string;
  /** Canonical workspace index docId (`indexDocId("workspace", slug)`); null for Private-folder docs. */
  readonly workspaceIndexId: string | null;
  readonly kind: DocKind;
  readonly projectKind: string | null;
  readonly projectTitle: string | null;
  readonly title: string;
  readonly folderIds: readonly string[];
  readonly changedAt: number;
}

export interface WorkspaceMetadata {
  readonly workspaceIndexId: string;
  readonly folders: ReadonlyMap<string, FolderInfo>;
  readonly docs: ReadonlyMap<string, IndexedDocMeta>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

/** Loads a placed document from its newest checkpoint and log tail without quarantining; caller must destroy it. */
export function loadDocFromStorage(
  storage: Storage,
  docId: string,
  home: Home,
): { doc: CrdtDoc; generation: number; seq: number } | null {
  const { log, checkpoints } = storage.open(home);
  const row = log.get(docId);
  if (row === null) return null;
  const checkpoint = checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  try {
    const from = checkpoint?.seq ?? 0;
    const { rows } = log.tail(docId, row.generation, from, {
      quarantine: false,
    });
    for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
    discardPending(doc);
    return {
      doc,
      generation: row.generation,
      seq: rows.at(-1)?.seq ?? from,
    };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

/** All placed, non-tombstoned workspace index ids in storage. */
export function allWorkspaceIndexIds(storage: Storage): string[] {
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

/** Reads folders, projects, and documents metadata from one workspace index document. */
export function readWorkspaceMetadata(
  storage: Storage,
  workspaceIndexId: string,
): WorkspaceMetadata {
  const folders = new Map<string, FolderInfo>();
  const docs = new Map<string, IndexedDocMeta>();
  const place = storage.directory.placeOf(workspaceIndexId);
  if (
    place === null ||
    storage.directory.tombstoneOf(workspaceIndexId) !== null
  )
    return { workspaceIndexId, folders, docs };
  const loaded = loadDocFromStorage(storage, workspaceIndexId, place.home);
  if (loaded === null) return { workspaceIndexId, folders, docs };
  try {
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
      const docPlace = storage.directory.placeOf(docId);
      if (
        docPlace === null ||
        docPlace.home.kind !== "project" ||
        projectId === null ||
        docPlace.home.id !== projectId ||
        project === undefined
      )
        continue;
      const changedAt = isSafeInt(raw.editedAt)
        ? raw.editedAt
        : isSafeInt(raw.createdAt)
          ? raw.createdAt
          : 0;
      docs.set(docId, {
        docId,
        workspaceIndexId,
        kind: raw.kind,
        projectKind: project.kind,
        projectTitle: project.title,
        title: raw.title,
        folderIds: ancestorChain(project.folderId, folders),
        changedAt,
      });
    }
  } finally {
    loaded.doc.destroy();
  }
  return { workspaceIndexId, folders, docs };
}

/** Reads Private-folder document metadata from `userId`'s private index (`private_folder` map). */
export function readPrivateFolderMetadata(
  storage: Storage,
  userId: string,
): Map<string, IndexedDocMeta> {
  const docs = new Map<string, IndexedDocMeta>();
  const userIndexId = indexDocId("user", userId);
  const place = storage.directory.placeOf(userIndexId);
  if (place === null || storage.directory.tombstoneOf(userIndexId) !== null)
    return docs;
  const loaded = loadDocFromStorage(storage, userIndexId, place.home);
  if (loaded === null) return docs;
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
      const docPlace = storage.directory.placeOf(docId);
      if (
        docPlace === null ||
        docPlace.home.kind !== "project" ||
        docPlace.home.id !== raw.projectId
      )
        continue;
      const project = projects.get(raw.projectId);
      const changedAt = isSafeInt(raw.editedAt)
        ? raw.editedAt
        : isSafeInt(raw.createdAt)
          ? raw.createdAt
          : 0;
      docs.set(docId, {
        docId,
        workspaceIndexId: null,
        kind: raw.kind,
        projectKind: project?.kind ?? null,
        projectTitle: project?.title ?? null,
        title: raw.title,
        folderIds: [],
        changedAt,
      });
    }
  } finally {
    loaded.doc.destroy();
  }
  return docs;
}

/** Resolves folder names (case-insensitive) to matching folder ids plus all nested descendant folder ids. */
export function resolveFolderIds(
  folderNames: readonly string[],
  folderMaps: readonly ReadonlyMap<string, FolderInfo>[],
): string[] | null {
  if (folderNames.length === 0) return [];
  let intersection: Set<string> | null = null;
  for (const name of folderNames) {
    const needle = name.toLowerCase();
    const matched = new Set<string>();
    for (const folders of folderMaps) {
      const children = new Map<string, string[]>();
      const seeds: string[] = [];
      for (const folder of folders.values()) {
        if (folder.name.toLowerCase() === needle) seeds.push(folder.id);
        if (folder.parentId !== null) {
          const list = children.get(folder.parentId) ?? [];
          list.push(folder.id);
          children.set(folder.parentId, list);
        }
      }
      const queue = [...seeds];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (matched.has(id)) continue;
        matched.add(id);
        for (const childId of children.get(id) ?? []) queue.push(childId);
      }
    }
    if (matched.size === 0) return null;
    if (intersection === null) {
      intersection = matched;
    } else {
      const next = new Set<string>();
      for (const id of intersection) if (matched.has(id)) next.add(id);
      intersection = next;
      if (intersection.size === 0) return null;
    }
  }
  return intersection === null ? [] : [...intersection];
}

export function metaFingerprint(meta: IndexedDocMeta): string {
  return JSON.stringify([
    meta.workspaceIndexId,
    meta.kind,
    meta.projectKind,
    meta.title,
    meta.folderIds,
    meta.changedAt,
  ]);
}

export function collectAllMetadata(
  storage: Storage,
): Map<string, IndexedDocMeta> {
  const all = new Map<string, IndexedDocMeta>();
  for (const wsIndexId of allWorkspaceIndexIds(storage)) {
    const ws = readWorkspaceMetadata(storage, wsIndexId);
    for (const [docId, meta] of ws.docs) all.set(docId, meta);
  }
  for (const home of storage.directory.homes()) {
    if (home.kind !== "user") continue;
    for (const [docId, meta] of readPrivateFolderMetadata(storage, home.id))
      if (!all.has(docId)) all.set(docId, meta);
  }
  return all;
}

export function fallbackMeta(
  docId: string,
  kind: DocKind,
  storage: Storage,
): IndexedDocMeta {
  const place = storage.directory.placeOf(docId);
  const row = place === null ? null : storage.open(place.home).log.get(docId);
  return {
    docId,
    workspaceIndexId: null,
    kind,
    projectKind: null,
    projectTitle: null,
    title: "",
    folderIds: [],
    changedAt: row?.createdAt ?? 0,
  };
}
