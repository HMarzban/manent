// Server-held metadata helpers and CRDT document loading for full-text search indexing and filtering.
import { ORIGIN_LOAD, createDoc, discardPending, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { isDocKind } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import type { Committed } from "../sync/write-path-ports.ts";
import { SEARCH_EXTRACTORS } from "./extractors.ts";

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

export function extractForKind(
  kind: DocKind,
  doc: CrdtDoc,
): { text: string; editorText: string } | null {
  const matching = SEARCH_EXTRACTORS.filter((e) => e.kind === kind);
  if (matching.length === 0) return null;
  const text = matching[0]!.text(doc);
  const editorText = matching
    .map((e) => e.editorText?.(doc) ?? "")
    .filter((s) => s.length > 0)
    .join("\n");
  return { text, editorText };
}

export function collectSearchableIds(storage: Storage): string[] {
  const ids: string[] = [];
  for (const home of storage.directory.homes()) {
    for (const docId of storage.directory.documentsIn(home)) {
      if (storage.directory.tombstoneOf(docId) !== null) continue;
      const place = storage.directory.placeOf(docId);
      if (
        place !== null &&
        isDocKind(place.kind) &&
        SEARCH_EXTRACTORS.some((e) => e.kind === place.kind)
      )
        ids.push(docId);
    }
  }
  return ids;
}

/** True when an index commit can change search metadata; ignores `user:*` writes that only touch `continue`/`on_device`/etc. */
export function isSearchRelevantIndexCommit(committed: Committed): boolean {
  if (committed.room.kind !== "index") return false;
  if (committed.room.home.kind !== "user") return true;
  if (committed.report === null) return true;
  return (
    committed.report.maps.includes("private_folder") ||
    committed.report.maps.includes("folders")
  );
}
