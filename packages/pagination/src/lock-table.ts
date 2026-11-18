// Locked page starts: the model type the engine forces pages from.

export const LOCK_SOURCES = ["lock", "issue", "import"] as const;
export type LockSource = (typeof LOCK_SOURCES)[number];

/** One locked page start. */
export interface LockAnchor {
  /** "12", "12A". */
  readonly label: string;
  readonly blockId: string;
  /** 0 is the block's start. */
  readonly offset: number;
  /** The text expected at the offset; null when it is not checked. */
  readonly quote: string | null;
  readonly fallbackIds: readonly string[];
  readonly source: LockSource;
}

/** Anchors in page order. */
export interface LockTable {
  readonly level: number;
  readonly anchors: readonly LockAnchor[];
}

export const NO_LOCKS: LockTable = Object.freeze({
  level: 0,
  anchors: Object.freeze([]),
});
