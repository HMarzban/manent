// A document's closed generations.
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
