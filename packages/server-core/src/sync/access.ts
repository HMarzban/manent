// Who may do what with a document: creating one, deleting one, and a person's access to one.
import type { Home, Storage } from "@manent/storage";
import {
  CAPABILITIES,
  DOC_ROLES,
  indexDocId,
  isDocId,
  isDocKind,
} from "@manent/sync-protocol";
import type {
  Capability,
  CreateDocumentResponse,
  DocKind,
  DocRole,
  ServerVersions,
} from "@manent/sync-protocol";
import { INDEX_KINDS } from "./index-docs.ts";

/** Every capability, in CAPABILITIES' order: what the person who makes a document holds. */
export const OWNER_CAPABILITIES: readonly Capability[] = Object.freeze([
  ...CAPABILITIES,
]);

/** The kinds that validate as a script, and so the kinds this server syncs. */
export const SYNCABLE_KINDS: readonly DocKind[] = Object.freeze([
  "script",
  "outline",
  "room_log",
  "ink",
  "private",
]);

export interface Access {
  role: DocRole;
  capabilities: Capability[];
}

export type ResolveResult =
  | { ok: true; access: Access; home: Home; kind: DocKind }
  | { ok: false; code: "deleted" | "forbidden" };

export type CreateResult =
  | { ok: true; document: CreateDocumentResponse }
  | {
      ok: false;
      code:
        | "bad_request"
        | "unsupported_kind"
        | "forbidden"
        | "deleted"
        | "exists_elsewhere";
    };

export type RemoveResult =
  { ok: true } | { ok: false; code: "bad_request" | "forbidden" | "not_found" };

export interface DocumentAccess {
  resolve(userId: string, docId: string): ResolveResult;
  /** `request` is a route's JSON body, not yet checked. */
  create(userId: string, request: unknown): CreateResult;
  remove(userId: string, request: unknown): RemoveResult;
}

type Field = "docId" | "kind" | "home";

function stringField(body: unknown, key: Field): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) return null;
  const value: unknown = Reflect.get(body, key);
  return typeof value === "string" ? value : null;
}

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The id of the index of the workspace a request names; null when it names none. */
function workspaceIndexOf(
  body: unknown,
): { ok: true; index: string | null } | { ok: false } {
  if (typeof body !== "object" || body === null || !("workspaceId" in body))
    return { ok: true, index: null };
  const value: unknown = Reflect.get(body, "workspaceId");
  return typeof value === "string" && WORKSPACE_ID.test(value)
    ? { ok: true, index: indexDocId("workspace", value) }
    : { ok: false };
}

const isDocRole = (value: string): value is DocRole =>
  DOC_ROLES.some((role) => role === value);
const isCapability = (value: string): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);

const keyOf = (home: Home): string => `${home.kind}:${home.id}`;

/**
 * `"user"` is the caller's own file; a private copy lives there and nowhere else, and so does
 * the caller's own index. Any other index is a workspace's, in the project home of its own id.
 */
function homeOf(
  userId: string,
  docId: string,
  kind: DocKind,
  home: string,
): Home | null {
  const own: Home = { kind: "user", id: userId };
  if (kind === "private") return home === "user" ? own : null;
  if (kind === "index" && home === "user")
    return docId === indexDocId("user", userId) ? own : null;
  const id = home.slice("project:".length);
  if (!home.startsWith("project:") || !isDocId(id)) return null;
  return kind === "index" && id !== docId ? null : { kind: "project", id };
}

type CreateCheck =
  | {
      ok: true;
      docId: string;
      kind: DocKind;
      home: Home;
      /** The index of the workspace whose roles the document takes; null for none. */
      index: string | null;
    }
  | Extract<CreateResult, { ok: false }>;

/** The request's fields, each well formed. */
function checkCreate(userId: string, request: unknown): CreateCheck {
  const docId = stringField(request, "docId");
  const kind = stringField(request, "kind");
  const given = stringField(request, "home");
  const workspace = workspaceIndexOf(request);
  if (!isDocId(docId) || kind === null || given === null || !workspace.ok)
    return { ok: false, code: "bad_request" };
  if (!isDocKind(kind) || ![...SYNCABLE_KINDS, ...INDEX_KINDS].includes(kind))
    return { ok: false, code: "unsupported_kind" };
  const home = homeOf(userId, docId, kind, given);
  const { index } = workspace;
  // a workspace is named only for a project's document: never by an index, nor in its index's own home
  const misplaced =
    index !== null &&
    (home?.kind !== "project" ||
      home.id === index ||
      INDEX_KINDS.includes(kind));
  if (home === null || misplaced) return { ok: false, code: "bad_request" };
  return { ok: true, docId, kind, home, index };
}

