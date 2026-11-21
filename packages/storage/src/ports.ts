// The storage ports: one repository per aggregate, a unit of work, and the numbers they keep to.
// `kind`, `role` and capabilities are plain strings here: storage does not know the wire.

/** The file a document lives in, written `project:<uuid>` or `user:<userId>`. */
export type Home =
  { kind: "project"; id: string } | { kind: "user"; id: string };

export type UpdateOrigin =
  "edit" | "restore" | "import" | "replay" | "heal" | "system" | "upstream";

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

/** `commit_failed`: a transaction wrote nothing. `corrupt`: stored bytes fail their check. `disk_full`: a transaction wrote nothing because the disk is full. */
export class StorageError extends Error {
  readonly code: "commit_failed" | "corrupt" | "disk_full";

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
  /** Ordered by client id. */
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
  /**
   * Hashes the state, and keeps of its generation the newest CHECKPOINTS_KEPT, plus, for each pin of the document
   * in that generation, the newest checkpoint at or before the pin's seq.
   */
  put(docId: string, generation: number, seq: number, state: Uint8Array): void;
  /** The newest whose hash verifies; one that fails is deleted and the next older tried. */
  newest(
    docId: string,
    generation: number,
  ): { seq: number; state: Uint8Array } | null;
  /** As `newest`, among those of the generation whose `seq` is at most `seq`. */
  atOrBefore(
    docId: string,
    generation: number,
    seq: number,
  ): { seq: number; state: Uint8Array } | null;
  /** Keeps the newest checkpoint at or before `seq` while the pin stands; pinning a version again moves its pin. */
  pin(versionId: string, docId: string, generation: number, seq: number): void;
  unpin(versionIds: readonly string[]): void;
  /** Deletes every checkpoint and pin of that generation. */
  purge(docId: string, generation: number): void;
}

/** A closed generation. `finalState` null: its final state has been purged. */
export interface GenerationRow {
  docId: string;
  generation: number;
  finalSeq: number;
  finalState: Uint8Array | null;
  frozenAt: number;
  purgeAfter: number;
  reason: string;
  nextInitialBytes: number;
  rebuiltByClientId: number;
}

export interface FreezeItem {
  docId: string;
  finalSeq: number;
  finalState: Uint8Array;
  frozenAt: number;
  purgeAfter: number;
  reason: string;
  initialUpdate: Uint8Array;
  rebuiltByClientId: number;
  userId: string;
}

export interface Generations {
  /**
   * Closes the document's generation in one write and returns the new one: the frozen row (next_initial_bytes is
   * initialUpdate's length); documents.generation + 1 and head_seq 1; row 1 of the new generation holding initialUpdate,
   * origin "system", user userId; every acked_clock of the document's ledger set to 0; rebuiltByClientId registered to userId
   * in doc_clients only (no doc_people row: the system is given no colour, so nobody's colour index moves).
   * RangeError when finalSeq is not the head, or the document is unknown. Inside `transaction` it commits with the rest.
   */
  freeze(item: FreezeItem): number;
  get(docId: string, generation: number): GenerationRow | null;
  /** Oldest first. */
  list(docId: string): GenerationRow[];
}

/** One idempotency key's answer: `result` is the replay's response as JSON text. */
export interface ReplayRow {
  docId: string;
  key: string;
  userId: string;
  fromGeneration: number;
  generation: number;
  seq: number;
  result: string;
  createdAt: number;
}

export interface Replays {
  get(docId: string, key: string): ReplayRow | null;
  /** RangeError for a key already stored. */
  put(row: ReplayRow): void;
}

/** A document handed over by a device: the key it came under and the sequence its state was written at. */
export interface Adoption {
  docId: string;
  key: string;
  userId: string;
  seq: number;
  adoptedAt: number;
}

export interface Adoptions {
  get(docId: string): Adoption | null;
  /** An existing docId keeps its row. */
  put(adoption: Adoption): void;
}

/** What a checkpoint measured of the document at `seq`. */
export interface MeasureRow {
  seq: number;
  liveBytes: number;
  plainBytes: number;
  clientIds: number;
  largestSection: number;
}

/** Disposable, like the checkpoints beside them: one per document and generation, never part of a transaction. */
export interface Measures {
  /** Replaces the generation's measure. */
  put(docId: string, generation: number, row: MeasureRow): void;
  get(docId: string, generation: number): MeasureRow | null;
}

/** What a version changed: who wrote it, the blocks it changed and their scenes. */
export interface VersionSummary {
  authorIds: string[];
  blockIds: string[];
  sceneIds: string[];
}

/** Where a page of versions continues: strictly older than this. */
export interface VersionCursor {
  createdAt: number;
  id: string;
}

/** One history request's answer under its idempotency key: `result` is the response as JSON text. */
export interface HistoryRequestRow {
  docId: string;
  key: string;
  userId: string;
  result: string;
  createdAt: number;
}

/** A document file's versions beyond their rows: pages, snapshots, the chunks snapshots are cut into, summaries, request keys and the purge of a frozen log. */
export interface History {
  /** Newest first, by createdAt then id, both descending; strictly before `before` when it is not null. */
  page(
    docId: string,
    before: VersionCursor | null,
    limit: number,
  ): VersionRow[];
  get(versionId: string): VersionRow | null;
  /** Null when the version is unknown or has no snapshot. */
  snapshotOf(
    versionId: string,
  ): { ref: string; engineVersion: number | null } | null;
  setSnapshot(
    versionId: string,
    ref: string,
    engineVersion: number | null,
  ): void;
  /** Removes the rows and their summaries. */
  remove(versionIds: readonly string[]): void;
  /** Idempotent: a hash already stored keeps its body. */
  putChunk(hash: Uint8Array, body: Uint8Array): void;
  chunk(hash: Uint8Array): Uint8Array | null;
  chunkHashes(): Uint8Array[];
  removeChunks(hashes: readonly Uint8Array[]): void;
  summary(versionId: string): VersionSummary | null;
  /** Replaces the version's summary. */
  setSummary(versionId: string, summary: VersionSummary): void;
  request(docId: string, key: string): HistoryRequestRow | null;
  /** RangeError for a key already stored for the document. */
  putRequest(row: HistoryRequestRow): void;
  /**
   * Deletes that generation's log rows and sets its final state null, returning the rows removed.
   * RangeError for an unknown document, or a generation that is not frozen.
   */
  purgeLog(docId: string, generation: number): number;
}

/** One project's or one user's documents. */
export interface DocFile {
  readonly home: Home;
  readonly log: DocLog;
  readonly versions: Versions;
  readonly history: History;
  readonly checkpoints: Checkpoints;
  readonly generations: Generations;
  readonly replays: Replays;
  readonly measures: Measures;
  readonly adoptions: Adoptions;
  /**
   * The unit of work: every write to `log`, `versions`, `history`, `generations`, `replays` and `adoptions` inside the synchronous
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
  /** Each home a placed document lives in, once, ordered by its `kind:id` key. */
  homes(): readonly Home[];
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
  /** Every user holding a role on the document, ascending by userId; [] when none. */
  rolesOf(
    docId: string,
  ): { userId: string; role: string; capabilities: string[] }[];
  /** Whether a user other than `userId` holds a role on the document. */
  hasRoleBesides(docId: string, userId: string): boolean;
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

export const STORAGE_SCHEMA_VERSION = 4;
export const CHECKPOINT_FORMAT_VERSION = 1;
export const CHECKPOINTS_KEPT = 3;

/** Cursor colours per script: index 0–9 by order of first registration; the eleventh person gets 0 again. */
export const COLOR_COUNT = 10;
