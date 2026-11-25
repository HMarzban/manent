// Rundown document writers: fields, columns, ordered rows, last-writer cells and authority metadata.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
  isBlockId,
} from "@manent/schema";
import type {
  PrompterStateJSON,
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { ORIGIN_SYSTEM } from "../settings.ts";
import { compareStrings, keysBetween } from "./rundown-order.ts";
import {
  assertCellValue,
  assertFields,
  assertWellFormed,
  isColumnId,
  isNonNegativeInt,
  isRowKind,
  isSafeInt,
  isStoredColumn,
  readCell,
  requireRowMap,
} from "./rundown-read.ts";

export { observeRundown, readRundown } from "./rundown-read.ts";

export interface NewRow {
  id: string;
  kind: RowKind;
  docId: string | null;
  blockId: string | null;
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
    const order = typeof rawOrder === "string" ? rawOrder : "";
    refs.push({ id: key, order, map: value });
  }
  return refs.toSorted(
    (a, b) => compareStrings(a.order, b.order) || compareStrings(a.id, b.id),
  );
}

function planPlacement(
  existing: readonly StoredRowRef[],
  after: string | null,
  count: number,
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
  return { keys: keysBetween(beforeKey, high, count + tied.length), tied };
}

/**
 * Initialises the rundown's fields and column list in one transaction.
 * Local rundown writers run with origin `null` so a rundown undo manager
 * tracking `null` captures them.
 */
export function initRundown(
  doc: CrdtDoc,
  fields: RundownFieldsJSON,
  columns: readonly RundownColumnId[],
): void {
  const ydoc = yDocOf(doc);
  assertFields(fields);
  for (const col of columns)
    if (!isColumnId(col))
      throw new RangeError(`unknown rundown column "${col}"`);
  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  const columnsArr = ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT);
  ydoc.transact(() => {
    fieldsMap.set("airDate", fields.airDate);
    fieldsMap.set("airAt", fields.airAt);
    fieldsMap.set("windowLeadMs", fields.windowLeadMs);
    fieldsMap.set("targetMs", fields.targetMs);
    if (columnsArr.length > 0) columnsArr.delete(0, columnsArr.length);
    if (columns.length > 0) columnsArr.insert(0, [...columns]);
  });
}

/** Inserts `rows` after `after` (or at the start when null) in one transaction. */
export function insertRows(
  doc: CrdtDoc,
  rows: readonly NewRow[],
  after: string | null,
): void {
  const ydoc = yDocOf(doc);
  if (rows.length === 0) return;
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isBlockId(row.id))
      throw new RangeError(
        `rundown row id must be a valid block id, not "${row.id}"`,
      );
    if (seen.has(row.id) || rowsMap.has(row.id))
      throw new RangeError(`rundown row "${row.id}" already exists`);
    seen.add(row.id);
    if (!isRowKind(row.kind))
      throw new RangeError(`unknown rundown row kind "${row.kind}"`);
    if (row.blockId !== null && !isBlockId(row.blockId))
      throw new RangeError(
        `row blockId must be a valid block id, not "${row.blockId}"`,
      );
  }
  const existing = sortedRowRefs(rowsMap);
  const { keys, tied } = planPlacement(existing, after, rows.length);
  ydoc.transact(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowMap = new Y.Map<unknown>();
      rowMap.set("id", row.id);
      rowMap.set("order", keys[i]!);
      rowMap.set("kind", row.kind);
      rowMap.set("cells", new Y.Map<unknown>());
      rowMap.set("docId", row.docId);
      rowMap.set("blockId", row.blockId);
      rowMap.set("unnumbered", false);
      rowsMap.set(row.id, rowMap);
    }
    for (let j = 0; j < tied.length; j++)
      tied[j]!.map.set("order", keys[rows.length + j]!);
  });
}

/**
 * Moves `rowIds` after `after` (or to the start when null) in one transaction,
 * rewriting only `order` so concurrent moves of one row converge without
 * duplicating it.
 */
export function moveRows(
  doc: CrdtDoc,
  rowIds: readonly string[],
  after: string | null,
): void {
  const ydoc = yDocOf(doc);
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const movingIds: string[] = [];
  const movingSet = new Set<string>();
  for (const id of rowIds) {
    if (movingSet.has(id) || !(rowsMap.get(id) instanceof Y.Map)) continue;
    movingSet.add(id);
    movingIds.push(id);
  }
  if (movingIds.length === 0) return;
  const all = sortedRowRefs(rowsMap);
  let anchor = after;
  if (anchor !== null) {
    const idx = all.findIndex((ref) => ref.id === anchor);
    if (idx === -1) throw new RangeError(`there is no rundown row "${anchor}"`);
    if (movingSet.has(anchor)) {
      let prev = idx - 1;
      while (prev >= 0 && movingSet.has(all[prev]!.id)) prev--;
      anchor = prev >= 0 ? all[prev]!.id : null;
    }
  }
  const remaining = all.filter((ref) => !movingSet.has(ref.id));
  const { keys, tied } = planPlacement(remaining, anchor, movingIds.length);
  ydoc.transact(() => {
    for (let i = 0; i < movingIds.length; i++)
      requireRowMap(rowsMap, movingIds[i]!).set("order", keys[i]!);
    for (let j = 0; j < tied.length; j++)
      tied[j]!.map.set("order", keys[movingIds.length + j]!);
  });
}

/** Removes every existing row in `rowIds` in one transaction. */
export function removeRows(doc: CrdtDoc, rowIds: readonly string[]): void {
  const ydoc = yDocOf(doc);
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const present = [...new Set(rowIds)].filter((id) => rowsMap.has(id));
  if (present.length === 0) return;
  ydoc.transact(() => {
    for (const id of present) rowsMap.delete(id);
  });
}

