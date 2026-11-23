// Who may do what with a document: creating one, deleting one, and a person's access to one.
import type { Home, Storage } from "@manent/storage";
import {
  CAPABILITIES,
  DOC_ROLES,
  commentsDocId,
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
import { grantedCapabilities } from "../permissions/capabilities.ts";
import type { CapabilityGrant } from "../permissions/capabilities.ts";
import { INDEX_KINDS } from "./index-docs.ts";

/** Every capability, in CAPABILITIES' order: what the person who makes a document holds. */
export const OWNER_CAPABILITIES: readonly Capability[] = Object.freeze([
  ...CAPABILITIES,
]);

/** The kinds that validate and rebuild as a script. */
export const SYNCABLE_KINDS: readonly DocKind[] = Object.freeze([
  "script",
  "outline",
  "room_log",
  "ink",
  "private",
]);

/** The kinds besides an index that this server creates and syncs; a comments document or a rundown is never rebuilt. */
export const SYNCED_KINDS: readonly DocKind[] = Object.freeze([
  ...SYNCABLE_KINDS,
  "comments",
  "rundown",
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
  /** What the person may do with the document, as `resolve` gives it; null: no access. */
  capabilitiesOf(userId: string, docId: string): Capability[] | null;
  /** `request` is a route's JSON body, not yet checked. */
  create(userId: string, request: unknown): CreateResult;
  remove(userId: string, request: unknown): RemoveResult;
}

type Field = "docId" | "kind" | "home" | "scriptDocId";

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

/** Reads the role row a person's access to a document is taken from; null: they hold none. */
type RoleRow = (
  storage: Storage,
  docId: string,
  userId: string,
) => CapabilityGrant["stored"] | null;

const ownRole: RoleRow = (storage, docId, userId) =>
  storage.directory.roleOf(docId, userId);

/**
 * A comments document's id is its script's, hashed (`commentsDocId`), and it is made in the script's home: the
 * person holds the role they hold on that script, while the script is not deleted.
 */
const scriptRole: RoleRow = (storage, docId, userId) => {
  const { directory } = storage;
  const place = directory.placeOf(docId);
  const scriptId =
    place === null
      ? undefined
      : directory
          .documentsIn(place.home)
          .find((id) => commentsDocId(id) === docId);
  if (scriptId === undefined || directory.tombstoneOf(scriptId) !== null)
    return null;
  return directory.roleOf(scriptId, userId);
};

/** The kinds whose access is read from another document's row; a kind without a line reads its own. */
const ROLE_ROWS: Readonly<Partial<Record<DocKind, RoleRow>>> = Object.freeze({
  comments: scriptRole,
});

const keyOf = (home: Home): string => `${home.kind}:${home.id}`;

/**
 * `"user"` is the caller's own file; a private copy lives there and nowhere else, and so does
 * the caller's own index. Any other index is a workspace's, in the project home of its own id,
 * or a project's, in that project's home.
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
  const indexOfHome = id === docId || docId === indexDocId("project", id);
  return kind === "index" && !indexOfHome ? null : { kind: "project", id };
}

type CreateCheck =
  | {
      ok: true;
      docId: string;
      kind: DocKind;
      home: Home;
      /** The index of the workspace whose roles the document takes; null for none. */
      index: string | null;
      /** The script a comments document belongs to; null for any other kind. */
      scriptDocId: string | null;
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
  if (!isDocKind(kind) || ![...SYNCED_KINDS, ...INDEX_KINDS].includes(kind))
    return { ok: false, code: "unsupported_kind" };
  const home = homeOf(userId, docId, kind, given);
  const { index } = workspace;
  // a workspace is named only for a project's document or index: never by a workspace's own index, nor in its
  // index's own home, nor for a comments document, whose roles are its script's
  const misplaced =
    index !== null &&
    (home?.kind !== "project" ||
      home.id === index ||
      (INDEX_KINDS.includes(kind) && home.id === docId) ||
      kind === "comments");
  if (home === null || misplaced) return { ok: false, code: "bad_request" };
  if (kind !== "comments")
    return { ok: true, docId, kind, home, index, scriptDocId: null };
  const scriptDocId = stringField(request, "scriptDocId");
  if (!isDocId(scriptDocId) || commentsDocId(scriptDocId) !== docId)
    return { ok: false, code: "bad_request" };
  return { ok: true, docId, kind, home, index, scriptDocId };
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
    if (place === null) return { ok: false, code: "forbidden" };
    const { home, kind } = place;
    if (!isDocKind(kind)) return { ok: false, code: "forbidden" };
    const stored = (ROLE_ROWS[kind] ?? ownRole)(storage, docId, userId);
    if (stored === null || !isDocRole(stored.role))
      return { ok: false, code: "forbidden" };
    if (kind === "private" && keyOf(home) !== `user:${userId}`)
      return { ok: false, code: "forbidden" };
    const capabilities = grantedCapabilities({
      storage,
      userId,
      docId,
      stored,
    });
    return {
      ok: true,
      access: { role: stored.role, capabilities },
      home,
      kind,
    };
  }

  function capabilitiesOf(userId: string, docId: string): Capability[] | null {
    const resolved = resolve(userId, docId);
    return resolved.ok ? resolved.access.capabilities : null;
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

  /** A new document needs the person to write the named workspace's index, and a document already in `home`. */
  function mayPlace(userId: string, home: Home, index: string | null): boolean {
    if (index !== null && !canWrite(index, userId)) return false;
    const neighbours = directory.documentsIn(home);
    return (
      neighbours.length === 0 || neighbours.some((id) => canWrite(id, userId))
    );
  }

  /** A comments document is made, or made again, by anyone who holds a role on its script, in the script's home. */
  function scriptRefusal(
    userId: string,
    scriptDocId: string,
    home: Home,
  ): "bad_request" | "forbidden" | "deleted" | null {
    const script = resolve(userId, scriptDocId);
    if (!script.ok) return script.code;
    const sameHome = keyOf(script.home) === keyOf(home);
    return script.kind === "script" && sameHome ? null : "bad_request";
  }

  function create(userId: string, request: unknown): CreateResult {
    const checked = checkCreate(userId, request);
    if (!checked.ok) return checked;
    const { docId, kind, home, index, scriptDocId } = checked;
    if (directory.tombstoneOf(docId) !== null)
      return { ok: false, code: "deleted" };
    const refused =
      scriptDocId === null ? null : scriptRefusal(userId, scriptDocId, home);
    if (refused !== null) return { ok: false, code: refused };
    const place = directory.placeOf(docId);
    if (place !== null) {
      if (place.kind !== kind || keyOf(place.home) !== keyOf(home))
        return { ok: false, code: "exists_elsewhere" };
      if (scriptDocId === null && directory.roleOf(docId, userId) === null)
        return { ok: false, code: "forbidden" };
    } else {
      if (scriptDocId === null && !mayPlace(userId, home, index))
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
    // a comments document holds no role of its own: each person's is their role on the script
    if (created && scriptDocId === null) grant(docId, userId, index);
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
      (stored.role === "owner" ||
        (capabilitiesOf(userId, docId)?.includes("delete") ?? false));
    if (!allowed) return { ok: false, code: "forbidden" };
    directory.tombstone(docId, userId);
    return { ok: true };
  }

  return { resolve, capabilitiesOf, create, remove };
}
