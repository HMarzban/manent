// What a checkpoint measured of a document.
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
