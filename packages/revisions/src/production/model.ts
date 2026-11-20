// The values and records of production revisions. The lists and records are
// declared a second time, field for field, by the wire; a test in server-core
// proves the two agree.

/** From the original issue. */
export const RECALL_WINDOW_MS = 86_400_000;
/** The most block IDs after an anchor, on its page, that an anchor keeps. */
export const FALLBACK_IDS = 8;
/** UTF-16 units of text kept from an anchor's offset, never ending inside a surrogate pair. */
export const QUOTE_UNITS = 24;
export const DEFAULT_MARK = "*";
/** An asterisk is drawn `columnCells + MARK_OFFSET_CELLS` cells from the text edge. */
export const MARK_OFFSET_CELLS = 7;
export const WHITE_DRAFT_NAME = "White production draft";
export const BEFORE_UNLOCK_NAME = "Before unlock";
export const BEFORE_END_NAME = "Before end of production";

/** `suffix` numbers a new scene 12A; `prefix` numbers it A12. */
export const NUMBERING_SCHEMES = ["suffix", "prefix"] as const;
export type NumberingScheme = (typeof NUMBERING_SCHEMES)[number];

export const COLOUR_ORDER_IDS = ["standard", "extended"] as const;
export type ColourOrderId = (typeof COLOUR_ORDER_IDS)[number];

export const MARK_MODES = [
  "collated",
  "this_revision",
  "all",
  "since_full_draft",
  "none",
] as const;
export type MarkMode = (typeof MARK_MODES)[number];

export const BLOCK_CHANGES = [
  "added",
  "changed",
  "moved",
  "shown",
  "removed",
] as const;
export type BlockChange = (typeof BLOCK_CHANGES)[number];

/** One block an issued revision marked. */
export interface SetBlockRecord {
  blockId: string;
  pageLabel: string;
  change: BlockChange;
  /** The block's contentHash at issue. */
  hash: string;
  /** The mark's ranges; both empty when the mark is whole. */
  inserted: [number, number][];
  deletedAt: number[];
}

export interface SceneNumberRecord {
  blockId: string;
  num: string;
  /** The block is gone; the number is never given to another block. */
  reserved: boolean;
}
