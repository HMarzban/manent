// Rundown row menu (`ROW_MENU_ITEMS`), `rows` command slot provider and DOM copy/paste wiring.
import type { CommandId, CommandState } from "@manent/commands";
import type { RundownColumnId, RundownRowJSON } from "@manent/schema";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PROMPTER_CONTROL_WORDS,
} from "@manent/ui";
import type { EditableGridHandle, GridCellCoord } from "@manent/ui";
import { EllipsisIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { rundownActions } from "../state/rundown.store.ts";
import {
  RUNDOWN_ROWS_MIME,
  parseClipboardRows,
  readCopiedRows,
} from "./clipboard.ts";
import { previousColumnOfRow } from "./previous-value-model.ts";
import {
  addRundownRow,
  canJumpRowToPrompter,
  copySelectedRows,
  deleteSelectedRows,
  dragMoveRows,
  stepMoveRows,
  toggleRowUnnumbered,
} from "./row-actions.ts";
import type { RowActionContext } from "./row-actions.ts";
import { pasteIntoRundown, startScriptForRow } from "./row-story-actions.ts";
import type { RundownSessionControls } from "./rundown-session.ts";

export {
  MOVE_DOWN_LAST_ROW_TEXT,
  MOVE_UP_FIRST_ROW_TEXT,
} from "./row-actions.ts";

/** Commands drawn in a rundown row's menu, in the brief's order; unregistered commands are omitted. */
export const ROW_MENU_ITEMS: readonly CommandId[] = Object.freeze([
  "prompter.send",
  "prompter.jumpHere",
  "rundown.openBeside",
  "rundown.moveUp",
  "rundown.moveDown",
  "rundown.copyRows",
  "rundown.deleteRows",
  "rundown.previousValue",
  "rundown.startScript",
  "rundown.leaveUnnumbered",
  "rundown.numberRow",
]);

function readCommandState(
  commands: { state(id: string): CommandState },
  id: CommandId,
): CommandState | null {
  try {
    return commands.state(id);
  } catch {
    // command not registered yet: omit from the row menu
    return null;
  }
}

function isEditableInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface RowMenuProps {
  readonly row: RundownRowJSON;
  readonly rowIndex: number;
  readonly rowCount: number;
  readonly label: string;
  readonly activeCell: GridCellCoord | null;
  onBeforeOpen(rowId: string): void;
  onOpenPrevious(rowId: string, columnId: RundownColumnId): void;
}

/** Row handle button (`⋯`) and dropdown menu built from `ROW_MENU_ITEMS` with per-row filtering and `R-X` affordances. */
export function RowMenu(props: RowMenuProps): ReactNode {
  const {
    row,
    rowIndex,
    rowCount,
    label,
    activeCell,
    onBeforeOpen,
    onOpenPrevious,
  } = props;
  const { commands } = useServices();

  const preferredCol =
    activeCell?.rowId === row.id ? activeCell.columnId : null;
  const previousCol = previousColumnOfRow(row, preferredCol);
  const isFirst = rowIndex <= 0;
  const isLast = rowIndex >= rowCount - 1;

  const entries: {
    readonly id: CommandId;
    readonly label: string;
    readonly enabled: boolean;
    readonly unavailableTitle?: string;
  }[] = [];

  for (const id of ROW_MENU_ITEMS) {
    const state = readCommandState(commands, id);
    if (state === null || !state.visible) continue;
    if (id === "prompter.send" && row.kind !== "script") continue;
    if (id === "prompter.jumpHere" && row.kind !== "script") continue;
    if (id === "rundown.previousValue" && previousCol === null) continue;
    if (id === "rundown.startScript" && row.kind !== "item") continue;
    if (
      id === "rundown.leaveUnnumbered" &&
      (row.kind === "header" || row.unnumbered)
    )
      continue;
    if (
      id === "rundown.numberRow" &&
      (row.kind === "header" || !row.unnumbered)
    )
      continue;

    let enabled = state.enabled;
    let unavailableTitle: string | undefined;
    if (id === "prompter.jumpHere" && !canJumpRowToPrompter(row)) {
      enabled = false;
      unavailableTitle = PROMPTER_CONTROL_WORDS.jumpHereUnavailable;
    }
    if (id === "rundown.openBeside" && row.kind !== "script") enabled = false;
    if (id === "rundown.moveUp" && isFirst) enabled = false;
    if (id === "rundown.moveDown" && isLast) enabled = false;

    entries.push({ id, label: state.label, enabled, unavailableTitle });
  }

  if (!entries.some((entry) => entry.enabled)) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onBeforeOpen(row.id);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="cursor-pointer text-fg-muted opacity-0 transition-opacity duration-(--dur-fast) hover:bg-subtle hover:text-fg focus-visible:opacity-100 data-popup-open:opacity-100 [.mn-row:hover_&]:opacity-100 [.mn-row:focus-within_&]:opacity-100 [@media(hover:none)]:opacity-100"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-icon" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-menu-min max-w-menu-max"
      >
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            data-tour={entry.id}
            disabled={!entry.enabled}
            title={entry.unavailableTitle}
            aria-label={entry.unavailableTitle ?? entry.label}
            className={
              entry.enabled
                ? "cursor-pointer hover:bg-subtle"
                : "cursor-not-allowed text-fg-muted opacity-50"
            }
            onClick={() => {
              onBeforeOpen(row.id);
              if (
                entry.id === "rundown.previousValue" &&
                previousCol !== null
              ) {
                onOpenPrevious(row.id, previousCol);
                return;
              }
              commands.run(entry.id, "menu");
            }}
          >
            {entry.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface RundownRowsBinding {
  onMoveRow(fromIndex: number, toIndex: number): void;
  onMoveRows(rowIds: readonly string[], toIndex: number): void;
  onBeforeMenuOpen(rowId: string): void;
}

/**
 * Provides all row actions in `rundownActions`'s `rows` slot (preserving `undo` and `redo`), binds DOM `copy` and
 * `paste` events on `gridContainerRef`, and exposes drag-move and row-menu activation callbacks.
 */
export function useRundownRows(options: {
  readonly docId: string;
  readonly session: RundownSessionControls;
  readonly columnIds: readonly RundownColumnId[];
  readonly titleColumn: "segment" | "story";
  readonly gridRef: RefObject<EditableGridHandle | null>;
  readonly gridContainerRef: RefObject<HTMLDivElement | null>;
}): RundownRowsBinding {
  const { docId, session, columnIds, titleColumn, gridRef, gridContainerRef } =
    options;
  const services = useServices();
  const environment = useEnvironment();
  const pendingFocusRef = useRef<GridCellCoord | null>(null);
  const focusCell = useCallback(
    (coord: GridCellCoord): void => {
      pendingFocusRef.current = coord;
      gridRef.current?.focusCell(coord.rowId, coord.columnId);
    },
    [gridRef],
  );

  const ctxRef = useRef<RowActionContext>({
    docId,
    session,
    columnIds,
    titleColumn,
    gridRef,
    services,
    environment,
    focusCell,
  });
  ctxRef.current = {
    docId,
    session,
    columnIds,
    titleColumn,
    gridRef,
    services,
    environment,
    focusCell,
  };

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null || gridRef.current === null) return;
    const rows = session.view.rundown?.rows;
    if (rows === undefined || !rows.some((row) => row.id === pending.rowId))
      return;
    pendingFocusRef.current = null;
    gridRef.current.focusCell(pending.rowId, pending.columnId);
  }, [session.view.rundown, gridRef]);

  useEffect(() => {
    const prior = rundownActions.slot("rows") ?? {};
    const actions = Object.freeze({
      ...(prior.undo !== undefined ? { undo: prior.undo } : {}),
      ...(prior.redo !== undefined ? { redo: prior.redo } : {}),
      addRow: () => addRundownRow(ctxRef.current, "item"),
      addHeaderRow: () => addRundownRow(ctxRef.current, "header"),
      deleteRows: () => deleteSelectedRows(ctxRef.current),
      moveUp: () => stepMoveRows(ctxRef.current, -1),
      moveDown: () => stepMoveRows(ctxRef.current, 1),
      copyRows: () => {
        copySelectedRows(ctxRef.current);
      },
      pasteRows: () => {
        void pasteIntoRundown(ctxRef.current);
      },
      startScript: () => {
        void startScriptForRow(ctxRef.current);
      },
      leaveUnnumbered: () => toggleRowUnnumbered(ctxRef.current, true),
      numberRow: () => toggleRowUnnumbered(ctxRef.current, false),
    });
    rundownActions.provide("rows", actions);
    return () => {
      if (rundownActions.slot("rows") === actions)
        rundownActions.provide("rows", Object.freeze({}));
    };
  }, [docId]);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (container === null) return;
    const onCopy = (event: ClipboardEvent): void => {
      const cur = ctxRef.current;
      if (cur.session.view.editingCell || isEditableInputTarget(event.target))
        return;
      if (copySelectedRows(cur, event.clipboardData)) {
        event.preventDefault();
      }
    };
    const onPaste = (event: ClipboardEvent): void => {
      const cur = ctxRef.current;
      if (cur.session.view.editingCell || isEditableInputTarget(event.target))
        return;
      const rawJson = event.clipboardData?.getData(RUNDOWN_ROWS_MIME) ?? "";
      const plain = event.clipboardData?.getData("text/plain") ?? "";
      const parsed =
        rawJson !== "" ? parseClipboardRows(rawJson) : readCopiedRows(plain);
      if (parsed === null && rawJson === "" && plain !== "") return;
      event.preventDefault();
      void pasteIntoRundown(cur, parsed);
    };
    container.addEventListener("copy", onCopy);
    container.addEventListener("paste", onPaste);
    return () => {
      container.removeEventListener("copy", onCopy);
      container.removeEventListener("paste", onPaste);
    };
  }, [docId, gridContainerRef]);

  const onMoveRow = useCallback((fromIndex: number, toIndex: number): void => {
    const cur = ctxRef.current;
    const row = cur.session.view.rundown?.rows[fromIndex];
    if (row === undefined) return;
    dragMoveRows(cur, [row.id], toIndex);
  }, []);

  const onMoveRows = useCallback(
    (rowIds: readonly string[], toIndex: number): void => {
      dragMoveRows(ctxRef.current, rowIds, toIndex);
    },
    [],
  );

  const onBeforeMenuOpen = useCallback((rowId: string): void => {
    const cur = ctxRef.current;
    const { selectedRowIds, activeCell } = cur.session.view;
    if (!selectedRowIds.has(rowId)) {
      if (selectedRowIds.size > 0) cur.session.setSelection([]);
      cur.session.setActiveCell({
        rowId,
        columnId:
          activeCell?.rowId === rowId ? activeCell.columnId : cur.titleColumn,
      });
    }
  }, []);

  return { onMoveRow, onMoveRows, onBeforeMenuOpen };
}
