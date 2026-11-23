// The checkpoints a document's state is loaded from.
export const CHECKPOINT_FORMAT_VERSION = 1;
export const CHECKPOINTS_KEPT = 3;

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
