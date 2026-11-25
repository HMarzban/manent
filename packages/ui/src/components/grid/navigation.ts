// Pure column sizing, cell navigation, selection and move calculations for the editable grid.
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import type {
  GridAnnouncements,
  GridCell,
  GridCellCoord,
  GridColumn,
  GridCommitResult,
  GridRow,
} from "./types.ts";

export const DEFAULT_MIN_WIDTH_PX = 48;
export const DEFAULT_MAX_WIDTH_PX = 480;
export const DEFAULT_COLUMN_WIDTH_PX = 120;

export function columnBounds(column: GridColumn): {
  min: number;
  max: number;
} {
  const min = column.minWidthPx ?? DEFAULT_MIN_WIDTH_PX;
  const max = Math.max(min, column.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX);
  return { min, max };
}

export function clampColumnWidth(column: GridColumn, widthPx: number): number {
  const { min, max } = columnBounds(column);
  return Math.min(max, Math.max(min, Math.round(widthPx)));
}

export function resolveColumnWidth(column: GridColumn): number {
  return clampColumnWidth(
    column,
    column.widthPx ?? column.defaultWidthPx ?? DEFAULT_COLUMN_WIDTH_PX,
  );
}

/** Shared inline sizing so sticky header cells and body cells align pixel for pixel. */
export function columnStyle(column: GridColumn): CSSProperties {
  const width = resolveColumnWidth(column);
  if (column.flex && column.widthPx === undefined) {
    return { minWidth: `${width}px`, flex: "1 1 0%" };
  }
  return { width: `${width}px`, minWidth: `${width}px`, flex: "0 0 auto" };
}

export function totalMinWidthPx(columns: readonly GridColumn[]): number {
  let sum = 0;
  for (const column of columns) sum += resolveColumnWidth(column);
  return sum;
}

/** Returns the cell data for `(row, column)`, synthesising the spanning cell for a header row. */
export function cellFor(row: GridRow, column: GridColumn): GridCell {
  if (row.kind === "header") {
    const existing = row.cells[column.id];
    const value = row.headerValue ?? existing?.value ?? "";
    return {
      value,
      display: row.headerDisplay,
      editable: row.headerEditable ?? true,
      presence: row.presence ?? existing?.presence,
      cornerMark: row.headerCornerMark ?? existing?.cornerMark ?? null,
      accessibleLabel: existing?.accessibleLabel,
      tooltip: existing?.tooltip,
      tourTarget: row.headerTourTarget ?? existing?.tourTarget,
    };
  }
  return row.cells[column.id] ?? { value: "" };
}

export function isCellEditable(
  row: GridRow,
  column: GridColumn,
  readOnly: boolean,
): boolean {
  if (readOnly || row.unavailable !== undefined) return false;
  if (row.kind === "header") return row.headerEditable ?? true;
  const cell = row.cells[column.id];
  return cell?.editable ?? column.editable ?? false;
}

export interface GridPosition {
  readonly rowIndex: number;
  readonly colIndex: number;
}

export function resolvePosition(
  rows: readonly GridRow[],
  columns: readonly GridColumn[],
  coord: GridCellCoord | null,
): GridPosition | null {
  if (rows.length === 0 || columns.length === 0) return null;
  if (coord === null) return { rowIndex: 0, colIndex: 0 };
  const foundRow = rows.findIndex((row) => row.id === coord.rowId);
  const rowIndex = foundRow === -1 ? 0 : foundRow;
  const foundCol = columns.findIndex((column) => column.id === coord.columnId);
  const colIndex = foundCol === -1 ? 0 : foundCol;
  return { rowIndex, colIndex };
}

export function coordAt(
  rows: readonly GridRow[],
  columns: readonly GridColumn[],
  pos: GridPosition,
): GridCellCoord | null {
  const row = rows[pos.rowIndex];
  const column = columns[pos.colIndex];
  if (row === undefined || column === undefined) return null;
  return { rowId: row.id, columnId: column.id };
}

/** Computes the next cell position for a navigation key, or null when the key is not a navigation key. */
export function nextNavPosition(options: {
  key: string;
  mod: boolean;
  current: GridPosition;
  rowCount: number;
  colCount: number;
  pageRows: number;
  isHeaderRow: boolean;
}): GridPosition | null {
  const { key, mod, current, rowCount, colCount, pageRows, isHeaderRow } =
    options;
  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;
  switch (key) {
    case "ArrowUp":
      return {
        rowIndex: Math.max(0, current.rowIndex - 1),
        colIndex: current.colIndex,
      };
    case "ArrowDown":
      return {
        rowIndex: Math.min(lastRow, current.rowIndex + 1),
        colIndex: current.colIndex,
      };
    case "ArrowLeft":
      return {
        rowIndex: current.rowIndex,
        colIndex: isHeaderRow
          ? current.colIndex
          : Math.max(0, current.colIndex - 1),
      };
    case "ArrowRight":
      return {
        rowIndex: current.rowIndex,
        colIndex: isHeaderRow
          ? current.colIndex
          : Math.min(lastCol, current.colIndex + 1),
      };
    case "Home":
      return { rowIndex: mod ? 0 : current.rowIndex, colIndex: 0 };
    case "End":
      return { rowIndex: mod ? lastRow : current.rowIndex, colIndex: lastCol };
    case "PageUp":
      return {
        rowIndex: Math.max(0, current.rowIndex - Math.max(1, pageRows)),
        colIndex: current.colIndex,
      };
    case "PageDown":
      return {
        rowIndex: Math.min(lastRow, current.rowIndex + Math.max(1, pageRows)),
        colIndex: current.colIndex,
      };
    default:
      return null;
  }
}

