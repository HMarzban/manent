// Pure rundown restore planning: turns the current rundown (or one row of it) into a target version without touching server-only fields and while keeping ADR 0052 cell.previous.
import type {
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import { longestIncreasingSubsequence } from "../compare/align.ts";
import { STORED_RUNDOWN_COLUMNS, sortRundownRows } from "./compare.ts";

/** Whole-rundown restore or single-row restore. */
export type RundownRestoreScope =
  { readonly kind: "all" } | { readonly kind: "row"; readonly rowId: string };

/** Recorded writer and instant for cells written by a restore. */
export interface RundownRestoreOptions {
  readonly userId: string;
  readonly now: number;
}

/** Prior cell value stored for ADR 0052 one-step undo. */
export interface RundownCellPrevious {
  readonly value: string | number | null;
  readonly userId: string;
  readonly setAt: number;
}

/** Client-owned row payload for a re-inserted row; never holds `durationMs` or `prompter`. */
export interface RestoredRow {
  readonly id: string;
  readonly kind: RowKind;
  readonly cells: Readonly<Partial<Record<RundownColumnId, RundownCellJSON>>>;
  readonly docId: string | null;
  readonly blockId: string | null;
  readonly unnumbered: boolean;
}

/** Client-owned metadata fields that may be updated on an existing row. */
export interface RestoredRowMeta {
  readonly kind: RowKind;
  readonly docId: string | null;
  readonly blockId: string | null;
  readonly unnumbered: boolean;
}

/** One atomic restore operation on a rundown document. */
export type RundownRestoreOp =
  | { readonly op: "set_fields"; readonly fields: Partial<RundownFieldsJSON> }
  | { readonly op: "set_columns"; readonly columns: readonly RundownColumnId[] }
  | { readonly op: "remove_row"; readonly rowId: string }
  | {
      readonly op: "move_row";
      readonly rowId: string;
      readonly after: string | null;
    }
  | {
      readonly op: "insert_row";
      readonly after: string | null;
      readonly row: RestoredRow;
    }
  | {
      readonly op: "update_row_meta";
      readonly rowId: string;
      readonly meta: Partial<RestoredRowMeta>;
    }
  | {
      readonly op: "set_cell";
      readonly rowId: string;
      readonly columnId: RundownColumnId;
      readonly value: string | number | null;
      readonly previous: RundownCellPrevious | null;
    };

/** Planned operations, distinct items written, and the resulting rundown state. */
export interface RundownRestorePlan {
  readonly ops: readonly RundownRestoreOp[];
  readonly applied: number;
  readonly result: RundownJSON;
}

function deduplicateRows(rows: readonly RundownRowJSON[]): RundownRowJSON[] {
  const seen = new Set<string>();
  const out: RundownRowJSON[] = [];
  for (const row of sortRundownRows(rows)) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

const cloneCell = (cell: RundownCellJSON): RundownCellJSON => ({
  value: cell.value,
  userId: cell.userId,
  setAt: cell.setAt,
  previous: cell.previous === null ? null : { ...cell.previous },
});

function cloneCells(
  source: Readonly<Partial<Record<RundownColumnId, RundownCellJSON>>>,
): Partial<Record<RundownColumnId, RundownCellJSON>> {
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  for (const col of STORED_RUNDOWN_COLUMNS) {
    const cell = source[col];
    if (cell !== undefined) cells[col] = cloneCell(cell);
  }
  return cells;
}

const cloneRow = (row: RundownRowJSON): RundownRowJSON => ({
  ...row,
  cells: cloneCells(row.cells),
  prompter: row.prompter === null ? null : { ...row.prompter },
});

function restoredRowOf(
  row: RundownRowJSON,
  options: RundownRestoreOptions,
): RestoredRow {
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  for (const col of STORED_RUNDOWN_COLUMNS) {
    const cell = row.cells[col];
    if (cell !== undefined)
      cells[col] = {
        value: cell.value,
        userId: options.userId,
        setAt: options.now,
        previous: null,
      };
  }
  return {
    id: row.id,
    kind: row.kind,
    cells,
    docId: row.docId,
    blockId: row.blockId,
    unnumbered: row.unnumbered,
  };
}

function planRowUpdates(
  currentRow: RundownRowJSON,
  targetRow: RundownRowJSON,
  ops: RundownRestoreOp[],
): void {
  const meta: {
    kind?: RowKind;
    docId?: string | null;
    blockId?: string | null;
    unnumbered?: boolean;
  } = {};
  if (currentRow.kind !== targetRow.kind) meta.kind = targetRow.kind;
  if (currentRow.docId !== targetRow.docId) meta.docId = targetRow.docId;
  if (currentRow.blockId !== targetRow.blockId)
    meta.blockId = targetRow.blockId;
  if (currentRow.unnumbered !== targetRow.unnumbered)
    meta.unnumbered = targetRow.unnumbered;
  if (Object.keys(meta).length > 0)
    ops.push({ op: "update_row_meta", rowId: currentRow.id, meta });

  for (const columnId of STORED_RUNDOWN_COLUMNS) {
    const cur = currentRow.cells[columnId] ?? null;
    const tgt = targetRow.cells[columnId] ?? null;
    const targetVal = tgt?.value ?? null;
    if ((cur?.value ?? null) === targetVal) continue;
    ops.push({
      op: "set_cell",
      rowId: currentRow.id,
      columnId,
      value: targetVal,
      previous:
        cur === null
          ? null
          : { value: cur.value, userId: cur.userId, setAt: cur.setAt },
    });
  }
}

function anchorOfMissingRow(
  currentRows: readonly RundownRowJSON[],
  targetRows: readonly RundownRowJSON[],
  rowId: string,
): string | null {
  const present = new Set(currentRows.map((row) => row.id));
  for (let i = targetRows.findIndex((row) => row.id === rowId) - 1; i >= 0; i--)
    if (present.has(targetRows[i]!.id)) return targetRows[i]!.id;
  return null;
}

function countApplied(ops: readonly RundownRestoreOp[]): number {
  const rowIds = new Set<string>();
  let extra = 0;
  for (const op of ops) {
    if (op.op === "set_fields" || op.op === "set_columns") extra++;
    else rowIds.add(op.op === "insert_row" ? op.row.id : op.rowId);
  }
  return rowIds.size + extra;
}

function insertAtAnchor(
  rows: RundownRowJSON[],
  row: RundownRowJSON,
  after: string | null,
): void {
  if (after === null) {
    rows.unshift(row);
    return;
  }
  const idx = rows.findIndex((existing) => existing.id === after);
  if (idx === -1) rows.push(row);
  else rows.splice(idx + 1, 0, row);
}

/** Pure preview of `current` after applying `ops`, keeping surviving rows' `durationMs` and `prompter`. */
function applyOpsToJSON(
  current: RundownJSON,
  ops: readonly RundownRestoreOp[],
  options: RundownRestoreOptions,
): RundownJSON {
  const rundown: RundownFieldsJSON = { ...current.rundown };
  let columns: RundownColumnId[] = [...current.columns];
  const rows = sortRundownRows(current.rows).map(cloneRow);
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const op of ops) {
    switch (op.op) {
      case "set_fields":
        Object.assign(rundown, op.fields);
        break;
      case "set_columns":
        columns = [...op.columns];
        break;
      case "remove_row": {
        const idx = rows.findIndex((row) => row.id === op.rowId);
        if (idx !== -1) rows.splice(idx, 1);
        byId.delete(op.rowId);
        break;
      }
      case "move_row": {
        const idx = rows.findIndex((row) => row.id === op.rowId);
        if (idx === -1) break;
        insertAtAnchor(rows, rows.splice(idx, 1)[0]!, op.after);
        break;
      }
      case "insert_row": {
        const inserted: RundownRowJSON = {
          ...op.row,
          order: "",
          cells: cloneCells(op.row.cells),
          durationMs: null,
          prompter: null,
        };
        insertAtAnchor(rows, inserted, op.after);
        byId.set(inserted.id, inserted);
        break;
      }
      case "update_row_meta": {
        const row = byId.get(op.rowId);
        if (row !== undefined) Object.assign(row, op.meta);
        break;
      }
      case "set_cell": {
        const row = byId.get(op.rowId);
        if (row === undefined) break;
        row.cells[op.columnId] = {
          value: op.value,
          userId: options.userId,
          setAt: options.now,
          previous: op.previous === null ? null : { ...op.previous },
        };
        break;
      }
    }
  }
  return { rundown, columns, rows };
}

function diffFields(
  current: RundownFieldsJSON,
  target: RundownFieldsJSON,
): Partial<RundownFieldsJSON> {
  const changed: Partial<RundownFieldsJSON> = {};
  if (current.airDate !== target.airDate) changed.airDate = target.airDate;
  if (current.airAt !== target.airAt) changed.airAt = target.airAt;
  if (current.windowLeadMs !== target.windowLeadMs)
    changed.windowLeadMs = target.windowLeadMs;
  if (current.targetMs !== target.targetMs) changed.targetMs = target.targetMs;
  return changed;
}

/**
 * Plans the minimal client-owned operations that turn `current` (in full or
 * for one row) into `target`. Never writes `durationMs` or `prompter`, uses
 * LIS alignment to minimise row moves, and records the displaced cell value in
 * `previous` (ADR 0052) on every modified cell.
 */
export function planRundownRestore(
  current: RundownJSON,
  target: RundownJSON,
  scope: RundownRestoreScope,
  options: RundownRestoreOptions,
): RundownRestorePlan {
  const currentRows = deduplicateRows(current.rows);
  const targetRows = deduplicateRows(target.rows);
  const ops: RundownRestoreOp[] = [];

  if (scope.kind === "row") {
    const currentRow = currentRows.find((row) => row.id === scope.rowId);
    const targetRow = targetRows.find((row) => row.id === scope.rowId);
    if (currentRow !== undefined && targetRow !== undefined)
      planRowUpdates(currentRow, targetRow, ops);
    else if (currentRow === undefined && targetRow !== undefined)
      ops.push({
        op: "insert_row",
        after: anchorOfMissingRow(currentRows, targetRows, scope.rowId),
        row: restoredRowOf(targetRow, options),
      });
    else if (currentRow !== undefined && targetRow === undefined)
      ops.push({ op: "remove_row", rowId: scope.rowId });
    return {
      ops,
      applied: countApplied(ops),
      result: applyOpsToJSON(current, ops, options),
    };
  }

  const changedFields = diffFields(current.rundown, target.rundown);
  if (Object.keys(changedFields).length > 0)
    ops.push({ op: "set_fields", fields: changedFields });

  const columnsDiffer =
    current.columns.length !== target.columns.length ||
    current.columns.some((col, i) => col !== target.columns[i]);
  if (columnsDiffer)
    ops.push({ op: "set_columns", columns: [...target.columns] });

  const targetIds = new Set(targetRows.map((row) => row.id));
  for (const row of currentRows)
    if (!targetIds.has(row.id)) ops.push({ op: "remove_row", rowId: row.id });

  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const position = new Map(currentRows.map((row, i) => [row.id, i]));
  const positions = targetRows.flatMap((row) => {
    const idx = position.get(row.id);
    return idx === undefined ? [] : [idx];
  });
  const staying = new Set(
    longestIncreasingSubsequence(positions).map((k) => positions[k]!),
  );

  let after: string | null = null;
  for (const targetRow of targetRows) {
    const at = position.get(targetRow.id);
    if (at === undefined) {
      ops.push({
        op: "insert_row",
        after,
        row: restoredRowOf(targetRow, options),
      });
    } else {
      if (!staying.has(at))
        ops.push({ op: "move_row", rowId: targetRow.id, after });
      planRowUpdates(currentById.get(targetRow.id)!, targetRow, ops);
    }
    after = targetRow.id;
  }

  return {
    ops,
    applied: countApplied(ops),
    result: applyOpsToJSON(current, ops, options),
  };
}
