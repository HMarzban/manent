// Synchronous rundown row actions: add, header, delete, move, copy and row numbering toggle.
import {
  insertRows,
  moveRows,
  readRundown,
  removeRows,
  setRowUnnumbered,
} from "@manent/crdt";
import type { RundownClock } from "@manent/pagination";
import { randomBlockId } from "@manent/schema";
import type {
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import { RUNDOWN_WORDS } from "@manent/ui";
import type { EditableGridHandle, GridCellCoord } from "@manent/ui";
import type { Environment, PersonServices } from "../services/ports.ts";
import {
  RUNDOWN_ROWS_MIME,
  rememberCopiedRows,
  serializeRowsForClipboard,
} from "./clipboard.ts";
import { rowTitleOf } from "./dur-format.ts";
import { buildRundownClock } from "./rundown-access.ts";
import type { RundownSessionControls } from "./rundown-session.ts";

/** S3-RG-05 brief message when Move up runs on the first row. */
export const MOVE_UP_FIRST_ROW_TEXT =
  "Move up isn't available on the first row.";

/** S3-RG-05 brief message when Move down runs on the last row. */
export const MOVE_DOWN_LAST_ROW_TEXT =
  "Move down isn't available on the last row.";

const UNDO_ACTION = Object.freeze([{ label: "Undo", commandId: "edit.undo" }]);

export interface RowActionContext {
  readonly docId: string;
  readonly session: RundownSessionControls;
  readonly columnIds: readonly RundownColumnId[];
  readonly titleColumn: "segment" | "story";
  readonly gridRef: { readonly current: EditableGridHandle | null };
  readonly services: PersonServices;
  readonly environment: Environment;
  focusCell?(coord: GridCellCoord): void;
}

/** Target row ids in rundown order: selected rows when non-empty, else the active row. */
export function targetRowIdsOf(
  rundown: RundownJSON,
  selectedRowIds: ReadonlySet<string>,
  activeCell: GridCellCoord | null,
): string[] {
  if (selectedRowIds.size > 0) {
    return rundown.rows
      .filter((row) => selectedRowIds.has(row.id))
      .map((row) => row.id);
  }
  if (
    activeCell !== null &&
    rundown.rows.some((row) => row.id === activeCell.rowId)
  ) {
    return [activeCell.rowId];
  }
  return [];
}

/** Row id after which new or pasted rows are inserted; null when inserting into an empty rundown. */
export function insertAfterRowId(
  rundown: RundownJSON,
  selectedRowIds: ReadonlySet<string>,
  activeCell: GridCellCoord | null,
): string | null {
  const targets = targetRowIdsOf(rundown, selectedRowIds, activeCell);
  return targets.at(-1) ?? rundown.rows.at(-1)?.id ?? null;
}

function rowLabelAt(
  row: RundownRowJSON,
  index: number,
  clock: RundownClock | null,
): string {
  const title = rowTitleOf(row);
  if (title !== "") return title;
  const number = clock?.rows.find((entry) => entry.id === row.id)?.number;
  return RUNDOWN_WORDS.rowFallback(number ?? index + 1);
}

/** Computes the destination anchor for moving `targetIds` one step up (`-1`) or down (`1`). */
export function planStepMove(
  rows: readonly RundownRowJSON[],
  targetIds: readonly string[],
  direction: -1 | 1,
  clock: RundownClock | null,
):
  | { readonly ok: false; readonly reason: "first" | "last" }
  | {
      readonly ok: true;
      readonly movingIds: readonly string[];
      readonly afterId: string | null;
      readonly movedLabel: string;
      readonly afterLabel: string | null;
    } {
  const set = new Set(targetIds);
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (set.has(rows[i]!.id)) indices.push(i);
  }
  if (indices.length === 0) return { ok: false, reason: "first" };
  const movingIds = indices.map((idx) => rows[idx]!.id);
  const firstIdx = indices[0]!;
  const lastIdx = indices.at(-1)!;
  const movedLabel = rowLabelAt(rows[firstIdx]!, firstIdx, clock);

  if (direction === -1) {
    if (firstIdx <= 0) return { ok: false, reason: "first" };
    const afterIdx = firstIdx - 2;
    const afterRow = afterIdx >= 0 ? rows[afterIdx]! : null;
    return {
      ok: true,
      movingIds,
      afterId: afterRow?.id ?? null,
      movedLabel,
      afterLabel:
        afterRow === null ? null : rowLabelAt(afterRow, afterIdx, clock),
    };
  }
  if (lastIdx >= rows.length - 1) return { ok: false, reason: "last" };
  const afterRow = rows[lastIdx + 1]!;
  return {
    ok: true,
    movingIds,
    afterId: afterRow.id,
    movedLabel,
    afterLabel: rowLabelAt(afterRow, lastIdx + 1, clock),
  };
}