export function toggleRowSelection(
  selected: ReadonlySet<string>,
  rowId: string,
): string[] {
  const next = new Set(selected);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  return [...next];
}

export function extendRowSelection(
  rows: readonly GridRow[],
  anchorRowId: string,
  targetRowId: string,
): string[] {
  const a = rows.findIndex((row) => row.id === anchorRowId);
  const b = rows.findIndex((row) => row.id === targetRowId);
  if (a === -1 || b === -1) return [targetRowId];
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return rows.slice(start, end + 1).map((row) => row.id);
}

export interface BlockMove {
  readonly rowIds: readonly string[];
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly announcement: string;
}

/** Builds the polite announcement after moving `moved` to `toIndex` among the remaining rows. */
export function moveAnnouncement(
  rows: readonly GridRow[],
  fromIndex: number,
  toIndex: number,
  announcements?: GridAnnouncements,
): string {
  const moved = rows[fromIndex];
  if (moved === undefined) return "";
  if (toIndex === 0 && announcements?.movedToTop !== undefined) {
    return announcements.movedToTop(moved.label);
  }
  const remaining = rows.filter((_row, index) => index !== fromIndex);
  const after = remaining[toIndex - 1];
  if (after !== undefined && announcements?.movedAfter !== undefined) {
    return announcements.movedAfter(moved.label, after.label);
  }
  return SORTABLE_WORDS.moved(moved.label, toIndex + 1, rows.length);
}

/** Computes a single-step up/down move for the selected rows (or active row), or null when already at the edge. */
export function computeBlockMove(options: {
  rows: readonly GridRow[];
  selected: ReadonlySet<string>;
  activeRowId: string | null;
  direction: -1 | 1;
  announcements?: GridAnnouncements;
}): BlockMove | null {
  const { rows, selected, activeRowId, direction, announcements } = options;
  const indices =
    selected.size > 0
      ? rows.flatMap((row, index) => (selected.has(row.id) ? [index] : []))
      : activeRowId === null
        ? []
        : rows.flatMap((row, index) => (row.id === activeRowId ? [index] : []));
  const first = indices[0];
  const last = indices.at(-1);
  if (first === undefined || last === undefined) return null;
  if (direction < 0 && first === 0) return null;
  if (direction > 0 && last === rows.length - 1) return null;
  const rowIds = indices.map((index) => rows[index]!.id);
  const movedSet = new Set(rowIds);
  const remaining = rows.filter((row) => !movedSet.has(row.id));
  const targetRemainingIndex =
    direction < 0 ? first - 1 : last - rowIds.length + 2;
  const clampedTarget = Math.min(
    remaining.length,
    Math.max(0, targetRemainingIndex),
  );
  const primary = rows[first]!;
  const after = remaining[clampedTarget - 1];
  const announcement =
    clampedTarget === 0 && announcements?.movedToTop !== undefined
      ? announcements.movedToTop(primary.label)
      : after !== undefined && announcements?.movedAfter !== undefined
        ? announcements.movedAfter(primary.label, after.label)
        : SORTABLE_WORDS.moved(primary.label, clampedTarget + 1, rows.length);
  return {
    rowIds,
    fromIndex: first,
    toIndex: clampedTarget,
    announcement,
  };
}

const INTERACTIVE_SELECTOR =
  'button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="separator"]';

/** True when an event started inside an interactive child control of a cell rather than the cell itself. */
export function isInteractiveDescendant(
  target: EventTarget | null,
  cell: Element | null,
): boolean {
  if (!(target instanceof Element) || target === cell) return false;
  const control = target.closest(INTERACTIVE_SELECTOR);
  return control !== null && control !== cell;
}

/** True for a printable character key (excluding Space) that should begin inline cell editing. */
export function isPrintableKey(event: ReactKeyboardEvent): boolean {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.nativeEvent.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }
  return [...event.key].length === 1 && event.key !== " ";
}

export function normaliseCommit(
  result: GridCommitResult,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string | null } {
  if (result === false) return { ok: false, message: null };
  if (typeof result === "object" && result !== null && !result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true };
}

export function findCellElement(
  grid: HTMLElement | null,
  coord: GridCellCoord,
): HTMLElement | null {
  if (grid === null) return null;
  const cells = grid.querySelectorAll<HTMLElement>('[role="gridcell"]');
  for (const cell of cells) {
    if (
      cell.dataset["rowId"] === coord.rowId &&
      cell.dataset["colId"] === coord.columnId
    ) {
      return cell;
    }
  }
  // header rows span every visible column under the first column's id
  for (const cell of cells) {
    if (cell.dataset["rowId"] === coord.rowId) return cell;
  }
  return null;
}

export function nextCoordAfterCommit(options: {
  rows: readonly GridRow[];
  columns: readonly GridColumn[];
  rowId: string;
  columnId: string;
  direction: "down" | "right" | "left" | "none";
}): { readonly coord: GridCellCoord; readonly rowIndex: number } | null {
  const { rows, columns, rowId, columnId, direction } = options;
  if (direction === "none") return null;
  const fromRow = rows.findIndex((row) => row.id === rowId);
  const fromCol = columns.findIndex((column) => column.id === columnId);
  if (fromRow === -1 || fromCol === -1) return null;
  const isHeader = rows[fromRow]?.kind === "header";
  let rowIndex = fromRow;
  let colIndex = fromCol;
  if (direction === "down") {
    rowIndex = Math.min(rows.length - 1, fromRow + 1);
  } else if (direction === "right" && !isHeader) {
    colIndex = Math.min(columns.length - 1, fromCol + 1);
  } else if (direction === "left" && !isHeader) {
    colIndex = Math.max(0, fromCol - 1);
  }
  const coord = coordAt(rows, columns, { rowIndex, colIndex });
  return coord === null ? null : { coord, rowIndex };
}
