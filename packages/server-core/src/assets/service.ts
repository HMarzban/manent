// Project binary asset service: project-home role & draft-reader checks, verification, and 200 MiB project quota.
import type {
  Home,
  ProjectAssetMeta,
  ProjectAssetRow,
  Storage,
} from "@manent/storage";
import { indexDocId, isDocId } from "@manent/sync-protocol";
import { NO_DRAFT_READERS } from "../comments/ports.ts";
import type { DraftReaders } from "../comments/ports.ts";
import type { Clock } from "../sync/ports.ts";
import { isAssetId, verifyAssetBytes } from "./verify.ts";

export type AssetsRefusal =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "too_large"
  | "unsupported_kind"
  | "invalid";

export type AssetsOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: AssetsRefusal };

export interface PutAssetOutcome {
  readonly status: "stored" | "exists";
  readonly meta: ProjectAssetMeta;
}

export interface AssetsService {
  put(
    userId: string,
    projectId: string,
    assetId: string,
    bytes: Uint8Array,
  ): AssetsOutcome<PutAssetOutcome>;
  get(
    userId: string,
    projectId: string,
    assetId: string,
  ): AssetsOutcome<ProjectAssetRow>;
  head(
    userId: string,
    projectId: string,
    assetId: string,
  ): AssetsOutcome<ProjectAssetMeta>;
}

const WRITE_ROLES: ReadonlySet<string> = new Set(["owner", "edit"]);
const READ_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "edit",
  "comment",
  "view",
]);

function refused(code: AssetsRefusal): { ok: false; code: AssetsRefusal } {
  return { ok: false, code };
}

function canWriteProject(
  storage: Storage,
  userId: string,
  projectId: string,
): boolean {
  const projectIndex = indexDocId("project", projectId);
  if (storage.directory.tombstoneOf(projectIndex) !== null) return false;
  const place = storage.directory.placeOf(projectIndex);
  if (
    place === null ||
    place.home.kind !== "project" ||
    place.home.id !== projectId
  )
    return false;
  const role = storage.directory.roleOf(projectIndex, userId)?.role;
  return role !== undefined && WRITE_ROLES.has(role);
}

function canReadProject(
  storage: Storage,
  draftReaders: DraftReaders,
  userId: string,
  projectId: string,
): boolean {
  const home: Home = { kind: "project", id: projectId };
  const projectIndex = indexDocId("project", projectId);
  if (storage.directory.tombstoneOf(projectIndex) === null) {
    const place = storage.directory.placeOf(projectIndex);
    if (
      place !== null &&
      place.home.kind === "project" &&
      place.home.id === projectId
    ) {
      const role = storage.directory.roleOf(projectIndex, userId)?.role;
      if (role !== undefined && READ_ROLES.has(role)) return true;
    }
  }
  for (const docId of storage.directory.documentsIn(home)) {
    if (storage.directory.tombstoneOf(docId) !== null) continue;
    const role = storage.directory.roleOf(docId, userId)?.role;
    if (role !== undefined && READ_ROLES.has(role)) return true;
    if (draftReaders.isDraftReader(userId, docId)) return true;
  }
  return false;
}

export function createAssetsService(options: {
  readonly storage: Storage;
  readonly clock: Clock;
  readonly draftReaders?: DraftReaders;
  /** Optional override for the per-project byte quota (defaults to 200 MiB in storage). */
  readonly maxProjectBytes?: number;
}): AssetsService {
  const { storage, clock, maxProjectBytes } = options;
  const draftReaders = options.draftReaders ?? NO_DRAFT_READERS;

  return {
    put(userId, projectId, assetId, bytes) {
      if (!isDocId(projectId) || !isAssetId(assetId))
        return refused("bad_request");
      if (!canWriteProject(storage, userId, projectId))
        return refused("forbidden");
      const verified = verifyAssetBytes(assetId, bytes);
      if (!verified.ok) return refused(verified.code);
      const home: Home = { kind: "project", id: projectId };
      const result = storage.open(home).assets.put({
        assetId,
        mime: verified.mime,
        width: verified.width,
        height: verified.height,
        bytes,
        createdByUserId: userId,
        createdAt: clock.now(),
        ...(maxProjectBytes === undefined ? {} : { maxProjectBytes }),
      });
      if (result.status === "quota_exceeded") return refused("too_large");
      return { ok: true, value: { status: result.status, meta: result.meta } };
    },
    get(userId, projectId, assetId) {
      if (!isDocId(projectId) || !isAssetId(assetId))
        return refused("bad_request");
      if (!canReadProject(storage, draftReaders, userId, projectId))
        return refused("forbidden");
      const home: Home = { kind: "project", id: projectId };
      const row = storage.open(home).assets.get(assetId);
      if (row === null) return refused("not_found");
      return { ok: true, value: row };
    },
    head(userId, projectId, assetId) {
      if (!isDocId(projectId) || !isAssetId(assetId))
        return refused("bad_request");
      if (!canReadProject(storage, draftReaders, userId, projectId))
        return refused("forbidden");
      const home: Home = { kind: "project", id: projectId };
      const meta = storage.open(home).assets.head(assetId);
      if (meta === null) return refused("not_found");
      return { ok: true, value: meta };
    },
  };
}
