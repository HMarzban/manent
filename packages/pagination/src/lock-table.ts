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

/** Field for field the wire's record of the same name; a test in server-core proves the two agree. */
export interface LockAnchorRecord {
  level: number;
  order: number;
  label: string;
  blockId: string;
  offset: number;
  quote: string;
  fallbackIds: string[];
  source: LockSource;
}

/** The records as the engine's table: sorted by order, then level; its level the highest present; a quote "" is null. */
export function toLockTable(records: readonly LockAnchorRecord[]): LockTable {
  const sorted = records.toSorted(
    (a, b) => a.order - b.order || a.level - b.level,
  );
  return Object.freeze({
    level: records.reduce((level, record) => Math.max(level, record.level), 0),
    anchors: Object.freeze(
      sorted.map((record) =>
        Object.freeze({
          label: record.label,
          blockId: record.blockId,
          offset: record.offset,
          quote: record.quote === "" ? null : record.quote,
          fallbackIds: Object.freeze([...record.fallbackIds]),
          source: record.source,
        }),
      ),
    ),
  });
}
