// State, focus restoration, edit lifecycle and imperative handle for EditableGrid.
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";
import { handleGridKeyDown } from "./grid-keyboard.ts";
import type { SurfaceKeyRunner } from "./grid-surface-keys.tsx";
import {
  cellFor,
  computeBlockMove,
  coordAt,
  extendRowSelection,
  findCellElement,
  isCellEditable,
  isInteractiveDescendant,
  moveAnnouncement,
  nextCoordAfterCommit,
  normaliseCommit,
  resolvePosition,
} from "./navigation.ts";
import type { EditableGridProps, GridCellCoord, GridColumn } from "./types.ts";

export const ROW_PX = 28;

export interface EditState {
  readonly rowId: string;
  readonly columnId: string;
  readonly draft: string;
  readonly initialKey: string | null;
  readonly error: string | null;
}

interface ControllerOptions {
  readonly props: EditableGridProps;
  readonly visibleColumns: readonly GridColumn[];
  readonly virtual: boolean;
  readonly scrollToIndex: (index: number) => void;
  readonly areaRef: RefObject<HTMLDivElement | null>;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly surfaceRunnerRef: RefObject<SurfaceKeyRunner | null>;
}

export interface GridController {
  readonly resolvedCoord: GridCellCoord | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly editing: EditState | null;
  readonly said: string;
  onActivateCell(
    rowId: string,
    columnId: string,
    event: ReactMouseEvent<HTMLDivElement>,
  ): void;
  onGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void;
  beginEdit(rowId: string, columnId: string, initialKey: string | null): void;
  setDraft(next: string): void;
  commitEdit(direction: "down" | "right" | "left" | "none"): void;
  cancelEdit(): void;
}