export function createDocumentAccess(options: {
  storage: Storage;
  versions: ServerVersions;
}): DocumentAccess {
  const { storage, versions } = options;
  const { directory } = storage;

  const canWrite = (docId: string, userId: string): boolean => {
    const role = directory.roleOf(docId, userId)?.role;
    return role === "owner" || role === "edit";
  };

  function resolve(userId: string, docId: string): ResolveResult {
    if (directory.tombstoneOf(docId) !== null)
      return { ok: false, code: "deleted" };
    const place = directory.placeOf(docId);
    const stored = directory.roleOf(docId, userId);
    if (place === null || stored === null)
      return { ok: false, code: "forbidden" };
    const { home, kind } = place;
    if (!isDocKind(kind) || !isDocRole(stored.role))
      return { ok: false, code: "forbidden" };
    if (kind === "private" && keyOf(home) !== `user:${userId}`)
      return { ok: false, code: "forbidden" };
    const capabilities = stored.capabilities.filter(isCapability);
    return {
      ok: true,
      access: { role: stored.role, capabilities },
      home,
      kind,
    };
  }

  /** Each other user's role on `index`, an owner's as `edit`, then the creator as owner. */
  function grant(docId: string, userId: string, index: string | null): void {
    const held = index === null ? [] : directory.rolesOf(index);
    for (const other of held)
      if (other.userId !== userId)
        directory.setRole(
          docId,
          other.userId,
          other.role === "owner" ? "edit" : other.role,
          other.capabilities,
        );
    directory.setRole(docId, userId, "owner", OWNER_CAPABILITIES);
  }

  function create(userId: string, request: unknown): CreateResult {
    const checked = checkCreate(userId, request);
    if (!checked.ok) return checked;
    const { docId, kind, home, index } = checked;
    if (directory.tombstoneOf(docId) !== null)
      return { ok: false, code: "deleted" };
    const place = directory.placeOf(docId);
    if (place !== null) {
      if (place.kind !== kind || keyOf(place.home) !== keyOf(home))
        return { ok: false, code: "exists_elsewhere" };
      if (directory.roleOf(docId, userId) === null)
        return { ok: false, code: "forbidden" };
    } else {
      if (index !== null && !canWrite(index, userId))
        return { ok: false, code: "forbidden" };
      const neighbours = directory.documentsIn(home);
      if (
        neighbours.length > 0 &&
        !neighbours.some((id) => canWrite(id, userId))
      )
        return { ok: false, code: "forbidden" };
      directory.place(docId, home, kind, userId);
    }
    // an existing row comes back unchanged, so a create cut short by a crash is finished here
    const row = storage.open(home).log.create({
      id: docId,
      kind,
      ownerUserId: kind === "private" ? userId : null,
      schemaVersion: versions.current.schema,
      engineVersion: versions.current.engine,
    });
    const created = place === null;
    if (created) grant(docId, userId, index);
    return {
      ok: true,
      document: {
        docId,
        kind,
        home: keyOf(home),
        generation: row.generation,
        created,
      },
    };
  }

  function remove(userId: string, request: unknown): RemoveResult {
    const docId = stringField(request, "docId");
    if (!isDocId(docId)) return { ok: false, code: "bad_request" };
    if (directory.tombstoneOf(docId) !== null) return { ok: true };
    if (directory.placeOf(docId) === null)
      return { ok: false, code: "not_found" };
    const stored = directory.roleOf(docId, userId);
    const allowed =
      stored !== null &&
      (stored.role === "owner" || stored.capabilities.includes("delete"));
    if (!allowed) return { ok: false, code: "forbidden" };
    directory.tombstone(docId, userId);
    return { ok: true };
  }

  return { resolve, create, remove };
}
