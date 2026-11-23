// The answers given to replays, by idempotency key.
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
