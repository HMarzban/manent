// Resolves the owning workspace and display title of a script document from server-held directory state and workspace indexes.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";

export interface ScriptWorkspaceInfo {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly title: string;
}

function committedDoc(
  storage: Storage,
  home: Home,
  docId: string,
): CrdtDoc | null {
  const file = storage.open(home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0, {
    quarantine: false,
  });
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  discardPending(doc);
  return doc;
}

function isInPrivateFolder(
  storage: Storage,
  userId: string,
  scriptDocId: string,
): boolean {
  const privateIndexId = indexDocId("user", userId);
  const place = storage.directory.placeOf(privateIndexId);
  if (place === null) return false;
  const doc = committedDoc(storage, place.home, privateIndexId);
  if (doc === null) return false;
  try {
    const entry = jsonMap(doc, "private_folder").get(scriptDocId);
    return entry !== null && entry !== undefined;
  } finally {
    doc.destroy();
  }
}

interface CandidateMatch {
  readonly info: ScriptWorkspaceInfo;
  readonly grantOverlap: number;
  readonly senderInWorkspace: number;
  readonly ownersEditable: number;
}

function compareCandidates(a: CandidateMatch, b: CandidateMatch): number {
  return (
    b.grantOverlap - a.grantOverlap ||
    b.senderInWorkspace - a.senderInWorkspace ||
    b.ownersEditable - a.ownersEditable ||
    (a.info.workspaceId < b.info.workspaceId
      ? -1
      : a.info.workspaceId > b.info.workspaceId
        ? 1
        : 0)
  );
}

/**
 * Resolves the workspace and title of `scriptDocId` by corroborating server-held directory state
 * (placement, owners, private-folder exclusion, workspace membership) with the committed workspace index.
 * Returns null for Private-folder scripts, user-homed documents, or forged cross-workspace index entries.
 */
export function findScriptWorkspace(
  storage: Storage,
  users: Directory,
  scriptDocId: string,
  projectId: string,
  senderUserId: string,
): ScriptWorkspaceInfo | null {
  const scriptPlace = storage.directory.placeOf(scriptDocId);
  if (
    scriptPlace === null ||
    scriptPlace.home.kind !== "project" ||
    scriptPlace.home.id !== projectId ||
    scriptPlace.kind === "private" ||
    scriptPlace.kind === "index" ||
    scriptPlace.kind === "comments"
  ) {
    return null;
  }

  const owners = storage.directory
    .rolesOf(scriptDocId)
    .filter((row) => row.role === "owner");
  if (owners.length === 0) return null;

  for (const owner of owners) {
    if (isInPrivateFolder(storage, owner.userId, scriptDocId)) return null;
  }

  const workspaceGrantees = storage.shareLinks
    .grantsOf(scriptDocId)
    .filter((grant) => grant.source === "workspace")
    .map((grant) => grant.userId);

  const candidates = new Map<string, string>();
  for (const ws of users.workspacesOf(owners[0]!.userId)) {
    if (!candidates.has(ws.id)) candidates.set(ws.id, ws.name);
  }

  const matches: CandidateMatch[] = [];
  for (const [workspaceId, workspaceName] of candidates) {
    const wsIndexId = indexDocId("workspace", workspaceId);
    const ownerRoles = owners.map((owner) =>
      storage.directory.roleOf(wsIndexId, owner.userId),
    );
    if (ownerRoles.some((role) => role === null)) continue;

    const place = storage.directory.placeOf(wsIndexId);
    if (place === null) continue;
    const doc = committedDoc(storage, place.home, wsIndexId);
    if (doc === null) continue;
    try {
      const projectEntry = jsonMap(doc, "projects").get(projectId);
      if (typeof projectEntry !== "object" || projectEntry === null) continue;
      const entry = jsonMap(doc, "documents").get(scriptDocId);
      if (typeof entry !== "object" || entry === null) continue;
      const entryProjectId: unknown = Reflect.get(entry, "projectId");
      if (entryProjectId !== projectId) continue;

      const grantOverlap = workspaceGrantees.filter(
        (userId) => storage.directory.roleOf(wsIndexId, userId) !== null,
      ).length;
      if (workspaceGrantees.length > 0 && grantOverlap === 0) continue;

      const rawTitle: unknown = Reflect.get(entry, "title");
      const title =
        typeof rawTitle === "string" && rawTitle.length > 0
          ? rawTitle
          : scriptDocId;
      const senderInWorkspace =
        storage.directory.roleOf(wsIndexId, senderUserId) !== null ? 1 : 0;
      const ownersEditable = ownerRoles.every(
        (role) => role?.role === "owner" || role?.role === "edit",
      )
        ? 1
        : 0;
      matches.push({
        info: { workspaceId, workspaceName, title },
        grantOverlap,
        senderInWorkspace,
        ownersEditable,
      });
    } finally {
      doc.destroy();
    }
  }

  if (matches.length === 0) return null;
  const best = matches.toSorted(compareCandidates)[0]!;
  return best.info;
}
