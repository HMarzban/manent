// The workspace administration service: members, role changes with workspace-source propagation, and masked settings.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import {
  DOC_ROLES,
  indexDocId,
  isDocId,
  isWorkspaceId,
} from "@manent/sync-protocol";
import type {
  Capability,
  DocRole,
  WorkspacePeopleResponse,
  WorkspacePerson,
  WorkspaceRoleResponse,
  WorkspaceSettingsResponse,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import { OWNER_CAPABILITIES } from "../sync/access.ts";
import type { SyncService } from "../sync/ports.ts";
import { maskSettingValue } from "./mask.ts";

export type WorkspaceRefusal =
  "bad_request" | "forbidden" | "invalid" | "not_found";

export type WorkspaceOutcome<T> =
  { ok: true; value: T } | { ok: false; code: WorkspaceRefusal };

/** Every decision is taken strictly from server-held storage state and the session's caller userId. */
export interface WorkspaceService {
  /** Lists members of workspaceId sorted by display name; refuses non-members with forbidden. */
  people(
    callerUserId: string,
    workspaceId: string,
  ): WorkspaceOutcome<WorkspacePeopleResponse>;
  /** Changes targetUserId's role in workspaceId and propagates to workspace-sourced documents; owner only, refuses last-owner demotion with invalid. */
  changeRole(
    callerUserId: string,
    workspaceId: string,
    targetUserId: string,
    nextRole: DocRole,
  ): WorkspaceOutcome<WorkspaceRoleResponse>;
  /** Lists workspace settings: value is always null for non-owners and masked for owners. */
  settings(
    callerUserId: string,
    workspaceId: string,
  ): WorkspaceOutcome<WorkspaceSettingsResponse>;
}

const refused = (code: WorkspaceRefusal) => ({ ok: false, code }) as const;

const isDocRole = (value: string): value is DocRole =>
  DOC_ROLES.some((role) => role === value);

const comparePeople = (a: WorkspacePerson, b: WorkspacePerson): number =>
  a.name.localeCompare(b.name) ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

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

interface WorkspaceIndexDocs {
  readonly docIds: readonly string[];
  readonly validProjects: ReadonlySet<string>;
}

/**
 * Candidate documents belonging to workspaceId, read from its committed workspace index's `documents`
 * and `projects` maps. Every entry is later corroborated against server-held storage authority.
 */
function workspaceDocIds(
  storage: Storage,
  wsIndexId: string,
): WorkspaceIndexDocs {
  const place = storage.directory.placeOf(wsIndexId);
  if (place === null) return { docIds: [], validProjects: new Set() };
  const doc = committedDoc(storage, place.home, wsIndexId);
  if (doc === null) return { docIds: [], validProjects: new Set() };
  const validProjects = new Set<string>();
  const ids = new Set<string>();
  try {
    for (const projectId of jsonMap(doc, "projects").keys()) {
      if (isDocId(projectId)) validProjects.add(projectId);
    }
    const docsMap = jsonMap(doc, "documents");
    for (const docId of docsMap.keys()) {
      if (!isDocId(docId) || docId === wsIndexId) continue;
      const entry = docsMap.get(docId);
      if (typeof entry !== "object" || entry === null) continue;
      const entryProjectId: unknown = Reflect.get(entry, "projectId");
      if (
        typeof entryProjectId !== "string" ||
        !isDocId(entryProjectId) ||
        !validProjects.has(entryProjectId)
      ) {
        continue;
      }
      const docPlace = storage.directory.placeOf(docId);
      if (
        docPlace !== null &&
        docPlace.home.kind === "project" &&
        docPlace.home.id === entryProjectId
      ) {
        ids.add(docId);
      }
    }
    for (const projectId of validProjects) {
      for (const docId of storage.directory.documentsIn({
        kind: "project",
        id: projectId,
      })) {
        if (docId !== wsIndexId) ids.add(docId);
      }
    }
  } finally {
    doc.destroy();
  }
  return { docIds: [...ids], validProjects };
}

function nextCapabilities(
  previousRole: string,
  previousCaps: readonly string[],
  nextRole: DocRole,
): readonly string[] {
  if (nextRole === "owner") return OWNER_CAPABILITIES;
  if (
    previousRole === "owner" ||
    nextRole === "view" ||
    nextRole === "comment"
  ) {
    return [];
  }
  return previousCaps;
}

function propagateRoleChange(options: {
  readonly storage: Storage;
  readonly sync: () => SyncService;
  readonly wsIndexId: string;
  readonly callerUserId: string;
  readonly targetUserId: string;
  readonly nextRole: DocRole;
  readonly nextCaps: readonly string[];
}): void {
  const {
    storage,
    sync,
    wsIndexId,
    callerUserId,
    targetUserId,
    nextRole,
    nextCaps,
  } = options;
  const docRole: DocRole = nextRole === "owner" ? "edit" : nextRole;
  const wsMembers = new Set(
    storage.directory.rolesOf(wsIndexId).map((row) => row.userId),
  );
  const { docIds, validProjects } = workspaceDocIds(storage, wsIndexId);
  for (const docId of docIds) {
    const place = storage.directory.placeOf(docId);
    if (
      place === null ||
      place.home.kind !== "project" ||
      place.kind === "index" ||
      place.kind === "comments" ||
      place.kind === "private"
    ) {
      continue;
    }
    if (!validProjects.has(place.home.id)) continue;
    const callerDocRole = storage.directory.roleOf(docId, callerUserId)?.role;
    if (callerDocRole !== "owner" && callerDocRole !== "edit") continue;
    const owners = storage.directory
      .rolesOf(docId)
      .filter((row) => row.role === "owner");
    if (owners.length === 0 || !owners.every((o) => wsMembers.has(o.userId))) {
      continue;
    }
    const grant = storage.shareLinks
      .grantsOf(docId)
      .find((row) => row.userId === targetUserId);
    if (grant === undefined || grant.source !== "workspace") continue;
    storage.directory.setRole(docId, targetUserId, docRole, nextCaps);
    storage.shareLinks.grant(docId, targetUserId, docRole, "workspace");
    sync().membershipChanged(docId, targetUserId, docRole, callerUserId);
  }
}

/** Creates the workspace administration service over storage, the user directory, and sync. */
export function createWorkspaceService(options: {
  storage: Storage;
  users: Directory;
  sync: () => SyncService;
}): WorkspaceService {
  const { storage, users, sync } = options;
  const { directory } = storage;

  return {
    people(callerUserId, workspaceId) {
      if (!isWorkspaceId(workspaceId)) return refused("bad_request");
      const wsIndexId = indexDocId("workspace", workspaceId);
      if (directory.roleOf(wsIndexId, callerUserId) === null)
        return refused("forbidden");
      const people: WorkspacePerson[] = directory
        .rolesOf(wsIndexId)
        .flatMap(({ userId, role }) =>
          isDocRole(role)
            ? [{ userId, name: users.user(userId)?.name ?? userId, role }]
            : [],
        )
        .toSorted(comparePeople);
      return { ok: true, value: { people } };
    },

    changeRole(callerUserId, workspaceId, targetUserId, nextRole) {
      if (
        !isWorkspaceId(workspaceId) ||
        targetUserId.length === 0 ||
        !isDocRole(nextRole)
      )
        return refused("bad_request");
      const wsIndexId = indexDocId("workspace", workspaceId);
      const caller = directory.roleOf(wsIndexId, callerUserId);
      if (caller === null || caller.role !== "owner")
        return refused("forbidden");
      const target = directory.roleOf(wsIndexId, targetUserId);
      if (target === null) return refused("not_found");
      if (target.role === "owner" && nextRole !== "owner") {
        const owners = directory
          .rolesOf(wsIndexId)
          .filter((row) => row.role === "owner").length;
        if (owners <= 1) return refused("invalid");
      }
      if (target.role === nextRole) return { ok: true, value: { ok: true } };

      const nextCaps: readonly (Capability | string)[] = nextCapabilities(
        target.role,
        target.capabilities,
        nextRole,
      );
      directory.setRole(wsIndexId, targetUserId, nextRole, nextCaps);
      sync().membershipChanged(wsIndexId, targetUserId, nextRole, callerUserId);
      propagateRoleChange({
        storage,
        sync,
        wsIndexId,
        callerUserId,
        targetUserId,
        nextRole,
        nextCaps,
      });
      return { ok: true, value: { ok: true } };
    },

    settings(callerUserId, workspaceId) {
      if (!isWorkspaceId(workspaceId)) return refused("bad_request");
      const wsIndexId = indexDocId("workspace", workspaceId);
      const caller = directory.roleOf(wsIndexId, callerUserId);
      if (caller === null) return refused("forbidden");
      const isOwner = caller.role === "owner";
      const rows = storage.workspace.list(workspaceId);
      return {
        ok: true,
        value: {
          settings: rows.map((row) => ({
            key: row.key,
            on: row.value.length > 0,
            value: isOwner ? maskSettingValue(row.value) : null,
          })),
        },
      };
    },
  };
}
