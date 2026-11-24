// Pure helpers for rundown cell history: corner-mark window, Previous value timestamps, display formatting and tour target.
import type {
  RundownCellJSON,
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import {
  dayNumber,
  formatDate,
  formatDayTime,
  formatDuration,
  formatTime,
} from "@manent/ui";
import type { GridCellCoord } from "@manent/ui";

/** Corner mark visibility window for another person's cell overwrite (1 minute). */
export const CORNER_MARK_WINDOW_MS = 60_000;

export const STORED_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
]);

function isStoredColumnId(value: string): value is RundownColumnId {
  return (STORED_COLUMNS as readonly string[]).includes(value);
}

/** Reads the stored cell of `row` at `columnId`, falling back across `segment`/`story` for header rows. */
export function storedCellOf(
  row: RundownRowJSON,
  columnId: string,
): {
  readonly columnId: RundownColumnId;
  readonly cell: RundownCellJSON;
} | null {
  if (row.kind === "header") {
    for (const candidate of [columnId, "segment", "story"]) {
      if (!isStoredColumnId(candidate)) continue;
      const cell = row.cells[candidate];
      if (cell !== undefined) return { columnId: candidate, cell };
    }
    return null;
  }
  if (!isStoredColumnId(columnId)) return null;
  const cell = row.cells[columnId];
  return cell === undefined ? null : { columnId, cell };
}

/** Picks the cell on `row` with a `previous` value, preferring `preferredColumnId` when it has one. */
export function previousColumnOfRow(
  row: RundownRowJSON,
  preferredColumnId: string | null,
): RundownColumnId | null {
  if (preferredColumnId !== null) {
    const preferred = storedCellOf(row, preferredColumnId);
    if (preferred !== null && preferred.cell.previous !== null)
      return preferred.columnId;
  }
  let best: { col: RundownColumnId; setAt: number } | null = null;
  for (const col of STORED_COLUMNS) {
    const cell = row.cells[col];
    if (cell === undefined || cell.previous === null) continue;
    if (best === null || cell.setAt > best.setAt) {
      best = { col, setAt: cell.setAt };
    }
  }
  return best?.col ?? null;
}

/** True when `cell` was overwritten by another person within the last minute. */
export function isRecentOtherChange(
  cell: RundownCellJSON | undefined,
  userId: string,
  nowMs: number,
): boolean {
  if (cell === undefined || cell.previous === null) return false;
  if (cell.userId === userId) return false;
  return cell.setAt > nowMs - CORNER_MARK_WINDOW_MS;
}

/** Formats the cell change timestamp per S3-RG-47: `18:52`, `Yesterday 18:52`, `Mon 18:52`, or `12 Nov 18:52`. */
export function formatPreviousWhen(setAt: number, nowMs: number): string {
  const daysAgo = dayNumber(nowMs) - dayNumber(setAt);
  if (daysAgo === 0) return formatTime(setAt);
  if (daysAgo >= 1 && daysAgo < 7) return formatDayTime(setAt, nowMs);
  return `${formatDate(setAt)} ${formatTime(setAt)}`;
}

/** Formats a stored cell value for display in the Previous value popover and Restore message. */
export function formatCellDisplayValue(
  columnId: RundownColumnId,
  value: string | number | null,
): string | null {
  if (value === null) return null;
  if (columnId === "dur") {
    return typeof value === "number" ? formatDuration(value) : null;
  }
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Picks the single cell carrying `data-tour="rundown:cell"`: the cell whose popover is open, or else the most recently
 * overwritten cell in the rundown, never more than one.
 */
export function tourCellOf(
  rundown: RundownJSON | null,
  openCell: GridCellCoord | null,
  titleColumn: "segment" | "story",
): GridCellCoord | null {
  if (rundown === null) return null;
  if (
    openCell !== null &&
    rundown.rows.some((row) => row.id === openCell.rowId)
  ) {
    return openCell;
  }
  let best: { coord: GridCellCoord; setAt: number } | null = null;
  for (const row of rundown.rows) {
    for (const col of STORED_COLUMNS) {
      const cell = row.cells[col];
      if (cell === undefined || cell.previous === null) continue;
      if (best === null || cell.setAt > best.setAt) {
        best = {
          coord: {
            rowId: row.id,
            columnId: row.kind === "header" ? titleColumn : col,
          },
          setAt: cell.setAt,
        };
      }
    }
  }
  return best?.coord ?? null;
}
