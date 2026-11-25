// Column selection, width allocation and horizontal alignment for the rundown table layout.
import { clusterCells } from "@manent/pagination";
import type { RundownExportColumn } from "./rundown-for-export.ts";

export interface RundownColumnLayout {
  readonly id: string;
  readonly label: string;
  readonly xPt: number;
  readonly widthPt: number;
  readonly align: "left" | "right";
}

export interface SizedColumn extends RundownColumnLayout {
  readonly maxCells: number;
}

const RIGHT_ALIGNED_COLUMNS: ReadonlySet<string> = new Set([
  "number",
  "dur",
  "cume",
  "start",
  "back",
]);

const PREFERRED_CELLS: Readonly<Record<string, number>> = Object.freeze({
  number: 4,
  dur: 8,
  cume: 8,
  start: 9,
  back: 9,
  type: 8,
  prompter: 10,
  writer: 16,
  presenter: 16,
  segment: 32,
  story: 32,
});
const DEFAULT_COLUMN_CELLS = 14;
const FLEX_COLUMNS: ReadonlySet<string> = new Set(["segment", "story"]);

/** Filters `columns` to `columnIds` in `columns`'s own order; returns all when `columnIds` is omitted. */
export function selectColumns(
  columns: readonly RundownExportColumn[],
  columnIds?: readonly string[],
): readonly RundownExportColumn[] {
  if (columnIds === undefined) return columns;
  const chosen = new Set(columnIds);
  return columns.filter((col) => chosen.has(col.id));
}

function allocateColumnCells(
  columns: readonly RundownExportColumn[],
  availableCells: number,
): number[] {
  if (columns.length === 0) return [];
  const preferred = columns.map((col) => {
    const base = PREFERRED_CELLS[col.id] ?? DEFAULT_COLUMN_CELLS;
    const labelCells = clusterCells(col.label, 0, col.label.length, false);
    return Math.max(base, Math.min(12, labelCells));
  });
  const totalPreferred = preferred.reduce((sum, n) => sum + n, 0);
  if (totalPreferred <= availableCells) {
    const extra = availableCells - totalPreferred;
    const flexIdx = columns.findIndex((col) => FLEX_COLUMNS.has(col.id));
    if (flexIdx >= 0) {
      return preferred.map((n, i) => (i === flexIdx ? n + extra : n));
    }
    const expandable = columns
      .map((col, i) => (col.id === "number" ? -1 : i))
      .filter((i) => i >= 0);
    const targets =
      expandable.length > 0 ? expandable : columns.map((_, i) => i);
    const share = Math.floor(extra / targets.length);
    const remainder = extra - share * targets.length;
    return preferred.map((n, i) => {
      const pos = targets.indexOf(i);
      if (pos < 0) return n;
      return n + share + (pos < remainder ? 1 : 0);
    });
  }
  const scaled = preferred.map((n) =>
    Math.max(2, Math.floor((n * availableCells) / totalPreferred)),
  );
  const used = scaled.reduce((sum, n) => sum + n, 0);
  const diff = availableCells - used;
  if (diff > 0) {
    const widest = scaled.indexOf(Math.max(...scaled));
    scaled[widest] = scaled[widest]! + diff;
  }
  return scaled;
}

/** Positions and sizes `columns` across `contentWidthPt` starting at `marginPt`. */
export function layoutColumns(
  columns: readonly RundownExportColumn[],
  contentWidthPt: number,
  marginPt: number,
  cellPt: number,
  columnGapPt: number,
): SizedColumn[] {
  if (columns.length === 0) return [];
  const gapsPt = Math.max(0, columns.length - 1) * columnGapPt;
  const availableCells = Math.max(
    columns.length,
    Math.floor((contentWidthPt - gapsPt) / cellPt),
  );
  const cellWidths = allocateColumnCells(columns, availableCells);
  const result: SizedColumn[] = [];
  let xPt = marginPt;
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i]!;
    const maxCells = cellWidths[i]!;
    const widthPt = maxCells * cellPt;
    result.push({
      id: col.id,
      label: col.label,
      xPt,
      widthPt,
      align: RIGHT_ALIGNED_COLUMNS.has(col.id) ? "right" : "left",
      maxCells,
    });
    xPt += widthPt + columnGapPt;
  }
  return result;
}

/** Left coordinate in points for `text` inside `[xPt, xPt + widthPt]` under `align`. */
export function alignedX(
  text: string,
  xPt: number,
  widthPt: number,
  align: "left" | "right",
  cellPt: number,
): number {
  if (align === "left") return xPt;
  const textWidthPt = clusterCells(text, 0, text.length, false) * cellPt;
  return Math.max(xPt, xPt + widthPt - textWidthPt);
}
