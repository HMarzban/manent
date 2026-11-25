// Navigation-mode keyboard handler for EditableGrid (arrows, Space, Shift+arrows, Enter, Esc, typing and surface commands).
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SurfaceKeyRunner } from "./grid-surface-keys.tsx";
import type { GridPosition } from "./navigation.ts";
import {
  coordAt,
  extendRowSelection,
  isCellEditable,
  isInteractiveDescendant,
  isPrintableKey,
  nextNavPosition,
  toggleRowSelection,
} from "./navigation.ts";
import type { GridCellCoord, GridColumn, GridRow } from "./types.ts";

export interface GridKeyContext {
  readonly event: ReactKeyboardEvent<HTMLDivElement>;
  readonly dragging: boolean;
  readonly editing: boolean;
  readonly readOnly: boolean;
  readonly rows: readonly GridRow[];
  readonly columns: readonly GridColumn[];
  readonly activePos: GridPosition | null;
  readonly resolvedCoord: GridCellCoord | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly anchorRowId: string | null;
  readonly pageRows: number;
  readonly surfaceRunner: SurfaceKeyRunner | null;
  setAnchorRowId(rowId: string): void;
  setActive(next: GridCellCoord): void;
  setSelection(nextIds: readonly string[]): void;
  focusCell(coord: GridCellCoord, rowIndex: number): void;
  beginEdit(rowId: string, columnId: string, initialKey: string | null): void;
  onReadOnlyKey?: () => void;
}

/** Handles one keydown event in navigation mode, forwarding surface:rundown_grid commands first. */
export function handleGridKeyDown(ctx: GridKeyContext): void {
  const {
    event,
    dragging,
    editing,
    readOnly,
    rows,
    columns,
    activePos,
    resolvedCoord,
    selectedIds,
    anchorRowId,
    pageRows,
    surfaceRunner,
  } = ctx;

  if (dragging || editing) return;

  if (surfaceRunner?.(event.nativeEvent)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (activePos === null || resolvedCoord === null) return;
  const cellEl =
    event.target instanceof Element
      ? event.target.closest('[role="gridcell"]')
      : null;
  if (isInteractiveDescendant(event.target, cellEl)) return;

  const currentRow = rows[activePos.rowIndex];
  if (currentRow === undefined) return;

  if (event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    ctx.setAnchorRowId(currentRow.id);
    ctx.setSelection(toggleRowSelection(selectedIds, currentRow.id));
    return;
  }

  if (
    event.key === "Enter" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.nativeEvent.isComposing &&
    event.keyCode !== 229
  ) {
    event.preventDefault();
    ctx.beginEdit(resolvedCoord.rowId, resolvedCoord.columnId, null);
    return;
  }

  if (event.key === "Escape") {
    if (selectedIds.size > 0) {
      event.preventDefault();
      ctx.setSelection([]);
    }
    return;
  }

  const nextPos = nextNavPosition({
    key: event.key,
    mod: event.metaKey || event.ctrlKey,
    current: activePos,
    rowCount: rows.length,
    colCount: columns.length,
    pageRows,
    isHeaderRow: currentRow.kind === "header",
  });
  if (nextPos !== null && !event.altKey) {
    event.preventDefault();
    const nextCoord = coordAt(rows, columns, nextPos);
    if (nextCoord === null) return;
    if (event.shiftKey) {
      const anchor = anchorRowId ?? currentRow.id;
      ctx.setAnchorRowId(anchor);
      ctx.setSelection(extendRowSelection(rows, anchor, nextCoord.rowId));
    } else {
      ctx.setAnchorRowId(nextCoord.rowId);
    }
    ctx.setActive(nextCoord);
    ctx.focusCell(nextCoord, nextPos.rowIndex);
    return;
  }

  if (isPrintableKey(event)) {
    const col =
      currentRow.kind === "header" ? columns[0] : columns[activePos.colIndex];
    if (col === undefined) return;
    if (readOnly) {
      ctx.onReadOnlyKey?.();
      return;
    }
    if (!isCellEditable(currentRow, col, readOnly)) return;
    event.preventDefault();
    ctx.beginEdit(currentRow.id, col.id, event.key);
  }
}
