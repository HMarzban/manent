// Workspace scope resolution and committed-document loading for the Public API, corroborated against server-held directory state.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { indexDocId, isDocId, isDocKind } from "@manent/sync-protocol";
import type {
  DocKind,
  PublicApiDocumentEntry,
  PublicApiFolderEntry,
  PublicApiFolderResponse,
  PublicApiProjectEntry,
} from "@manent/sync-protocol";

export interface ResolvedWorkspaceDoc {
  readonly docId: string;
  readonly title: string;
  readonly kind: DocKind;
  readonly home: Home;
}

/** Loads a document's committed state (checkpoint + tail); caller must destroy the returned CrdtDoc. */
export function committedDoc(
  storage: Storage,
  home: Home,
  docId: string,
): CrdtDoc | null {
  const file = storage.open(home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  try {
    const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0, {
      quarantine: false,
    });
    for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
    discardPending(doc);
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

function isInPrivateFolder(
  storage: Storage,
  userId: string,
  docId: string,
): boolean {
  const privateIndexId = indexDocId("user", userId);
  const place = storage.directory.placeOf(privateIndexId);
  if (place === null) return false;
  const doc = committedDoc(storage, place.home, privateIndexId);
  if (doc === null) return false;
  try {
    const entry = jsonMap(doc, "private_folder").get(docId);
    return entry !== null && entry !== undefined;
  } finally {
    doc.destroy();
  }
}

/**
 * Verifies against server-held storage state that `docId` is a live, non-trashed, non-private document
 * genuinely belonging to `expectedProjectId` in workspace `wsIndexId`.
 * Defeats cross-workspace CRDT index bait, Private-folder leaks, `user:` homes, and Trash leaks.
 */
function verifyWorkspaceDoc(
  storage: Storage,
  wsIndexId: string,
  wsMembers: ReadonlySet<string>,
  wsOwners: readonly string[],
  docId: string,
  expectedProjectId: string,
): { home: Home; kind: DocKind } | null {
  if (!isDocId(docId)) return null;
  if (storage.directory.tombstoneOf(docId) !== null) return null;
  if (storage.trash.get(docId) !== null) return null;

  const place = storage.directory.placeOf(docId);
  if (
    place === null ||
    place.home.kind !== "project" ||
    place.home.id !== expectedProjectId ||
    place.kind === "private" ||
    place.kind === "index" ||
    place.kind === "comments" ||
    !isDocKind(place.kind)
  ) {
    return null;
  }

  const owners = storage.directory
    .rolesOf(docId)
    .filter((row) => row.role === "owner");
  if (
    owners.length === 0 ||
    !owners.every((o) => {
      const wsRole = storage.directory.roleOf(wsIndexId, o.userId)?.role;
      return wsRole === "owner" || wsRole === "edit";
    })
  ) {
    return null;
  }
  if (
    wsOwners.length === 0 ||
    !wsOwners.some(
      (ownerId) => storage.directory.roleOf(docId, ownerId) !== null,
    )
  ) {
    return null;
  }
  for (const owner of owners) {
    if (isInPrivateFolder(storage, owner.userId, docId)) return null;
  }

  const workspaceGrantees = storage.shareLinks
    .grantsOf(docId)
    .filter((grant) => grant.source === "workspace");
  if (
    workspaceGrantees.length > 0 &&
    !workspaceGrantees.every((grant) => wsMembers.has(grant.userId))
  ) {
    return null;
  }

  return { home: place.home, kind: place.kind };
}

function readStringField(entry: object, key: string): string | null {
  const value: unknown = Reflect.get(entry, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isTrashedEntry(entry: object): boolean {
  const trashedAt: unknown = Reflect.get(entry, "trashedAt");
  return trashedAt !== undefined && trashedAt !== null;
}

const compareByName = (
  a: { name: string; id: string },
  b: { name: string; id: string },
): number =>
  a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lists child folders, projects, and live workspace documents at `folderId` (null = top level)
 * for `workspaceId`. Returns null if a non-null `folderId` does not exist in this workspace.
 */
export function listWorkspaceFolder(
  storage: Storage,
  workspaceId: string,
  folderId: string | null,
): PublicApiFolderResponse | null {
  const wsIndexId = indexDocId("workspace", workspaceId);
  const place = storage.directory.placeOf(wsIndexId);
  if (place === null) {
    return folderId === null ? { folders: [], projects: [] } : null;
  }
  const wsDoc = committedDoc(storage, place.home, wsIndexId);
  if (wsDoc === null) {
    return folderId === null ? { folders: [], projects: [] } : null;
  }

  const wsRoleRows = storage.directory.rolesOf(wsIndexId);
  const wsMembers = new Set(wsRoleRows.map((row) => row.userId));
  const wsOwners = wsRoleRows
    .filter((row) => row.role === "owner")
    .map((row) => row.userId);

  try {
    const foldersMap = jsonMap(wsDoc, "folders").entries();
    const folderIds = new Set<string>();
    const childFolders: { folderId: string; name: string }[] = [];

    for (const [id, raw] of Object.entries(foldersMap)) {
      if (typeof raw !== "object" || raw === null) continue;
      if (isTrashedEntry(raw)) continue;
      const name =
        readStringField(raw, "name") ?? readStringField(raw, "title") ?? id;
      const parentId =
        readStringField(raw, "parentId") ??
        readStringField(raw, "parentFolderId");
      folderIds.add(id);
      if (parentId === folderId) {
        childFolders.push({ folderId: id, name });
      }
    }

    if (folderId !== null && !folderIds.has(folderId)) return null;

    const projectsMap = jsonMap(wsDoc, "projects").entries();
    const matchedProjects = new Map<
      string,
      { title: string; documents: PublicApiDocumentEntry[] }
    >();
    for (const [projectId, raw] of Object.entries(projectsMap)) {
      if (!isDocId(projectId) || typeof raw !== "object" || raw === null) {
        continue;
      }
      if (isTrashedEntry(raw)) continue;
      const projFolderId = readStringField(raw, "folderId");
      if (projFolderId !== folderId) continue;
      const title = readStringField(raw, "title") ?? projectId;
      matchedProjects.set(projectId, { title, documents: [] });
    }

    const docsMap = jsonMap(wsDoc, "documents").entries();
    for (const [docId, raw] of Object.entries(docsMap)) {
      if (typeof raw !== "object" || raw === null) continue;
      if (isTrashedEntry(raw)) continue;
      const projectId = readStringField(raw, "projectId");
      if (projectId === null) continue;
      const project = matchedProjects.get(projectId);
      if (project === undefined) continue;

      const verified = verifyWorkspaceDoc(
        storage,
        wsIndexId,
        wsMembers,
        wsOwners,
        docId,
        projectId,
      );
      if (verified === null) continue;
      const title = readStringField(raw, "title") ?? docId;
      project.documents.push({ docId, title, kind: verified.kind });
    }

    const folders: PublicApiFolderEntry[] = childFolders.toSorted((a, b) =>
      compareByName(
        { name: a.name, id: a.folderId },
        { name: b.name, id: b.folderId },
      ),
    );
    const projects: PublicApiProjectEntry[] = [...matchedProjects.entries()]
      .map(([projectId, data]) => ({
        projectId,
        title: data.title,
        documents: data.documents.toSorted((a, b) =>
          compareByName(
            { name: a.title, id: a.docId },
            { name: b.title, id: b.docId },
          ),
        ),
      }))
      .toSorted((a, b) =>
        compareByName(
          { name: a.title, id: a.projectId },
          { name: b.title, id: b.projectId },
        ),
      );

    return { folders, projects };
  } finally {
    wsDoc.destroy();
  }
}

/**
 * Resolves `docId` inside `workspaceId` strictly from corroborated server-held state and workspace index.
 * Returns null (404) if absent, trashed, tombstoned, Private-folder, `user:`-homed, or in another workspace.
 */
export function resolveWorkspaceDocument(
  storage: Storage,
  workspaceId: string,
  docId: string,
): ResolvedWorkspaceDoc | null {
  if (!isDocId(docId)) return null;
  const wsIndexId = indexDocId("workspace", workspaceId);
  const wsPlace = storage.directory.placeOf(wsIndexId);
  if (wsPlace === null) return null;
  const wsDoc = committedDoc(storage, wsPlace.home, wsIndexId);
  if (wsDoc === null) return null;

  const wsRoleRows = storage.directory.rolesOf(wsIndexId);
  const wsMembers = new Set(wsRoleRows.map((row) => row.userId));
  const wsOwners = wsRoleRows
    .filter((row) => row.role === "owner")
    .map((row) => row.userId);

  try {
    const entry = jsonMap(wsDoc, "documents").get(docId);
    if (typeof entry !== "object" || entry === null) return null;
    if (isTrashedEntry(entry)) return null;
    const projectId = readStringField(entry, "projectId");
    if (projectId === null || !isDocId(projectId)) return null;
    const projectEntry = jsonMap(wsDoc, "projects").get(projectId);
    if (
      typeof projectEntry !== "object" ||
      projectEntry === null ||
      isTrashedEntry(projectEntry)
    ) {
      return null;
    }

    const verified = verifyWorkspaceDoc(
      storage,
      wsIndexId,
      wsMembers,
      wsOwners,
      docId,
      projectId,
    );
    if (verified === null) return null;
    const title = readStringField(entry, "title") ?? docId;
    return { docId, title, kind: verified.kind, home: verified.home };
  } finally {
    wsDoc.destroy();
  }
}
