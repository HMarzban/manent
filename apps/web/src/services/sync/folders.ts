// The folders of each workspace the person can open, kept in the workspace's index.
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { isFields } from "./device-memory.ts";
import { readWorkspace } from "./index-entries.ts";
import type { DocumentEntry } from "./index-entries.ts";
import { liveMap } from "./private-index.ts";

export const FOLDER_NAME_LIMIT = 200;

export interface FolderEntry {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly createdAt: number;
  readonly createdByUserId: string;
}

export type FolderNameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: "empty" | "too_long" };

export interface Folders {
  list(workspaceId: string): Subscribable<readonly FolderEntry[]>;
  projectFolders(
    workspaceId: string,
  ): Subscribable<ReadonlyMap<string, string | null>>;
  documents(
    workspaceId: string,
  ): Subscribable<ReadonlyMap<string, DocumentEntry>>;
  create(
    workspaceId: string,
    input: {
      readonly name: string;
      readonly parentId: string | null;
      readonly userId: string;
      readonly now: number;
      readonly id: string;
    },
  ): Promise<FolderEntry>;
  rename(
    workspaceId: string,
    folderId: string,
    name: string,
  ): Promise<FolderNameCheck>;
  moveProject(
    workspaceId: string,
    projectId: string,
    folderId: string | null,
  ): Promise<{ readonly previousFolderId: string | null }>;
}

/** Validates a folder name against the server's rules (1..200 trimmed characters). */
export function validateFolderName(raw: string): FolderNameCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > FOLDER_NAME_LIMIT)
    return { ok: false, reason: "too_long" };
  return { ok: true, name: trimmed };
}

/** Folders sorted alphabetically by name, then id. */
export function sortedFolders(folders: readonly FolderEntry[]): FolderEntry[] {
  return folders.toSorted(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}

/** Direct children of `parentId`; when `parentId` is null, also includes folders whose parent is absent. */
export function childFoldersOf(
  folders: readonly FolderEntry[],
  parentId: string | null,
): FolderEntry[] {
  const ids = new Set(folders.map((folder) => folder.id));
  return sortedFolders(
    folders.filter((folder) =>
      parentId === null
        ? folder.parentId === null || !ids.has(folder.parentId)
        : folder.parentId === parentId,
    ),
  );
}

/** Outer-first names along the path from the root to `folderId`. */
export function folderPathNames(
  folders: readonly FolderEntry[],
  folderId: string,
): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const entry = byId.get(current);
    if (entry === undefined) break;
    names.push(entry.name);
    current = entry.parentId;
  }
  return names.toReversed();
}

/** Ancestor folder ids of `folderId`, excluding `folderId` itself. */
export function folderAncestorIds(
  folders: readonly FolderEntry[],
  folderId: string | null,
): string[] {
  if (folderId === null) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ids: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return ids;
}

/** Groups `items` by each item's folder id (falling back to null when the folder does not exist). */
export function groupByFolder<T extends { readonly projectId: string }>(
  items: readonly T[],
  projectFolders: ReadonlyMap<string, string | null>,
  folders: readonly FolderEntry[],
): Map<string | null, T[]> {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const grouped = new Map<string | null, T[]>();
  for (const item of items) {
    const raw = projectFolders.get(item.projectId) ?? null;
    const key = raw !== null && folderIds.has(raw) ? raw : null;
    const list = grouped.get(key);
    if (list === undefined) grouped.set(key, [item]);
    else list.push(item);
  }
  return grouped;
}

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

function readFolder(id: string, value: unknown): FolderEntry | null {
  if (!isFields(value)) return null;
  const { name, parentId, createdAt, createdByUserId } = value;
  if (typeof name !== "string" || typeof createdByUserId !== "string")
    return null;
  if (!isInstant(createdAt)) return null;
  if (
    parentId !== null &&
    parentId !== undefined &&
    typeof parentId !== "string"
  )
    return null;
  return {
    id,
    name,
    parentId: parentId ?? null,
    createdAt,
    createdByUserId,
  };
}

function readFoldersMap(map: JsonMapView): FolderEntry[] {
  const list: FolderEntry[] = [];
  for (const [id, value] of Object.entries(map.entries())) {
    const entry = readFolder(id, value);
    if (entry !== null) list.push(entry);
  }
  return sortedFolders(list);
}

type Value<T> = Subscribable<T> & { set(value: T): void };

