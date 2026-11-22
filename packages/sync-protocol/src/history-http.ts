// What the version history routes answer, and what a client sends them.
import type { LockAnchorRecord } from "./messages.ts";

// A mark, a text run, a block and a document as they travel: the script model's JSON shapes, carried without being read.
interface MarkJSON {
  type: string;
  attrs?: Record<string, unknown>;
}
interface TextJSON {
  type: "text";
  text: string;
  marks?: MarkJSON[];
}
interface BlockJSON {
  type: "block";
  attrs?: Record<string, unknown>;
  content?: TextJSON[];
}
interface DocJSON {
  type: "doc";
  content?: { type: "section"; content?: BlockJSON[] }[];
}

export const VERSION_KINDS = [
  "auto",
  "saved",
  "named",
  "sent",
  "export",
  "device",
  "pre_restore",
  "pre_merge",
  "pre_heal",
  "recovered",
  "revision_baseline",
  "revision_issue",
] as const;

export type HistoryVersionKind = (typeof VERSION_KINDS)[number];

/** A place in a document's log: a generation and a sequence in it. */
export interface VersionPosition {
  generation: number;
  seq: number;
}

/** One row of a document's versions, newest first. */
export interface VersionItem {
  id: string;
  kind: HistoryVersionKind;
  name: string | null;
  createdByUserId: string;
  createdAt: number;
  /** Made on a device. */
  onDevice: boolean;
  /** Null for a version stored as its content rather than as a place in the log. */
  position: VersionPosition | null;
  engineVersion: number | null;
  /** Null for a version recorded without one. */
  summary: { authorUserIds: string[]; changes: number; scenes: number } | null;
}

/** The answer to GET /api/versions. */
export interface VersionListResponse {
  versions: VersionItem[];
  /** The cursor of the following page ("<createdAt>:<id>"), null after the last. */
  next: string | null;
  head: VersionPosition;
  /** Someone besides the caller holds a role on the document. */
  othersCanOpen: boolean;
}

/** Who last wrote a block, and when. */
export interface VersionAuthor {
  userId: string;
  at: number;
}

/** A version's content, canonical: what exporting, viewing and comparing read. */
export interface VersionContent {
  v: 1;
  /** In document order, without their sections. */
  blocks: BlockJSON[];
  /** The script's settings as they were, keys ascending. */
  settings: Record<string, unknown>;
  schemaVersion: number;
  engineVersion: number | null;
  /** Null while page numbers were not locked. */
  locks: LockAnchorRecord[] | null;
  /** By block id: the last author and time known, per block and never per character. */
  authors: Record<string, VersionAuthor>;
}

/** The answer to GET /api/versions/content. */
export interface VersionContentResponse {
  content: VersionContent;
  position: VersionPosition | null;
}

export type RestoreScopeBody =
  { kind: "script" } | { kind: "scene"; headingId: string };

/** The body of POST /api/versions/name. A retry under the same `key` (`isReplayKey`) changes nothing. */
export interface NameRequest {
  docId: string;
  key: string;
  name: string;
  /** Null names Working. */
  fromVersionId: string | null;
}

/** The body of POST /api/versions/save, idempotent by `key`. */
export interface SaveRequest {
  docId: string;
  key: string;
  kind: "saved" | "export";
}

/** The body of POST /api/versions/upload: a version made on a device, idempotent by `version.id`. */
export interface UploadRequest {
  docId: string;
  version: {
    id: string;
    kind:
      "device" | "saved" | "named" | "pre_restore" | "pre_merge" | "recovered";
    name: string | null;
    deviceId: string;
    /** The device version's canonical document. */
    content: DocJSON;
    schemaVersion: number;
  };
}

/** The body of POST /api/versions/restore, idempotent by `key`. */
export interface RestoreRequest {
  docId: string;
  key: string;
  versionId: string;
  scope: RestoreScopeBody;
}

/** The answer to POST /api/versions/name, /save and /upload. */
export interface VersionResponse {
  version: VersionItem;
}

/** The answer to POST /api/versions/restore. */
export interface RestoreResponse {
  beforeVersionId: string;
  serverSeq: number;
  /** The number of blocks written. */
  applied: number;
}

/** The answer to GET /api/versions/who. */
export interface WhoWroteResponse {
  userId: string;
  at: number;
  previous: string | null;
  /** Read from the log, per change, rather than known only by version. */
  exact: boolean;
}

/** The answer to GET /api/versions/since: changes by people other than the caller after the position. */
export interface SinceResponse {
  changes: number;
  authorUserIds: string[];
}

/** The body of POST /api/versions/authors. */
export interface AuthorsRequest {
  docId: string;
  since: { versionId: string } | { position: VersionPosition };
  blockIds: string[];
}

/** The answer to POST /api/versions/authors: by block id, the user id of its last change after `since`. */
export interface AuthorsResponse {
  authors: Record<string, string>;
}

/** The data of a CONTROL frame about history, as UTF-8 JSON. */
export interface HistoryControl {
  kind: "version_created" | "draft_named" | "restored";
  versionId: string;
  userId: string;
  at: number;
  name: string | null;
  /** For a restore, the time of the version restored. */
  versionAt: number;
  /** For a restore of one scene, its number; null for the whole script. */
  scene: string | null;
  beforeVersionId: string | null;
}

const VERSION_CURSOR = /^\d+:[A-Za-z0-9_-]{1,64}$/;

/** A page cursor of GET /api/versions: "<createdAt>:<id>". */
export function isVersionCursor(value: unknown): value is string {
  return typeof value === "string" && VERSION_CURSOR.test(value);
}
