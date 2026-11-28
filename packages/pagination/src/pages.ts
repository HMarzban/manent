// What the engine returns: the pages of a script and what it measured. Heights are in units.
import type { LayoutBlock } from "./layout-block.ts";
import type { LockTable } from "./lock-table.ts";
import type { ElementSpec, PageProfile } from "./page-profile.ts";

export interface BlockMetrics {
  /** 0 for a block that is not printed. */
  readonly lines: number;
  /** The offset where each line starts, in the text the block is drawn with. */
  readonly starts: Int32Array;
  readonly spec: ElementSpec;
}

/** `block` indexes the pagination's blocks. */
export interface Page {
  readonly index: number;
  /** "1", "12", "12A", "A12A", "12–13". */
  readonly label: string;
  /** Started by a lock anchor. */
  readonly locked: boolean;
  /** Started by an anchor, a page_break or startingPage, not by being full. */
  readonly forced: boolean;
  /** The first block with a line on this page. */
  readonly block: number;
  /** Its first line here; above 0 when the block is split across the break. */
  readonly line: number;
  /** The character offset of that line; 0 when line is 0. */
  readonly offset: number;
  /** A split dual run: where the right column resumes. */
  readonly right: {
    readonly block: number;
    readonly line: number;
    readonly offset: number;
  } | null;
  /** This page ends with (MORE): a speech continues on the next page. */
  readonly more: boolean;
  /** The cue repeated at the top, as the cue block reads, without the derived suffix; null for none. */
  readonly contd: string | null;
  readonly contdRight: string | null;
  readonly sceneContinued: boolean;
  /** Units the top furniture takes. */
  readonly topUnits: number;
  /** Everything placed, furniture included; never above linesPerPage × 2, but on a page that `elasticPages` in `@manent/revisions` merged, which holds up to four lines more. */
  readonly usedUnits: number;
  /** The highest block index examined while this page was filled. */
  readonly readAhead: number;
  /** True on Engine 3 blind-folio blank verso pages inserted before a recto chapter start. */
  readonly blank?: true;
}

export interface Pagination {
  readonly engineVersion: number;
  readonly profile: PageProfile;
  readonly locks: LockTable;
  readonly blocks: readonly LayoutBlock[];
  /** `metrics[i]` is `blocks[i]` as measured here. */
  readonly metrics: readonly BlockMetrics[];
  /** Never empty. */
  readonly pages: readonly Page[];
}

/** `blocks[first, newEnd)` replace `prev.blocks[first, oldEnd)`. */
export interface ChangeHint {
  readonly first: number;
  readonly oldEnd: number;
  readonly newEnd: number;
}
