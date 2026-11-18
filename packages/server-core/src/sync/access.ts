// Who may do what with a document: creating one, deleting one, and a person's access to one.
import type { Home, Storage } from "@manent/storage";
import {
  CAPABILITIES,
  DOC_ROLES,
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

const isDocRole = (value: string): value is DocRole =>
  DOC_ROLES.some((role) => role === value);
const isCapability = (value: string): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);

const keyOf = (home: Home): string => `${home.kind}:${home.id}`;

/** `"user"` is the caller's own file; a private copy lives there and nowhere else. */
function homeOf(userId: string, kind: DocKind, home: string): Home | null {
  if (kind === "private")
    return home === "user" ? { kind: "user", id: userId } : null;
  const id = home.slice("project:".length);
  return home.startsWith("project:") && isDocId(id)
    ? { kind: "project", id }
    : null;
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

  function create(userId: string, request: unknown): CreateResult {
    const docId = stringField(request, "docId");
    const kind = stringField(request, "kind");
    const given = stringField(request, "home");
    if (!isDocId(docId) || kind === null || given === null)
      return { ok: false, code: "bad_request" };
    if (!isDocKind(kind) || !SYNCABLE_KINDS.includes(kind))
      return { ok: false, code: "unsupported_kind" };
    const home = homeOf(userId, kind, given);
    if (home === null) return { ok: false, code: "bad_request" };
    if (directory.tombstoneOf(docId) !== null)
      return { ok: false, code: "deleted" };
    const place = directory.placeOf(docId);
    if (place !== null) {
      if (place.kind !== kind || keyOf(place.home) !== keyOf(home))
        return { ok: false, code: "exists_elsewhere" };
      if (directory.roleOf(docId, userId) === null)
        return { ok: false, code: "forbidden" };
    } else {
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
    if (created) directory.setRole(docId, userId, "owner", OWNER_CAPABILITIES);
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