/** Computes the destination anchor for moving `movingIds` to `toIndex` among the remaining rows. */
export function planIndexMove(
  rows: readonly RundownRowJSON[],
  movingIds: readonly string[],
  toIndex: number,
): string | null {
  const moving = new Set(movingIds);
  const remaining = rows.filter((row) => !moving.has(row.id));
  const clamped = Math.max(0, Math.min(remaining.length, toIndex));
  return clamped === 0 ? null : (remaining[clamped - 1]?.id ?? null);
}

function pushBrief(services: PersonServices, text: string): void {
  services.messages.withdraw("rundown.action");
  services.messages.withdraw("rundown.undo");
  services.messages.push({
    id: "rundown.action",
    text,
    lifetime: "brief",
    ownWork: false,
    actions: [],
  });
}

function pushReverse(services: PersonServices, text: string): void {
  services.messages.withdraw("rundown.action");
  services.messages.withdraw("rundown.undo");
  services.messages.push({
    id: "rundown.action",
    text,
    lifetime: "reverse",
    ownWork: false,
    actions: [...UNDO_ACTION],
  });
}

/** Inserts an item or header row after the current selection and focuses its title cell. */
export function addRundownRow(
  ctx: RowActionContext,
  kind: "item" | "header",
): void {
  const { session, titleColumn, gridRef } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const after = insertAfterRowId(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  const id = randomBlockId();
  insertRows(handle.doc(), [{ id, kind, docId: null, blockId: null }], after);
  session.recordUndo({
    message:
      kind === "header"
        ? RUNDOWN_WORDS.undidAddHeaderRow
        : RUNDOWN_WORDS.undidAddRow,
  });
  session.setSelection([]);
  const target: GridCellCoord = { rowId: id, columnId: titleColumn };
  session.setActiveCell(target);
  if (ctx.focusCell !== undefined) ctx.focusCell(target);
  else gridRef.current?.focusCell(id, titleColumn);
}

/** Removes the selected rows (or active row) in one undo step and announces S3-RG-49. */
export function deleteSelectedRows(ctx: RowActionContext): void {
  const { session, services, titleColumn } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const targets = targetRowIdsOf(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  if (targets.length === 0) return;

  const targetSet = new Set(targets);
  const firstIdx = rundown.rows.findIndex((row) => targetSet.has(row.id));
  const survivors = rundown.rows.filter((row) => !targetSet.has(row.id));
  const nextRow = survivors[Math.min(firstIdx, survivors.length - 1)] ?? null;

  removeRows(handle.doc(), targets);
  session.recordUndo({ message: RUNDOWN_WORDS.undidDelete });
  session.setSelection([]);
  session.setActiveCell(
    nextRow === null
      ? null
      : {
          rowId: nextRow.id,
          columnId: session.view.activeCell?.columnId ?? titleColumn,
        },
  );
  pushReverse(services, RUNDOWN_WORDS.deletedRows(targets.length));
}

/** Moves the selected rows (or active row) up or down by one place; shows S3-RG-05 at the first or last row. */
export function stepMoveRows(ctx: RowActionContext, direction: -1 | 1): void {
  const { session, services, environment, gridRef, titleColumn } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const targets = targetRowIdsOf(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  if (targets.length === 0) return;

  const plan = planStepMove(
    rundown.rows,
    targets,
    direction,
    session.view.clock,
  );
  if (!plan.ok) {
    pushBrief(
      services,
      plan.reason === "first"
        ? MOVE_UP_FIRST_ROW_TEXT
        : MOVE_DOWN_LAST_ROW_TEXT,
    );
    return;
  }

  moveRows(handle.doc(), plan.movingIds, plan.afterId);
  session.recordUndo({ message: RUNDOWN_WORDS.undidMoveRows });
  const announcement =
    plan.afterLabel === null
      ? RUNDOWN_WORDS.movedToTop(plan.movedLabel)
      : RUNDOWN_WORDS.movedAfter(plan.movedLabel, plan.afterLabel);
  environment.dom.announce(announcement);
  const focusRow = session.view.activeCell?.rowId ?? plan.movingIds[0]!;
  const focusCol = session.view.activeCell?.columnId ?? titleColumn;
  gridRef.current?.focusCell(focusRow, focusCol);
}

/** Moves `movingIds` to `toIndex` after a pointer or keyboard drag in one undo step. */
export function dragMoveRows(
  ctx: RowActionContext,
  movingIds: readonly string[],
  toIndex: number,
): void {
  const { session } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (
    handle === null ||
    rundown === null ||
    session.view.access !== "edit" ||
    movingIds.length === 0
  )
    return;
  const afterId = planIndexMove(rundown.rows, movingIds, toIndex);
  moveRows(handle.doc(), movingIds, afterId);
  session.recordUndo({ message: RUNDOWN_WORDS.undidMoveRows });
}

/** Copies the selected rows (or active row) into `clipboardData` when provided and into the in-memory buffer. */
export function copySelectedRows(
  ctx: RowActionContext,
  clipboardData?: DataTransfer | null,
): boolean {
  const { docId, session, columnIds } = ctx;
  const rundown = session.view.rundown;
  if (rundown === null) return false;
  const targets = targetRowIdsOf(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  if (targets.length === 0) return false;
  const targetSet = new Set(targets);
  const rows = rundown.rows.filter((row) => targetSet.has(row.id));
  const serialised = serializeRowsForClipboard({
    sourceDocId: docId,
    rows,
    columnIds,
    clock: session.view.clock,
  });
  rememberCopiedRows(serialised.data, serialised.tsv);
  if (clipboardData !== undefined && clipboardData !== null) {
    clipboardData.setData(RUNDOWN_ROWS_MIME, serialised.json);
    clipboardData.setData("text/plain", serialised.tsv);
  } else if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    void navigator.clipboard.writeText(serialised.tsv).catch(() => {
      // clipboard write permission unavailable: in-memory copy still serves Paste
    });
  }
  return true;
}

/** Toggles whether the active non-header row is skipped by row numbering in one undo step (S3-RG-59). */
export function toggleRowUnnumbered(
  ctx: RowActionContext,
  unnumbered: boolean,
): void {
  const { session, services } = ctx;
  const handle = session.getHandle();
  const rundown = session.view.rundown;
  if (handle === null || rundown === null || session.view.access !== "edit")
    return;
  const targets = targetRowIdsOf(
    rundown,
    session.view.selectedRowIds,
    session.view.activeCell,
  );
  const rowId = targets[0];
  if (rowId === undefined) return;
  const rowIdx = rundown.rows.findIndex((candidate) => candidate.id === rowId);
  if (rowIdx === -1) return;
  const row = rundown.rows[rowIdx]!;
  if (row.kind === "header" || row.unnumbered === unnumbered) return;

  setRowUnnumbered(handle.doc(), row.id, unnumbered);
  session.recordUndo({ message: null });

  if (unnumbered) {
    const label = rowLabelAt(row, rowIdx, session.view.clock);
    pushReverse(services, RUNDOWN_WORDS.rowUnnumbered(label));
    return;
  }
  const updatedClock = buildRundownClock(readRundown(handle.doc()), () => null);
  const numbered =
    updatedClock.rows.find((entry) => entry.id === row.id)?.number ?? 1;
  const label = rowTitleOf(row) || RUNDOWN_WORDS.rowFallback(numbered);
  pushReverse(services, RUNDOWN_WORDS.rowNumbered(label, numbered));
}