export function useGridController({
  props,
  visibleColumns,
  virtual,
  scrollToIndex,
  areaRef,
  scrollRef,
  surfaceRunnerRef,
}: ControllerOptions): GridController {
  const {
    rows,
    selectedRowIds: controlledSelection,
    onSelectionChange,
    activeCell: controlledActive,
    onActiveCellChange,
    onEditingChange,
    onCommitCell,
    onMoveRow,
    onMoveRows,
    onReadOnlyKey,
    announcements,
    readOnly = false,
    ref,
  } = props;

  const [uncontrolledActive, setUncontrolledActive] =
    useState<GridCellCoord | null>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [editing, setEditing] = useState<EditState | null>(null);
  const [said, setSaid] = useState("");
  const anchorRowId = useRef<string | null>(null);
  const pendingFocus = useRef<GridCellCoord | null>(null);
  const [, redraw] = useReducer((count: number) => count + 1, 0);

  const activeCoord =
    controlledActive !== undefined ? controlledActive : uncontrolledActive;
  const selectedIds = controlledSelection ?? uncontrolledSelected;
  const activePos = resolvePosition(rows, visibleColumns, activeCoord);
  const resolvedCoord =
    activePos === null ? null : coordAt(rows, visibleColumns, activePos);

  const setActive = useCallback(
    (next: GridCellCoord | null) => {
      if (controlledActive === undefined) setUncontrolledActive(next);
      onActiveCellChange?.(next);
    },
    [controlledActive, onActiveCellChange],
  );

  const setSelection = useCallback(
    (nextIds: readonly string[]) => {
      if (controlledSelection === undefined) {
        setUncontrolledSelected(new Set(nextIds));
      }
      onSelectionChange?.(nextIds);
    },
    [controlledSelection, onSelectionChange],
  );

  const focusCellLater = useCallback(
    (coord: GridCellCoord, rowIndex?: number) => {
      if (virtual && rowIndex !== undefined) scrollToIndex(rowIndex);
      const existing = findCellElement(scrollRef.current, coord);
      if (existing !== null) {
        pendingFocus.current = null;
        existing.focus({ preventScroll: virtual });
        return;
      }
      pendingFocus.current = coord;
      redraw();
    },
    [virtual, scrollToIndex, scrollRef],
  );

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const node = findCellElement(scrollRef.current, target);
    if (node === null) return;
    pendingFocus.current = null;
    node.focus({ preventScroll: virtual });
  });

  const beginEdit = useCallback(
    (rowId: string, columnId: string, initialKey: string | null) => {
      const row = rows.find((entry) => entry.id === rowId);
      const column =
        row?.kind === "header"
          ? visibleColumns[0]
          : visibleColumns.find((entry) => entry.id === columnId);
      if (row === undefined || column === undefined) return;
      if (readOnly) {
        onReadOnlyKey?.();
        return;
      }
      if (!isCellEditable(row, column, readOnly)) return;
      const cell = cellFor(row, column);
      setActive({ rowId: row.id, columnId: column.id });
      setEditing({
        rowId: row.id,
        columnId: column.id,
        draft: initialKey ?? cell.value,
        initialKey,
        error: null,
      });
      onEditingChange?.(true);
    },
    [rows, visibleColumns, readOnly, onReadOnlyKey, setActive, onEditingChange],
  );

  const commitEdit = useCallback(
    (direction: "down" | "right" | "left" | "none") => {
      if (editing === null) return;
      const outcome = normaliseCommit(
        onCommitCell?.(editing.rowId, editing.columnId, editing.draft),
      );
      if (!outcome.ok) {
        setEditing((prev) =>
          prev === null ? null : { ...prev, error: outcome.message },
        );
        return;
      }
      const next = nextCoordAfterCommit({
        rows,
        columns: visibleColumns,
        rowId: editing.rowId,
        columnId: editing.columnId,
        direction,
      });
      setEditing(null);
      onEditingChange?.(false);
      if (next !== null) {
        setActive(next.coord);
        focusCellLater(next.coord, next.rowIndex);
      }
    },
    [
      editing,
      onCommitCell,
      rows,
      visibleColumns,
      onEditingChange,
      setActive,
      focusCellLater,
    ],
  );

  const cancelEdit = useCallback(() => {
    if (editing === null) return;
    const returnCoord: GridCellCoord = {
      rowId: editing.rowId,
      columnId: editing.columnId,
    };
    const rowIndex = rows.findIndex((row) => row.id === editing.rowId);
    setEditing(null);
    onEditingChange?.(false);
    focusCellLater(returnCoord, rowIndex === -1 ? undefined : rowIndex);
  }, [editing, rows, onEditingChange, focusCellLater]);

  useImperativeHandle(
    ref,
    () => ({
      move(index, by) {
        const row = rows[index];
        if (row === undefined) {
          throw new RangeError(
            `a grid of ${rows.length} rows has no row at ${index}`,
          );
        }
        const to = Math.min(rows.length - 1, Math.max(0, index + by));
        if (to === index) return;
        setSaid(moveAnnouncement(rows, index, to, announcements));
        const colId = resolvedCoord?.columnId ?? visibleColumns[0]?.id;
        if (colId !== undefined) {
          focusCellLater({ rowId: row.id, columnId: colId }, to);
        }
        onMoveRow?.(index, to);
      },
      moveSelected(by) {
        const block = computeBlockMove({
          rows,
          selected: selectedIds,
          activeRowId: resolvedCoord?.rowId ?? null,
          direction: by,
          announcements,
        });
        if (block === null) return false;
        setSaid(block.announcement);
        const targetRowId = resolvedCoord?.rowId ?? block.rowIds[0];
        const colId = resolvedCoord?.columnId ?? visibleColumns[0]?.id;
        if (targetRowId !== undefined && colId !== undefined) {
          focusCellLater(
            { rowId: targetRowId, columnId: colId },
            block.toIndex,
          );
        }
        if (onMoveRows !== undefined) {
          onMoveRows(block.rowIds, block.toIndex);
        } else if (block.rowIds.length === 1) {
          onMoveRow?.(block.fromIndex, block.toIndex);
        }
        return true;
      },
      focusCell(rowId, columnId) {
        const rowIndex = rows.findIndex((row) => row.id === rowId);
        const colId = columnId ?? visibleColumns[0]?.id;
        if (rowIndex === -1 || colId === undefined) return;
        const coord = { rowId, columnId: colId };
        setActive(coord);
        focusCellLater(coord, rowIndex);
      },
      startEditing(coord) {
        const target = coord ?? resolvedCoord;
        if (target !== null) beginEdit(target.rowId, target.columnId, null);
      },
    }),
    [
      rows,
      announcements,
      resolvedCoord,
      visibleColumns,
      focusCellLater,
      onMoveRow,
      onMoveRows,
      selectedIds,
      setActive,
      beginEdit,
    ],
  );

  const onActivateCell = useCallback(
    (
      rowId: string,
      columnId: string,
      event: ReactMouseEvent<HTMLDivElement>,
    ) => {
      setActive({ rowId, columnId });
      if (event.shiftKey) {
        const anchor = anchorRowId.current ?? resolvedCoord?.rowId ?? rowId;
        anchorRowId.current = anchor;
        setSelection(extendRowSelection(rows, anchor, rowId));
      } else {
        anchorRowId.current = rowId;
      }
      if (!isInteractiveDescendant(event.target, event.currentTarget)) {
        event.currentTarget.focus({ preventScroll: true });
      }
    },
    [rows, resolvedCoord, setActive, setSelection],
  );

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const pageRows = Math.max(
      1,
      Math.floor((scrollRef.current?.clientHeight ?? ROW_PX * 10) / ROW_PX) - 1,
    );
    handleGridKeyDown({
      event,
      dragging: areaRef.current?.hasAttribute("data-dragging") ?? false,
      editing: editing !== null,
      readOnly,
      rows,
      columns: visibleColumns,
      activePos,
      resolvedCoord,
      selectedIds,
      anchorRowId: anchorRowId.current,
      pageRows,
      surfaceRunner: surfaceRunnerRef.current,
      setAnchorRowId: (rowId) => {
        anchorRowId.current = rowId;
      },
      setActive,
      setSelection,
      focusCell: focusCellLater,
      beginEdit,
      onReadOnlyKey,
    });
  };

  return {
    resolvedCoord,
    selectedIds,
    editing,
    said,
    onActivateCell,
    onGridKeyDown,
    beginEdit,
    setDraft: (draft) =>
      setEditing((prev) =>
        prev === null ? null : { ...prev, draft, error: null },
      ),
    commitEdit,
    cancelEdit,
  };
}
