// A document file's versions beyond their rows.
import type { VersionRow } from "./versions.ts";

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

/** A version row together with its snapshot metadata and summary, read in one query. */
export interface VersionPageRow extends VersionRow {
  snapshotRef: string | null;
  engineVersion: number | null;
  summary: VersionSummary | null;
}

/** A document file's versions beyond their rows: pages, snapshots, the chunks snapshots are cut into, summaries, request keys and the purge of a frozen log. */
export interface History {
  /** Newest first, by createdAt then id, both descending; strictly before `before` when it is not null. */
  page(
    docId: string,
    before: VersionCursor | null,
    limit: number,
  ): VersionRow[];
  /** As `page`, with each row's snapshot metadata and summary joined in one query. */
  pageDetails(
    docId: string,
    before: VersionCursor | null,
    limit: number,
  ): VersionPageRow[];
  get(versionId: string): VersionRow | null;
  /** Null when the version is unknown or has no snapshot. */
  snapshotOf(
    versionId: string,
  ): { ref: string; engineVersion: number | null } | null;
  /** The newest snapshot version of `docId` at or before `at`; null when none holds a snapshot. */
  latestSnapshotAtOrBefore(
    docId: string,
    at: { generation: number; seq: number },
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
