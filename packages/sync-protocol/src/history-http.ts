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
export interface BlockJSON {
  type: "block";
  attrs?: Record<string, unknown>;
  content?: TextJSON[];
}
interface DocJSON {
  type: "doc";
  content?: { type: "section"; content?: BlockJSON[] }[];
}

// A rundown's stored shapes as they travel in version content: structurally identical to @manent/schema's RundownJSON.
type RundownRowKind = "header" | "item" | "script";
type RundownColumnId =
  | "number"
  | "segment"
  | "story"
  | "writer"
  | "presenter"
  | "type"
  | "dur"
  | "cume"
  | "start"
  | "back"
  | "prompter";
interface RundownFieldsJSON {
  airDate: string;
  airAt: number | null;
  windowLeadMs: number;
  targetMs: number | null;
}
interface RundownCellJSON {
  value: string | number | null;
  userId: string;
  setAt: number;
  previous: {
    value: string | number | null;
    userId: string;
    setAt: number;
  } | null;
}
interface PrompterStateJSON {
  state: "on" | "changed";
  versionId: string | null;
  sentAt: number;
  sentByUserId: string | null;
}
interface RundownRowJSON {
  id: string;
  order: string;
  kind: RundownRowKind;
  cells: Partial<Record<RundownColumnId, RundownCellJSON>>;
  docId: string | null;
  blockId: string | null;
  durationMs: number | null;
  prompter: PrompterStateJSON | null;
  unnumbered: boolean;
}
interface RundownJSON {
  rundown: RundownFieldsJSON;
  columns: RundownColumnId[];
  rows: RundownRowJSON[];
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
  "prompter",
  "pre_hand_in",
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
  /** Present for rundown versions: the rundown's fields, columns and rows as they were. */
  rundown?: RundownJSON;
}

/** A version a device hands over with its document in POST /api/docs/adopt, kept as its content under its own id. */
export interface AdoptedVersion {
  id: string;
  kind: HistoryVersionKind;
  name: string | null;
  createdByUserId: string;
  createdAt: number;
  /** The device whose window made it; null for one the device's authority made. */
  deviceId: string | null;
  content: VersionContent;
  /** What it changed since the version before it; null for one recorded without that. */
  summary: {
    authorUserIds: string[];
    blockIds: string[];
    sceneIds: string[];
  } | null;
}

/** The answer to GET /api/versions/content. */
export interface VersionContentResponse {
  content: VersionContent;
  position: VersionPosition | null;
}

export type RestoreScopeBody =
  | { kind: "script" }
  | { kind: "scene"; headingId: string }
  | { kind: "row"; rowId: string };

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
  /**
   * The Yjs client ID the restore is written under: one the asking device holds as its own and
   * has written nothing under, so that the device sets aside, as for its own typing, the restored
   * text a later change removes without having seen it. Null when no device asked to keep it.
   */
  clientId: number | null;
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

/** The data of a `copies_kept` CONTROL frame, as UTF-8 JSON: what the server found twice after the push of `userId`. */
export interface CopiesKeptControl {
  userId: string;
  at: number;
  /**
   * Each copy that differs, left in the script: `blockId` names the kept block and `copyId` the copy;
   * `mine` is the copy's wording under the kept block's ID, `theirs` the kept block's; `otherUserIds`
   * wrote the kept block, ascending.
   */
  copies: {
    blockId: string;
    copyId: string;
    mine: BlockJSON;
    theirs: BlockJSON;
    otherUserIds: string[];
  }[];
}

const VERSION_CURSOR = /^\d+:[A-Za-z0-9_-]{1,64}$/;

/** A page cursor of GET /api/versions: "<createdAt>:<id>". */
export function isVersionCursor(value: unknown): value is string {
  return typeof value === "string" && VERSION_CURSOR.test(value);
}
