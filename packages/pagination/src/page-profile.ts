// The page profile: everything the engine needs to know about a page and its elements.
// Lengths are cells or lines unless the name says otherwise.

import type { ActBreakKind, Alignment, BlockType } from "@manent/schema";

/** 23 keys; a table over it is exhaustive at compile time. */
export type SpecKey =
  Exclude<BlockType, "act_break" | "ink_line"> | `act_break.${ActBreakKind}`;

export const PAPERS = ["letter", "a4"] as const;
export type Paper = (typeof PAPERS)[number];

export const SPLIT_RULES = ["never", "action", "dialogue"] as const;
export type SplitRule = (typeof SPLIT_RULES)[number];

export interface ElementSpec {
  /** Cells from the text edge to the block's left edge. */
  readonly indent: number;
  /** Cells available to a line. */
  readonly width: number;
  /** Extra cells before the first line only. */
  readonly firstLineIndent: number;
  readonly align: Alignment;
  /** Blank lines above; replaced by `dropLines` when the block is first on a page. */
  readonly spaceBefore: number;
  /** Blank lines above when the block is first on a page (0 but for a chapter). */
  readonly dropLines: number;
  /** 2 = double-spaced. */
  readonly lineSpacing: 1 | 2;
  /** Shown in capitals. */
  readonly capitalized: boolean;
  /** A page never ends on it. */
  readonly keptWithNext: boolean;
  readonly split: SplitRule;
  /** Always first on a page. */
  readonly startingPage: boolean;
  /** False: takes no room on the page. */
  readonly printed: boolean;
  /** Furniture drawn before the first line and after the last, each counted in cells. */
  readonly enclosure: readonly [string, string] | null;
}

export interface RuleSettings {
  readonly minLines: number;
  readonly actionNoSplitBelow: number;
  readonly dualSplitAbove: number;
}

export interface FurnitureSettings {
  /** (MORE) and the cue with (CONT'D) where a speech crosses a page. */
  readonly speechContinued: boolean;
  /** (CONT'D) on a cue when the same person spoke last. */
  readonly speakerContinued: boolean;
  readonly sceneContinued: boolean;
  readonly scenesNumbered: boolean;
  readonly scenesLettered: boolean;
  readonly moreText: string;
  readonly contdText: string;
  readonly continuedTopText: string;
  readonly continuedFootText: string;
  /** Drawn for an empty `break` block. */
  readonly breakMark: string;
}

/** In points. */
export interface PageGeometry {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly marginLeftPt: number;
  readonly marginTopPt: number;
  readonly marginRightPt: number;
  readonly marginBottomPt: number;
  readonly pageNumberTopPt: number;
}

export interface PageProfile {
  readonly engineVersion: number;
  readonly format: string;
  readonly paper: Paper;
  readonly columnCells: number;
  readonly linesPerPage: number;
  readonly geometry: PageGeometry;
  readonly elements: Readonly<Record<SpecKey, ElementSpec>>;
  readonly dual: Readonly<
    Record<
      "character" | "parenthetical" | "dialogue",
      { readonly indent: number; readonly width: number }
    >
  >;
  readonly dualRightOffset: number;
  readonly rules: RuleSettings;
  readonly furniture: FurnitureSettings;
  /** Equal keys if and only if equal layout. */
  readonly key: string;
}
