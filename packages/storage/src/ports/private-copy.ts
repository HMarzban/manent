// Private copies and their hand-ins, kept in the source document's file.

/** A writer's private copy of a script; `handedInAt` is null while the copy is open. Times are epoch milliseconds. */
export interface PrivateCopyRow {
  privateDocId: string;
  sourceDocId: string;
  ownerUserId: string;
  /** The source's head when the copy was made. */
  baseGeneration: number;
  baseSeq: number;
  /** The source's canonical content at that head, as JSON. */
  baseJson: string;
  createdAt: number;
  handedInAt: number | null;
}

/** A hand-in's stored answer: `answer` is its response body as JSON, given again for a retried key. */
export interface HandInRow {
  key: string;
  privateDocId: string;
  userId: string;
  beforeVersionId: string;
  answer: string;
  at: number;
}

/** Every write joins the document file's `transaction`. */
export interface PrivateCopyStore {
  copyOf(privateDocId: string): PrivateCopyRow | null;
  /**
   * The owner's open copy of the source; with none open, the one handed in last (of two handed in at the same
   * moment, the greater id); null when the owner never had one.
   */
  latestCopyOf(sourceDocId: string, ownerUserId: string): PrivateCopyRow | null;
  /** Throws a RangeError for a stored id, or when the owner already has an open copy of the source. */
  addCopy(row: PrivateCopyRow): void;
  /** Closes the copy at `at`; throws a RangeError unless it is stored and open. */
  markHandedIn(privateDocId: string, at: number): void;
  handInOf(key: string): HandInRow | null;
  /** Throws a RangeError for a key already stored. */
  addHandIn(row: HandInRow): void;
}
