// A document's log: its rows, what an append writes, and the ledger of who wrote what.
export type UpdateOrigin =
  "edit" | "restore" | "import" | "replay" | "heal" | "system" | "upstream";

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
  /** Updates the document's pinned layout engine version. */
  setEngineVersion(docId: string, version: number): void;
  /** `quarantine` defaults to true; `throughSeq` bounds the upper sequence inclusive; `corrupt` lists the sequences whose checksum fails. */
  tail(
    docId: string,
    generation: number,
    afterSeq: number,
    options?: { quarantine?: boolean; throughSeq?: number },
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

/** Cursor colours per script: index 0–9 by order of first registration; the eleventh person gets 0 again. */
export const COLOR_COUNT = 10;
