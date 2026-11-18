// The storage ports: one repository per aggregate, a unit of work, and the numbers they keep to.
// `kind`, `role` and capabilities are plain strings here: storage does not know the wire.

/** The file a document lives in, written `project:<uuid>` or `user:<userId>`. */
export type Home =
  { kind: "project"; id: string } | { kind: "user"; id: string };

export type UpdateOrigin =
  "edit" | "restore" | "import" | "replay" | "heal" | "system";

export type VersionKind =
  | "auto"
  | "saved"
  | "named"
  | "sent"
  | "export"
  | "device"
  | "pre_restore"
  | "pre_merge"
  | "pre_heal"
  | "recovered"
  | "revision_baseline"
  | "revision_issue";

/** `commit_failed`: a transaction wrote nothing. `corrupt`: stored bytes fail their check. */
export class StorageError extends Error {
  readonly code: "commit_failed" | "corrupt";

  constructor(code: StorageError["code"], options?: { cause?: unknown }) {
    super(code, options);
    this.name = "StorageError";
    this.code = code;
  }
}

export interface DocumentRow {
  id: string;
  kind: string;
  ownerUserId: string | null;
  generation: number;
  headSeq: number;
  schemaVersion: number;
  engineVersion: number | null;
  locked: number;
  createdAt: number;
  deletedAt: number | null;
}

export interface UpdateRow {
  seq: number;
  update: Uint8Array;
  userId: string;
  origin: UpdateOrigin;
  createdAt: number;
}

export interface AppendItem {
  docId: string;
  generation: number;
  update: Uint8Array;
  userId: string;
  origin: UpdateOrigin;
  /** Per client ID in the update, its clock after it: the acknowledgement ledger. */
  clocks: readonly { clientId: number; clock: number }[];
  /** A setting request's sender: its device's highest committed `clientSeq` rises in the same write. */
  setRequest?: { deviceId: string; clientSeq: number };
}

export interface HealingRow {
  reason: "quarantine" | "behind" | "restore";
  verifiedSeq: number;
  flaggedAt: number;
  preHealVersionId: string | null;
}

export interface VersionRow {
  id: string;
  docId: string;
  generation: number | null;
  seq: number | null;
  kind: VersionKind;
  name: string | null;
  createdByUserId: string;
  createdAt: number;
  deviceId: string | null;
}

/** A document's log: the source of truth, append-only. */
export interface DocLog {
  /** An existing id returns its row unchanged. */
  create(doc: {
    id: string;
    kind: string;
    ownerUserId: string | null;
    schemaVersion: number;
    engineVersion: number | null;
  }): DocumentRow;
  get(docId: string): DocumentRow | null;
  /**
   * Returns the sequence the update was given, advancing `headSeq` and the ledger
   * in the same write. RangeError for an unknown document or another generation.
   */
  append(item: AppendItem): number;
  /** Never lowers the document's schema version. */
  raiseSchema(docId: string, toVersion: number): void;
  /** `quarantine` defaults to true; `corrupt` lists the sequences whose checksum fails. */
  tail(
    docId: string,
    generation: number,
    afterSeq: number,
    options?: { quarantine?: boolean },
  ): { rows: UpdateRow[]; corrupt: number[] };
  /**
   * Registers the unclaimed ids and returns those another user owns. A user's
   * first registered id on the document, here or through `append`, also gives
   * them a colour, in the same write.
   */
  registerClients(
    docId: string,
    userId: string,
    clientIds: readonly number[],
  ): number[];
  ledger(docId: string): Map<number, { userId: string; ackedClock: number }>;
  /** userId → colour index: the n-th person registered, from 0, gets n % COLOR_COUNT, and it never changes. */
  colors(docId: string): Map<string, number>;
  /** The highest committed `setRequest.clientSeq` of that person on that device; 0 when none. */
  lastSetRequest(docId: string, userId: string, deviceId: string): number;
  healing(docId: string): HealingRow | null;
  /** Keeps the lower `verifiedSeq` when the document is already flagged. */
  flagHealing(
    docId: string,
    reason: HealingRow["reason"],
    verifiedSeq: number,
  ): void;
  notePreHeal(docId: string, versionId: string): void;
}

export interface Versions {
  add(version: VersionRow): void;
  /** Newest first. */
  list(docId: string): VersionRow[];
}

/** Disposable caches, never part of a transaction. */
export interface Checkpoints {
  /** Hashes the state, and keeps the newest CHECKPOINTS_KEPT per document. */
  put(docId: string, generation: number, seq: number, state: Uint8Array): void;
  /** The newest whose hash verifies; one that fails is deleted and the next older tried. */
  newest(
    docId: string,
    generation: number,
  ): { seq: number; state: Uint8Array } | null;
}

/** One project's or one user's documents. */
export interface DocFile {
  readonly home: Home;
  readonly log: DocLog;
  readonly versions: Versions;
  readonly checkpoints: Checkpoints;
  /**
   * The unit of work: every write to `log` and `versions` inside the synchronous
   * `fn` commits together or not at all. A failure throws
   * StorageError("commit_failed") having written nothing. A write outside one
   * commits by itself.
   */
  transaction<T>(fn: () => T): T;
}

/** Which file a document lives in, who may do what, and what is deleted. */
export interface DocDirectory {
  /** An existing id keeps its home and kind. */
  place(
    docId: string,
    home: Home,
    kind: string,
    createdByUserId: string,
  ): { home: Home; kind: string; created: boolean };
  placeOf(docId: string): { home: Home; kind: string } | null;
  documentsIn(home: Home): string[];
  setRole(
    docId: string,
    userId: string,
    role: string,
    capabilities: readonly string[],
  ): void;
  removeRole(docId: string, userId: string): void;
  roleOf(
    docId: string,
    userId: string,
  ): { role: string; capabilities: string[] } | null;
  /** Idempotent: the first tombstone wins. */
  tombstone(docId: string, deletedByUserId: string): void;
  tombstoneOf(
    docId: string,
  ): { deletedByUserId: string; deletedAt: number } | null;
}

export interface Storage {
  readonly directory: DocDirectory;
  /** Opened on first use and kept. RangeError for a home that is not well formed. */
  open(home: Home): DocFile;
  close(): void;
}

export const STORAGE_SCHEMA_VERSION = 1;
export const CHECKPOINT_FORMAT_VERSION = 1;
export const CHECKPOINTS_KEPT = 3;

/** Cursor colours per script: index 0–9 by order of first registration; the eleventh person gets 0 again. */
export const COLOR_COUNT = 10;
