// Undo and redo over a rundown's fields, columns and rows, never emitting server-only row keys.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import {
  ABSENT,
  cloneValue,
  isClientRowKey,
  recoverDeletedRows,
  snapshotLiveRow,
  writeClientRow,
} from "./rundown-undo-snapshot.ts";
import type {
  ClientRowKey,
  ClientRowSnapshot,
} from "./rundown-undo-snapshot.ts";

export interface RundownUndo {
  undo(): void;
  redo(): void;
  stopCapturing(): void;
  destroy(): void;
}

const UNDO_ORIGIN = Symbol("rundown_undo");

type UndoOp =
  | { kind: "field"; key: string; before: unknown; after: unknown }
  | { kind: "columns"; before: unknown[]; after: unknown[] }
  | { kind: "row_add"; rowId: string; after: ClientRowSnapshot }
  | { kind: "row_delete"; rowId: string; before: ClientRowSnapshot }
  | {
      kind: "row_replace";
      rowId: string;
      before: ClientRowSnapshot;
      after: ClientRowSnapshot;
    }
  | {
      kind: "row_key";
      rowId: string;
      key: ClientRowKey;
      before: unknown;
      after: unknown;
    }
  | {
      kind: "cell";
      rowId: string;
      columnId: string;
      before: unknown;
      after: unknown;
    };

interface PendingRecord {
  beforeColumns: unknown[];
  columnsChanged: boolean;
  addedRows: Set<string>;
  deletedRows: Set<string>;
  replacedRows: Set<string>;
  ops: UndoOp[];
}

function applyColumns(
  columnsArr: Y.Array<unknown>,
  next: readonly unknown[],
): void {
  if (columnsArr.length > 0) columnsArr.delete(0, columnsArr.length);
  if (next.length > 0) columnsArr.insert(0, next.map(cloneValue));
}

function applyMapEntry(map: Y.Map<unknown>, key: string, value: unknown): void {
  if (value === ABSENT) map.delete(key);
  else map.set(key, cloneValue(value));
}

function applyOp(
  op: UndoOp,
  direction: "undo" | "redo",
  fieldsMap: Y.Map<unknown>,
  columnsArr: Y.Array<unknown>,
  rowsMap: Y.Map<unknown>,
): void {
  const isUndo = direction === "undo";
  switch (op.kind) {
    case "field":
      applyMapEntry(fieldsMap, op.key, isUndo ? op.before : op.after);
      return;
    case "columns":
      applyColumns(columnsArr, isUndo ? op.before : op.after);
      return;
    case "row_add":
      if (isUndo) {
        const live = rowsMap.get(op.rowId);
        if (live instanceof Y.Map) op.after = snapshotLiveRow(op.rowId, live);
        rowsMap.delete(op.rowId);
      } else writeClientRow(rowsMap, op.rowId, op.after);
      return;
    case "row_delete":
      if (isUndo) writeClientRow(rowsMap, op.rowId, op.before);
      else {
        const live = rowsMap.get(op.rowId);
        if (live instanceof Y.Map) op.before = snapshotLiveRow(op.rowId, live);
        rowsMap.delete(op.rowId);
      }
      return;
    case "row_replace":
      writeClientRow(rowsMap, op.rowId, isUndo ? op.before : op.after);
      return;
    case "row_key": {
      const rowMap = rowsMap.get(op.rowId);
      if (rowMap instanceof Y.Map)
        applyMapEntry(rowMap, op.key, isUndo ? op.before : op.after);
      return;
    }
    case "cell": {
      const rowMap = rowsMap.get(op.rowId);
      if (!(rowMap instanceof Y.Map)) return;
      const value = isUndo ? op.before : op.after;
      const existing = rowMap.get("cells");
      if (existing instanceof Y.Map) {
        applyMapEntry(existing, op.columnId, value);
        return;
      }
      if (value === ABSENT) return;
      const created = new Y.Map<unknown>();
      created.set(op.columnId, cloneValue(value));
      rowMap.set("cells", created);
      return;
    }
    default:
      op satisfies never;
  }
}

function recordRowEvents(
  rec: PendingRecord,
  events: readonly Y.YEvent<Y.AbstractType<unknown>>[],
  rowsMap: Y.Map<unknown>,
): void {
  for (const event of events) {
    if (!(event instanceof Y.YMapEvent)) continue;
    if (event.path.length === 0) {
      for (const [rowId, change] of event.changes.keys) {
        if (change.action === "add") rec.addedRows.add(rowId);
        else if (change.action === "delete") rec.deletedRows.add(rowId);
        else rec.replacedRows.add(rowId);
      }
      continue;
    }
    const rowId = event.path[0];
    if (typeof rowId !== "string") continue;
    if (
      rec.addedRows.has(rowId) ||
      rec.deletedRows.has(rowId) ||
      rec.replacedRows.has(rowId)
    )
      continue;
    const rowMap = rowsMap.get(rowId);
    if (!(rowMap instanceof Y.Map)) continue;
    if (event.path.length === 1) {
      for (const [key, change] of event.changes.keys) {
        if (!isClientRowKey(key)) continue;
        rec.ops.push({
          kind: "row_key",
          rowId,
          key,
          before:
            change.action === "add" ? ABSENT : cloneValue(change.oldValue),
          after:
            change.action === "delete" ? ABSENT : cloneValue(rowMap.get(key)),
        });
      }
      continue;
    }
    if (event.path.length === 2 && event.path[1] === "cells") {
      const cellsMap = rowMap.get("cells");
      if (!(cellsMap instanceof Y.Map)) continue;
      for (const [columnId, change] of event.changes.keys) {
        rec.ops.push({
          kind: "cell",
          rowId,
          columnId,
          before:
            change.action === "add" ? ABSENT : cloneValue(change.oldValue),
          after:
            change.action === "delete"
              ? ABSENT
              : cloneValue(cellsMap.get(columnId)),
        });
      }
    }
  }
}

