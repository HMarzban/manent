// The documents handed over by a device.
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
