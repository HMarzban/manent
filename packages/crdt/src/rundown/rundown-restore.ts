// Atomic rundown restore writer: applies planned client-owned restore ops in one Yjs transaction without touching server-only keys.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
  isBlockId,
} from "@manent/schema";
import type {
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { ORIGIN_RESTORE } from "../restore-origin.ts";
import { compareStrings, keysBetween } from "./rundown-order.ts";
import {
  STORED_COLUMNS,
  assertCellValue,
  assertFields,
  assertWellFormed,
  isColumnId,
  isRowKind,
  isSafeInt,
  isStoredColumn,
  readCell,
  requireRowMap,
} from "./rundown-read.ts";

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

/** Structurally compatible with `RundownRestoreOp` from `@manent/revisions`. */
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
      readonly previous?: RundownCellPrevious | null;
    };

export interface ApplyRundownRestoreOptions {
  readonly userId: string;
  readonly now: number | (() => number);
  /** Defaults to `ORIGIN_RESTORE` so local undo scopes never track a restore. */
  readonly origin?: unknown;
}

interface StoredRowRef {
  id: string;
  order: string;
  map: Y.Map<unknown>;
}

function sortedRowRefs(rowsMap: Y.Map<unknown>): StoredRowRef[] {
  const refs: StoredRowRef[] = [];
  for (const [key, value] of rowsMap.entries()) {
    if (!(value instanceof Y.Map)) continue;
    const rawOrder = value.get("order");
    refs.push({
      id: key,
      order: typeof rawOrder === "string" ? rawOrder : "",
      map: value,
    });
  }
  return refs.toSorted(
    (a, b) => compareStrings(a.order, b.order) || compareStrings(a.id, b.id),
  );
}

function planPlacement(
  existing: readonly StoredRowRef[],
  after: string | null,
): { keys: string[]; tied: StoredRowRef[] } {
  let beforeKey: string | null = null;
  let afterIndex = 0;
  if (after !== null) {
    const idx = existing.findIndex((ref) => ref.id === after);
    if (idx === -1) throw new RangeError(`there is no rundown row "${after}"`);
    beforeKey = existing[idx]!.order;
    afterIndex = idx + 1;
  }
  const tied: StoredRowRef[] = [];
  if (beforeKey !== null) {
    while (
      afterIndex + tied.length < existing.length &&
      existing[afterIndex + tied.length]!.order === beforeKey
    )
      tied.push(existing[afterIndex + tied.length]!);
  }
  const high = existing[afterIndex + tied.length]?.order ?? null;
  return { keys: keysBetween(beforeKey, high, 1 + tied.length), tied };
}

function assertPrevious(
  columnId: RundownColumnId,
  previous: RundownCellPrevious | null,
): void {
  if (previous === null) return;
  assertCellValue(columnId, previous.value);
  assertWellFormed(previous.userId, "previous.userId");
  if (!isSafeInt(previous.setAt))
    throw new RangeError(
      `previous.setAt must be an integer, not ${previous.setAt}`,
    );
}

function assertRowExists(liveIds: ReadonlySet<string>, rowId: string): void {
  if (!liveIds.has(rowId))
    throw new RangeError(`there is no rundown row "${rowId}"`);
}

function validateInsertOp(
  liveIds: Set<string>,
  row: RestoredRow,
  after: string | null,
): void {
  if (!isBlockId(row.id))
    throw new RangeError(
      `rundown row id must be a valid block id, not "${row.id}"`,
    );
  if (liveIds.has(row.id))
    throw new RangeError(`rundown row "${row.id}" already exists`);
  if (after !== null) assertRowExists(liveIds, after);
  if (!isRowKind(row.kind))
    throw new RangeError(`unknown rundown row kind "${row.kind}"`);
  if (row.blockId !== null && !isBlockId(row.blockId))
    throw new RangeError(
      `row blockId must be a valid block id, not "${row.blockId}"`,
    );
  for (const [colId, cell] of Object.entries(row.cells)) {
    if (cell === undefined) continue;
    if (!isStoredColumn(colId))
      throw new RangeError(
        `rundown column "${colId}" cannot hold a stored cell`,
      );
    assertCellValue(colId, cell.value);
    assertPrevious(colId, cell.previous);
  }
  liveIds.add(row.id);
}

function validateOps(
  rowsMap: Y.Map<unknown>,
  ops: readonly RundownRestoreOp[],
): void {
  const liveIds = new Set<string>();
  for (const [key, value] of rowsMap.entries())
    if (value instanceof Y.Map) liveIds.add(key);

  for (const op of ops) {
    switch (op.op) {
      case "set_fields":
        assertFields(op.fields);
        break;
      case "set_columns":
        for (const col of op.columns)
          if (!isColumnId(col))
            throw new RangeError(`unknown rundown column "${col}"`);
        break;
      case "remove_row":
        liveIds.delete(op.rowId);
        break;
      case "move_row":
        assertRowExists(liveIds, op.rowId);
        if (op.after !== null) assertRowExists(liveIds, op.after);
        break;
      case "insert_row":
        validateInsertOp(liveIds, op.row, op.after);
        break;
      case "update_row_meta":
        assertRowExists(liveIds, op.rowId);
        if (op.meta.kind !== undefined && !isRowKind(op.meta.kind))
          throw new RangeError(`unknown rundown row kind "${op.meta.kind}"`);
        if (
          op.meta.blockId !== undefined &&
          op.meta.blockId !== null &&
          !isBlockId(op.meta.blockId)
        )
          throw new RangeError(
            `row blockId must be a valid block id, not "${op.meta.blockId}"`,
          );
        break;
      case "set_cell":
        assertRowExists(liveIds, op.rowId);
        if (!isStoredColumn(op.columnId))
          throw new RangeError(
            `rundown column "${op.columnId}" cannot hold a stored cell`,
          );
        assertCellValue(op.columnId, op.value);
        if (op.previous !== undefined) assertPrevious(op.columnId, op.previous);
        break;
    }
  }
}