function finalizeRecord(
  rec: PendingRecord,
  tr: Y.Transaction,
  columnsArr: Y.Array<unknown>,
  rowsMap: Y.Map<unknown>,
): UndoOp[] {
  const ops: UndoOp[] = [...rec.ops];
  if (rec.columnsChanged)
    ops.push({
      kind: "columns",
      before: rec.beforeColumns,
      after: columnsArr.toArray().map(cloneValue),
    });
  for (const rowId of rec.addedRows) {
    const live = rowsMap.get(rowId);
    if (live instanceof Y.Map)
      ops.push({
        kind: "row_add",
        rowId,
        after: snapshotLiveRow(rowId, live),
      });
  }
  const needDeleted = new Set([...rec.deletedRows, ...rec.replacedRows]);
  if (needDeleted.size === 0) return ops;
  const recovered = recoverDeletedRows(rowsMap, tr, needDeleted);
  for (const rowId of rec.deletedRows) {
    const before = recovered.get(rowId);
    if (before !== undefined) ops.push({ kind: "row_delete", rowId, before });
  }
  for (const rowId of rec.replacedRows) {
    const before = recovered.get(rowId);
    const live = rowsMap.get(rowId);
    if (before !== undefined && live instanceof Y.Map)
      ops.push({
        kind: "row_replace",
        rowId,
        before,
        after: snapshotLiveRow(rowId, live),
      });
  }
  return ops;
}

/**
 * An undo manager over a rundown's fields, columns and rows that records only
 * transactions whose origin is in `trackedOrigins` (and not marked
 * `addToHistory: false`). Each transaction is one undo step, and neither undo
 * nor redo ever writes server-only row keys (`durationMs` or `prompter`).
 */
export function createRundownUndo(
  doc: CrdtDoc,
  options: { trackedOrigins: readonly unknown[] },
): RundownUndo {
  const ydoc = yDocOf(doc);
  const tracked = new Set(options.trackedOrigins);
  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  const columnsArr = ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT);
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const undoStack: UndoOp[][] = [];
  const redoStack: UndoOp[][] = [];
  const pending = new Map<Y.Transaction, PendingRecord>();

  const onBefore = (tr: Y.Transaction): void => {
    if (tr.origin === UNDO_ORIGIN || !tracked.has(tr.origin)) return;
    pending.set(tr, {
      beforeColumns: columnsArr.toArray().map(cloneValue),
      columnsChanged: false,
      addedRows: new Set(),
      deletedRows: new Set(),
      replacedRows: new Set(),
      ops: [],
    });
  };
  const onFields = (event: Y.YMapEvent<unknown>, tr: Y.Transaction): void => {
    const rec = pending.get(tr);
    if (rec === undefined) return;
    for (const [key, change] of event.changes.keys) {
      rec.ops.push({
        kind: "field",
        key,
        before: change.action === "add" ? ABSENT : cloneValue(change.oldValue),
        after:
          change.action === "delete" ? ABSENT : cloneValue(fieldsMap.get(key)),
      });
    }
  };
  const onColumns = (
    _event: Y.YArrayEvent<unknown>,
    tr: Y.Transaction,
  ): void => {
    const rec = pending.get(tr);
    if (rec !== undefined) rec.columnsChanged = true;
  };
  const onRows = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    tr: Y.Transaction,
  ): void => {
    const rec = pending.get(tr);
    if (rec !== undefined) recordRowEvents(rec, events, rowsMap);
  };
  const onAfter = (tr: Y.Transaction): void => {
    const rec = pending.get(tr);
    if (rec === undefined) return;
    pending.delete(tr);
    if (tr.meta.get("addToHistory") === false) return;
    const ops = finalizeRecord(rec, tr, columnsArr, rowsMap);
    if (ops.length === 0) return;
    undoStack.push(ops);
    redoStack.length = 0;
  };

  ydoc.on("beforeTransaction", onBefore);
  fieldsMap.observe(onFields);
  columnsArr.observe(onColumns);
  rowsMap.observeDeep(onRows);
  ydoc.on("afterTransaction", onAfter);

  return {
    undo(): void {
      const step = undoStack.pop();
      if (step === undefined) return;
      ydoc.transact(() => {
        for (let i = step.length - 1; i >= 0; i--)
          applyOp(step[i]!, "undo", fieldsMap, columnsArr, rowsMap);
      }, UNDO_ORIGIN);
      redoStack.push(step);
    },
    redo(): void {
      const step = redoStack.pop();
      if (step === undefined) return;
      ydoc.transact(() => {
        for (const op of step)
          applyOp(op, "redo", fieldsMap, columnsArr, rowsMap);
      }, UNDO_ORIGIN);
      undoStack.push(step);
    },
    stopCapturing(): void {},
    destroy(): void {
      ydoc.off("beforeTransaction", onBefore);
      fieldsMap.unobserve(onFields);
      columnsArr.unobserve(onColumns);
      rowsMap.unobserveDeep(onRows);
      ydoc.off("afterTransaction", onAfter);
      pending.clear();
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
