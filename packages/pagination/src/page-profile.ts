// The page profile: everything the engine needs to know about a page and its elements.
// Lengths are cells or lines unless the name says otherwise.

import type { ActBreakKind, Alignment, BlockType } from "@manent/schema";

import { CELL_PT, LINE_PT, UNIT_PT } from "./units.ts";

/** 25 keys; a table over it is exhaustive at compile time. */
export type SpecKey =
  Exclude<BlockType, "act_break" | "ink_line"> | `act_break.${ActBreakKind}`;

export const PAPERS = [
  "letter",
  "a4",
  "trade_5x8",
  "trade_5_5x8_5",
  "trade_6x9",
] as const;
export type Paper = (typeof PAPERS)[number];

export const SPLIT_RULES = ["never", "action", "dialogue"] as const;
export type SplitRule = (typeof SPLIT_RULES)[number];

export const SCENE_NUMBER_SIDES = ["none", "left", "right", "both"] as const;
export type SceneNumberSides = (typeof SCENE_NUMBER_SIDES)[number];

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
  readonly sceneNumberSides: SceneNumberSides;
  readonly scenesLettered: boolean;
  /** Under each scene heading, the names that speak in its scene. */
  readonly castLists: boolean;
  /** Each speech's cue numbered in the left margin. */
  readonly speechesNumbered: boolean;
  readonly moreText: string;
  readonly contdText: string;
  readonly continuedTopText: string;
  readonly continuedFootText: string;
  /** Drawn for an empty `break` block. */
  readonly breakMark: string;
}

/** Optional publishing typography carried by Layout Engine 3 profiles (omitted on v1/v2). */
export interface BookTypography {
  readonly kind: "book_serif";
  readonly family: "Source Serif 4";
  readonly fontSizePt: number;
  readonly linePt: number;
  readonly unitPt: number;
  readonly cellPt: number;
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
  /** Layout Engine 3 optional mirrored recto/verso margins (omitted on v1/v2). */
  readonly mirrored?: boolean;
  readonly marginInnerPt?: number;
  readonly marginOuterPt?: number;
  readonly linePt?: number;
  readonly unitPt?: number;
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
  /** Optional book typography (Engine 3 manuscript only; omitted on v1/v2). */
  readonly typography?: BookTypography;
  /** Optional Engine 3 manuscript flag: start chapters on odd (recto) pages by inserting blank verso pages. */
  readonly rectoChapters?: boolean;
  /** Equal keys if and only if equal layout. */
  readonly key: string;
}

/** True for even-numbered physical pages (0-based index 1, 3, 5… = Page 2, 4, 6…). */
export function isVersoPage(pageIndex: number): boolean {
  return pageIndex % 2 === 1;
}

/** Physical left margin in points for page `pageIndex`, honouring mirrored recto/verso margins. */
export function pageMarginLeftPt(
  geometry: PageGeometry,
  pageIndex: number,
): number {
  if (geometry.mirrored === true && isVersoPage(pageIndex))
    return geometry.marginOuterPt ?? geometry.marginRightPt;
  return geometry.marginInnerPt ?? geometry.marginLeftPt;
}

/** Line height in points for `profile` (`12` on v1/v2, `15` on v3 book serif). */
export function linePtOf(profile: PageProfile): number {
  return profile.typography?.linePt ?? profile.geometry.linePt ?? LINE_PT;
}

/** Half-line unit in points for `profile` (`6` on v1/v2, `7.5` on v3 book serif). */
export function unitPtOf(profile: PageProfile): number {
  return profile.typography?.unitPt ?? profile.geometry.unitPt ?? UNIT_PT;
}

/** Nominal cell width in points for `profile` (`7.2` on v1/v2, `6` on v3 book serif). */
export function cellPtOf(profile: PageProfile): number {
  return profile.typography?.cellPt ?? CELL_PT;
}
