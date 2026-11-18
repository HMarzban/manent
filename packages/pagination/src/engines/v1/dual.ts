// Dual dialogue: the runs of two side-by-side columns, and the rows a run may be cut at.
// Units are half-lines.
import type { Dual } from "@manent/schema";
import type { LayoutBlock } from "../../layout-block.ts";
import type { PageProfile } from "../../page-profile.ts";
import { specKey } from "./profile.ts";

/** A run: the left column's blocks `[start, split)`, then the right column's `[split, end)`. */
export interface DualRun {
  readonly start: number;
  readonly split: number;
  readonly end: number;
}

export interface Point {
  readonly block: number;
  readonly line: number;
}

/** One block of a column, from the line the column resumes at. */
export interface ColumnPiece {
  readonly block: number;
  /** The block's first line in the column. */
  readonly line: number;
  readonly lines: number;
  /** Units one line takes. */
  readonly step: number;
  /** Units above it; 0 for the column's first piece. */
  readonly space: number;
}

// The column a block is laid out in: its `dual`, for an element a dual column holds.
function sideOf(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): Dual | null {
  const block = blocks[i];
  if (block === undefined || block.dual === null) return null;
  return Object.hasOwn(profile.dual, specKey(block.type, block.kind))
    ? block.dual
    : null;
}

/** Block i is in a run, judged from it and the blocks before it alone. */
export function isInRun(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): boolean {
  let at = i;
  while (sideOf(blocks, profile, at) === "right") at--;
  return sideOf(blocks, profile, at) === "left";
}

/**
 * The run that holds block i; null for a block outside one, as a right column with no left column
 * before it is. Finding its end reads the block after it.
 */
export function runAt(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): DualRun | null {
  const side = (at: number) => sideOf(blocks, profile, at);
  if (side(i) === null) return null;
  let split = i;
  if (side(i) === "left") while (side(split) === "left") split++;
  else {
    while (side(split - 1) === "right") split--;
    if (side(split - 1) !== "left") return null;
  }
  let start = split;
  while (side(start - 1) === "left") start--;
  let end = split;
  while (side(end) === "right") end++;
  return { start, split, end };
}

export function columnHeight(column: readonly ColumnPiece[]): number {
  let units = 0;
  for (const piece of column)
    units += piece.space + (piece.lines - piece.line) * piece.step;
  return units;
}

/**
 * Where a column goes on when its run is cut `row` units below the column's top: "done" at or past its
 * end, null when the row falls inside a line.
 */
export function resumeAt(
  column: readonly ColumnPiece[],
  row: number,
): Point | "done" | null {
  let top = 0;
  for (const piece of column) {
    top += piece.space;
    if (row <= top) return { block: piece.block, line: piece.line };
    const below = (row - top) / piece.step;
    if (below < piece.lines - piece.line)
      return Number.isInteger(below)
        ? { block: piece.block, line: piece.line + below }
        : null;
    top += (piece.lines - piece.line) * piece.step;
  }
  return "done";
}

/** A row that is a line boundary in every column. */
export function isCutRow(
  columns: readonly (readonly ColumnPiece[])[],
  row: number,
): boolean {
  return columns.every((column) => resumeAt(column, row) !== null);
}

/** The last row from `high` down to `low` that is a line boundary in every column; -1 for none. */
export function lastCutRow(
  columns: readonly (readonly ColumnPiece[])[],
  low: number,
  high: number,
): number {
  for (let row = high; row >= low; row--)
    if (isCutRow(columns, row)) return row;
  return -1;
}