interface WorkspaceSlot {
  readonly folders: Value<readonly FolderEntry[]>;
  readonly projectFolders: Value<ReadonlyMap<string, string | null>>;
  readonly documents: Value<ReadonlyMap<string, DocumentEntry>>;
  readonly handle: Promise<DocHandle>;
}

function openWorkspaceSlot(
  client: Promise<SyncClient>,
  workspaceId: string,
): WorkspaceSlot {
  const folders = createValue<readonly FolderEntry[]>([]);
  const projectFolders = createValue<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  const documents = createValue<ReadonlyMap<string, DocumentEntry>>(new Map());
  const handle = client.then((sync) =>
    sync.open(indexDocId("workspace", workspaceId), {
      create: {
        kind: "index",
        home: workspaceHome(workspaceId),
        workspaceId: null,
      },
    }),
  );
  void handle.then(
    (opened) => {
      const folderMap = liveMap(opened, "folders");
      const projectMap = liveMap(opened, "projects");
      const documentMap = liveMap(opened, "documents");
      const refreshFolders = (): void => {
        folders.set(readFoldersMap(folderMap));
      };
      const refreshWorkspace = (): void => {
        const parsed = readWorkspace({
          projects: projectMap,
          documents: documentMap,
        });
        const map = new Map<string, string | null>();
        for (const [projectId, entry] of parsed.projects)
          map.set(projectId, entry.folderId);
        projectFolders.set(map);
        documents.set(parsed.documents);
      };
      folderMap.subscribe(refreshFolders);
      projectMap.subscribe(refreshWorkspace);
      documentMap.subscribe(refreshWorkspace);
      refreshFolders();
      refreshWorkspace();
    },
    () => {
      // workspace index failed to open; lists remain empty until retried
    },
  );
  return { folders, projectFolders, documents, handle };
}

const renamingFolder = createValue<string | null>(null);

/** The folder id currently being renamed in place; null when none is. */
export const renamingFolderId: Subscribable<string | null> = renamingFolder;

export function startRenameFolder(folderId: string): void {
  renamingFolder.set(folderId);
}

export function stopRenameFolder(): void {
  renamingFolder.set(null);
}

/** Workspace folder tree and project-folder assignment backed by each workspace's CRDT index. */
export function createFolders(options: {
  client: Promise<SyncClient>;
}): Folders {
  const slots = new Map<string, WorkspaceSlot>();
  const slotOf = (workspaceId: string): WorkspaceSlot => {
    const existing = slots.get(workspaceId);
    if (existing !== undefined) return existing;
    const created = openWorkspaceSlot(options.client, workspaceId);
    slots.set(workspaceId, created);
    return created;
  };
  return {
    list: (workspaceId) => slotOf(workspaceId).folders,
    projectFolders: (workspaceId) => slotOf(workspaceId).projectFolders,
    documents: (workspaceId) => slotOf(workspaceId).documents,
    async create(workspaceId, input) {
      const checked = validateFolderName(input.name);
      if (!checked.ok) throw new RangeError(`folder name is ${checked.reason}`);
      const handle = await slotOf(workspaceId).handle;
      const entry: FolderEntry = {
        id: input.id,
        name: checked.name,
        parentId: input.parentId,
        createdAt: input.now,
        createdByUserId: input.userId,
      };
      liveMap(handle, "folders").set(input.id, {
        name: entry.name,
        parentId: entry.parentId,
        createdAt: entry.createdAt,
        createdByUserId: entry.createdByUserId,
      });
      return entry;
    },
    async rename(workspaceId, folderId, name) {
      const checked = validateFolderName(name);
      if (!checked.ok) return checked;
      const handle = await slotOf(workspaceId).handle;
      const map = liveMap(handle, "folders");
      const current = readFolder(folderId, map.get(folderId));
      if (current === null) return checked;
      map.set(folderId, {
        name: checked.name,
        parentId: current.parentId,
        createdAt: current.createdAt,
        createdByUserId: current.createdByUserId,
      });
      return checked;
    },
    async moveProject(workspaceId, projectId, folderId) {
      const handle = await slotOf(workspaceId).handle;
      const map = liveMap(handle, "projects");
      const raw = map.get(projectId);
      if (!isFields(raw))
        throw new RangeError(`project ${projectId} is not in ${workspaceId}`);
      const previousFolderId =
        typeof raw.folderId === "string" ? raw.folderId : null;
      map.set(projectId, { ...raw, folderId });
      return { previousFolderId };
    },
  };
}