function applyMoveRowOp(
  rowsMap: Y.Map<unknown>,
  rowId: string,
  after: string | null,
): void {
  const all = sortedRowRefs(rowsMap);
  let anchor = after;
  if (anchor === rowId) {
    const idx = all.findIndex((ref) => ref.id === rowId);
    anchor = idx > 0 ? all[idx - 1]!.id : null;
  }
  const remaining = all.filter((ref) => ref.id !== rowId);
  const { keys, tied } = planPlacement(remaining, anchor);
  requireRowMap(rowsMap, rowId).set("order", keys[0]!);
  for (let i = 0; i < tied.length; i++) tied[i]!.map.set("order", keys[1 + i]!);
}

function applyInsertRowOp(
  rowsMap: Y.Map<unknown>,
  row: RestoredRow,
  after: string | null,
  userId: string,
  setAt: number,
): void {
  const { keys, tied } = planPlacement(sortedRowRefs(rowsMap), after);
  const rowMap = new Y.Map<unknown>();
  rowMap.set("id", row.id);
  rowMap.set("order", keys[0]!);
  rowMap.set("kind", row.kind);
  const cellsMap = new Y.Map<unknown>();
  for (const columnId of STORED_COLUMNS) {
    const cell = row.cells[columnId];
    if (cell === undefined) continue;
    cellsMap.set(columnId, {
      value: cell.value,
      userId,
      setAt,
      previous: cell.previous === null ? null : { ...cell.previous },
    } satisfies RundownCellJSON);
  }
  rowMap.set("cells", cellsMap);
  rowMap.set("docId", row.docId);
  rowMap.set("blockId", row.blockId);
  rowMap.set("unnumbered", row.unnumbered === true);
  // Server-only keys (`durationMs`, `prompter`) are intentionally never written here.
  rowsMap.set(row.id, rowMap);
  for (let i = 0; i < tied.length; i++) tied[i]!.map.set("order", keys[1 + i]!);
}

function applySetCellOp(
  rowsMap: Y.Map<unknown>,
  op: Extract<RundownRestoreOp, { readonly op: "set_cell" }>,
  userId: string,
  setAt: number,
): void {
  const rowMap = requireRowMap(rowsMap, op.rowId);
  let rawCells = rowMap.get("cells");
  if (!(rawCells instanceof Y.Map)) {
    rawCells = new Y.Map<unknown>();
    rowMap.set("cells", rawCells);
  }
  const cellsMap = rawCells as Y.Map<unknown>;
  const current =
    op.previous === undefined ? readCell(cellsMap.get(op.columnId)) : null;
  const previous: RundownCellJSON["previous"] =
    op.previous !== undefined
      ? op.previous === null
        ? null
        : { ...op.previous }
      : current === null
        ? null
        : {
            value: current.value,
            userId: current.userId,
            setAt: current.setAt,
          };
  cellsMap.set(op.columnId, {
    value: op.value,
    userId,
    setAt,
    previous,
  } satisfies RundownCellJSON);
}

/**
 * Applies `ops` atomically inside one Yjs transaction under `options.origin`
 * (defaulting to `ORIGIN_RESTORE`). Validates every operation before starting
 * the transaction, never touches server-only `durationMs` or `prompter` keys,
 * and returns the number of operations applied.
 */
export function applyRundownRestore(
  doc: CrdtDoc,
  ops: readonly RundownRestoreOp[],
  options: ApplyRundownRestoreOptions,
): number {
  assertWellFormed(options.userId, "userId");
  const setAt = typeof options.now === "function" ? options.now() : options.now;
  if (!isSafeInt(setAt))
    throw new RangeError(`now must be an integer, not ${setAt}`);
  const ydoc = yDocOf(doc);
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  validateOps(rowsMap, ops);
  if (ops.length === 0) return 0;

  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  const columnsArr = ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT);
  const origin = options.origin === undefined ? ORIGIN_RESTORE : options.origin;

  let applied = 0;
  ydoc.transact(() => {
    for (const op of ops) {
      switch (op.op) {
        case "set_fields":
          for (const [k, v] of Object.entries(op.fields))
            if (v !== undefined) fieldsMap.set(k, v);
          applied++;
          break;
        case "set_columns":
          if (columnsArr.length > 0) columnsArr.delete(0, columnsArr.length);
          if (op.columns.length > 0) columnsArr.insert(0, [...op.columns]);
          applied++;
          break;
        case "remove_row":
          if (rowsMap.has(op.rowId)) {
            rowsMap.delete(op.rowId);
            applied++;
          }
          break;
        case "move_row":
          applyMoveRowOp(rowsMap, op.rowId, op.after);
          applied++;
          break;
        case "insert_row":
          applyInsertRowOp(rowsMap, op.row, op.after, options.userId, setAt);
          applied++;
          break;
        case "update_row_meta": {
          const rowMap = requireRowMap(rowsMap, op.rowId);
          for (const [k, v] of Object.entries(op.meta))
            if (v !== undefined) rowMap.set(k, v);
          applied++;
          break;
        }
        case "set_cell":
          applySetCellOp(rowsMap, op, options.userId, setAt);
          applied++;
          break;
      }
    }
  }, origin);
  return applied;
}