/**
 * Sets one stored cell on `rowId` in one transaction, moving any replaced value
 * into `previous`. Clearing `dur` writes `value: null`.
 */
export function setCell(
  doc: CrdtDoc,
  rowId: string,
  columnId: RundownColumnId,
  value: string | number | null,
  by: { userId: string; now: () => number },
): void {
  const ydoc = yDocOf(doc);
  if (!isStoredColumn(columnId))
    throw new RangeError(
      `rundown column "${columnId}" cannot hold a stored cell`,
    );
  assertCellValue(columnId, value);
  assertWellFormed(by.userId, "userId");
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const rowMap = requireRowMap(rowsMap, rowId);
  const existingCells = rowMap.get("cells");
  const current =
    existingCells instanceof Y.Map
      ? readCell(existingCells.get(columnId))
      : null;
  const next: RundownCellJSON = {
    value,
    userId: by.userId,
    setAt: by.now(),
    previous:
      current === null
        ? null
        : {
            value: current.value,
            userId: current.userId,
            setAt: current.setAt,
          },
  };
  ydoc.transact(() => {
    const existing = rowMap.get("cells");
    if (existing instanceof Y.Map) {
      existing.set(columnId, next);
      return;
    }
    const created = new Y.Map<unknown>();
    created.set(columnId, next);
    rowMap.set("cells", created);
  });
}

/** Restores a cell's `previous` value in one transaction, recording `by` as the writer. */
export function restoreCell(
  doc: CrdtDoc,
  rowId: string,
  columnId: RundownColumnId,
  by: { userId: string; now: () => number },
): void {
  const ydoc = yDocOf(doc);
  if (!isStoredColumn(columnId))
    throw new RangeError(
      `rundown column "${columnId}" cannot hold a stored cell`,
    );
  assertWellFormed(by.userId, "userId");
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const rowMap = requireRowMap(rowsMap, rowId);
  const cellsMap = rowMap.get("cells");
  if (!(cellsMap instanceof Y.Map)) return;
  const current = readCell(cellsMap.get(columnId));
  if (current === null || current.previous === null) return;
  const restored: RundownCellJSON = {
    value: current.previous.value,
    userId: by.userId,
    setAt: by.now(),
    previous: {
      value: current.value,
      userId: current.userId,
      setAt: current.setAt,
    },
  };
  ydoc.transact(() => {
    cellsMap.set(columnId, restored);
  });
}

/** Marks `rowId` unnumbered or numbered again in one transaction. */
export function setRowUnnumbered(
  doc: CrdtDoc,
  rowId: string,
  unnumbered: boolean,
): void {
  const ydoc = yDocOf(doc);
  const rowMap = requireRowMap(ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT), rowId);
  ydoc.transact(() => {
    rowMap.set("unnumbered", unnumbered);
  });
}

/** Updates the given rundown fields in one transaction. */
export function setRundownFields(
  doc: CrdtDoc,
  fields: Partial<RundownFieldsJSON>,
): void {
  const ydoc = yDocOf(doc);
  assertFields(fields);
  const entries: [string, unknown][] = [];
  if (fields.airDate !== undefined) entries.push(["airDate", fields.airDate]);
  if (fields.airAt !== undefined) entries.push(["airAt", fields.airAt]);
  if (fields.windowLeadMs !== undefined)
    entries.push(["windowLeadMs", fields.windowLeadMs]);
  if (fields.targetMs !== undefined)
    entries.push(["targetMs", fields.targetMs]);
  if (entries.length === 0) return;
  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  ydoc.transact(() => {
    for (const [key, value] of entries) fieldsMap.set(key, value);
  });
}

/**
 * Writes server-computed durations in one transaction with origin ORIGIN_SYSTEM.
 * Rows no longer in the rundown are skipped; called inside authorityWrite only.
 */
export function writeDurations(
  doc: CrdtDoc,
  durations: ReadonlyMap<string, number | null>,
): void {
  const ydoc = yDocOf(doc);
  if (durations.size === 0) return;
  for (const [, durationMs] of durations)
    if (durationMs !== null && !isNonNegativeInt(durationMs))
      throw new RangeError(
        `durationMs must be a non-negative integer or null, not ${durationMs}`,
      );
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const pending: [Y.Map<unknown>, number | null][] = [];
  for (const [rowId, durationMs] of durations) {
    const rowMap = rowsMap.get(rowId);
    if (!(rowMap instanceof Y.Map)) continue;
    if ((rowMap.get("durationMs") ?? null) !== durationMs)
      pending.push([rowMap, durationMs]);
  }
  if (pending.length === 0) return;
  ydoc.transact(() => {
    for (const [rowMap, durationMs] of pending)
      rowMap.set("durationMs", durationMs);
  }, ORIGIN_SYSTEM);
}

/**
 * Writes the server-sequenced prompter state for `rowId` in one transaction
 * with origin ORIGIN_SYSTEM; called inside authorityWrite only.
 */
export function writePrompterState(
  doc: CrdtDoc,
  rowId: string,
  state: PrompterStateJSON | null,
): void {
  const ydoc = yDocOf(doc);
  const rowMap = requireRowMap(ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT), rowId);
  let copy: PrompterStateJSON | null = null;
  if (state !== null) {
    if (state.state !== "on" && state.state !== "changed")
      throw new RangeError(`unknown prompter state "${String(state.state)}"`);
    if (!isSafeInt(state.sentAt))
      throw new RangeError(`sentAt must be an integer, not ${state.sentAt}`);
    copy = {
      state: state.state,
      versionId: state.versionId,
      sentAt: state.sentAt,
      sentByUserId: state.sentByUserId,
    };
  }
  ydoc.transact(() => {
    rowMap.set("prompter", copy);
  }, ORIGIN_SYSTEM);
}
