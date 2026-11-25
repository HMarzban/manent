// Reading, validating and observing a rundown CRDT document's fields, columns and rows.
import {
  ROW_KINDS,
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_COLUMN_IDS,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
} from "@manent/schema";
import type {
  PrompterStateJSON,
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import * as Y from "yjs";
import { throwAll, yDocOf } from "../doc.ts";
import type { CrdtDoc, Unsubscribe } from "../doc.ts";
import { compareStrings } from "./rundown-order.ts";

const DEFAULT_WINDOW_LEAD_MS = 3600000;

/** The rundown column ids that hold stored last-writer cells. */
export const STORED_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
]);

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

export const isColumnId = (value: unknown): value is RundownColumnId =>
  RUNDOWN_COLUMN_IDS.some((col) => col === value);

export const isStoredColumn = (value: unknown): value is RundownColumnId =>
  STORED_COLUMNS.some((col) => col === value);

export const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function assertWellFormed(text: string, label: string): void {
  if (LONE_SURROGATE.test(text))
    throw new TypeError(`${label} must be well-formed UTF-16`);
}

export function assertCellValue(
  columnId: RundownColumnId,
  value: string | number | null,
): void {
  if (value === null) return;
  if (columnId === "dur") {
    if (typeof value !== "number")
      throw new TypeError("dur cell value must be a number or null");
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(
        `dur cell value must be a non-negative integer, not ${value}`,
      );
    return;
  }
  if (typeof value === "string") {
    assertWellFormed(value, "a rundown cell value");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new RangeError(`rundown cell value must be finite, not ${value}`);
    return;
  }
  throw new TypeError("rundown cell value must be a string, number or null");
}

export function assertFields(fields: Partial<RundownFieldsJSON>): void {
  if (fields.airDate !== undefined) assertWellFormed(fields.airDate, "airDate");
  if (
    fields.airAt !== undefined &&
    fields.airAt !== null &&
    !isSafeInt(fields.airAt)
  )
    throw new RangeError(
      `airAt must be an integer or null, not ${fields.airAt}`,
    );
  if (
    fields.windowLeadMs !== undefined &&
    !isNonNegativeInt(fields.windowLeadMs)
  )
    throw new RangeError(
      `windowLeadMs must be a non-negative integer, not ${fields.windowLeadMs}`,
    );
  if (
    fields.targetMs !== undefined &&
    fields.targetMs !== null &&
    !isNonNegativeInt(fields.targetMs)
  )
    throw new RangeError(
      `targetMs must be a non-negative integer or null, not ${fields.targetMs}`,
    );
}

function readCellEntry(
  value: unknown,
): { value: string | number | null; userId: string; setAt: number } | null {
  if (!isPlainObject(value)) return null;
  const { value: raw, userId, setAt } = value;
  const validVal =
    raw === null ||
    typeof raw === "string" ||
    (typeof raw === "number" && Number.isFinite(raw));
  if (!validVal || typeof userId !== "string" || !isSafeInt(setAt)) return null;
  return { value: raw, userId, setAt };
}

export function readCell(value: unknown): RundownCellJSON | null {
  const base = readCellEntry(value);
  if (base === null || !isPlainObject(value)) return null;
  const rawPrev = value.previous;
  if (rawPrev === null) return { ...base, previous: null };
  const previous = readCellEntry(rawPrev);
  if (previous === null) return null;
  return { ...base, previous };
}

function readPrompterState(value: unknown): PrompterStateJSON | null {
  if (!isPlainObject(value)) return null;
  const { state, versionId, sentAt, sentByUserId } = value;
  if (state !== "on" && state !== "changed") return null;
  if (versionId !== null && typeof versionId !== "string") return null;
  if (!isSafeInt(sentAt)) return null;
  if (sentByUserId !== null && typeof sentByUserId !== "string") return null;
  return { state, versionId, sentAt, sentByUserId };
}

export function requireRowMap(
  rowsMap: Y.Map<unknown>,
  rowId: string,
): Y.Map<unknown> {
  const row = rowsMap.get(rowId);
  if (row instanceof Y.Map) return row;
  throw new RangeError(`there is no rundown row "${rowId}"`);
}

function readRow(key: string, rowMap: Y.Map<unknown>): RundownRowJSON | null {
  const rawKind = rowMap.get("kind");
  if (!isRowKind(rawKind)) return null;
  const rawId = rowMap.get("id");
  const rawOrder = rowMap.get("order");
  const rawDocId = rowMap.get("docId");
  const rawBlockId = rowMap.get("blockId");
  const rawDuration = rowMap.get("durationMs");
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  const rawCells = rowMap.get("cells");
  if (rawCells instanceof Y.Map) {
    for (const [colId, rawCell] of rawCells.entries()) {
      if (!isStoredColumn(colId)) continue;
      const cell = readCell(rawCell);
      if (cell !== null) cells[colId] = cell;
    }
  }
  return {
    id: typeof rawId === "string" ? rawId : key,
    order: typeof rawOrder === "string" ? rawOrder : "",
    kind: rawKind,
    cells,
    docId: typeof rawDocId === "string" ? rawDocId : null,
    blockId: typeof rawBlockId === "string" ? rawBlockId : null,
    durationMs: isNonNegativeInt(rawDuration) ? rawDuration : null,
    prompter: readPrompterState(rowMap.get("prompter")),
    unnumbered: rowMap.get("unnumbered") === true,
  };
}

/** Raw entries stored in the rundown's `columns` root array, without filtering unknown items. */
export function readRundownColumns(doc: CrdtDoc): unknown[] {
  const arr = yDocOf(doc).getArray<unknown>(RUNDOWN_COLUMNS_ROOT);
  const items = arr.toArray();
  // stray map entries written onto the columns root are surfaced as invalid items
  const mapEntries: unknown = Reflect.get(arr, "_map");
  if (mapEntries instanceof Map)
    for (const item of mapEntries.values())
      if (item instanceof Y.Item && !item.deleted) items.push(null);
  return items;
}

/** Reads the rundown's fields, columns and rows sorted by `order`, then `id`. */
export function readRundown(doc: CrdtDoc): RundownJSON {
  const ydoc = yDocOf(doc);
  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  const rawAirDate = fieldsMap.get("airDate");
  const rawAirAt = fieldsMap.get("airAt");
  const rawWindowLead = fieldsMap.get("windowLeadMs");
  const rawTarget = fieldsMap.get("targetMs");
  const rundown: RundownFieldsJSON = {
    airDate: typeof rawAirDate === "string" ? rawAirDate : "",
    airAt: isSafeInt(rawAirAt) ? rawAirAt : null,
    windowLeadMs: isNonNegativeInt(rawWindowLead)
      ? rawWindowLead
      : DEFAULT_WINDOW_LEAD_MS,
    targetMs: isNonNegativeInt(rawTarget) ? rawTarget : null,
  };
  const columns: RundownColumnId[] = [];
  for (const col of ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT).toArray())
    if (isColumnId(col)) columns.push(col);
  const rows: RundownRowJSON[] = [];
  for (const [key, value] of ydoc
    .getMap<unknown>(RUNDOWN_ROWS_ROOT)
    .entries()) {
    if (!(value instanceof Y.Map)) continue;
    const row = readRow(key, value);
    if (row !== null) rows.push(row);
  }
  return {
    rundown,
    columns,
    rows: rows.toSorted(
      (a, b) => compareStrings(a.order, b.order) || compareStrings(a.id, b.id),
    ),
  };
}

interface PendingChange {
  rowIds: Set<string>;
  fields: boolean;
  columns: boolean;
}

function pendingOf(
  map: Map<Y.Transaction, PendingChange>,
  tr: Y.Transaction,
): PendingChange {
  const existing = map.get(tr);
  if (existing !== undefined) return existing;
  const created: PendingChange = {
    rowIds: new Set(),
    fields: false,
    columns: false,
  };
  map.set(tr, created);
  return created;
}

function recordRowEvents(
  change: PendingChange,
  events: readonly Y.YEvent<Y.AbstractType<unknown>>[],
): void {
  for (const event of events) {
    if (event.path.length === 0) {
      if (event instanceof Y.YMapEvent)
        for (const key of event.keysChanged) change.rowIds.add(key);
      continue;
    }
    const rowId = event.path[0];
    if (typeof rowId === "string") change.rowIds.add(rowId);
  }
}

/**
 * Subscribes to rundown changes, calling `listener` once per transaction that
 * touched fields, columns or rows, reporting only what changed.
 */
export function observeRundown(
  doc: CrdtDoc,
  listener: (change: {
    rowIds: string[];
    fields: boolean;
    columns: boolean;
  }) => void,
): Unsubscribe {
  const ydoc = yDocOf(doc);
  const fieldsMap = ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT);
  const columnsArr = ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT);
  const rowsMap = ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT);
  const pending = new Map<Y.Transaction, PendingChange>();
  const thrown: unknown[] = [];
  const onFields = (_event: Y.YMapEvent<unknown>, tr: Y.Transaction): void => {
    pendingOf(pending, tr).fields = true;
  };
  const onColumns = (
    _event: Y.YArrayEvent<unknown>,
    tr: Y.Transaction,
  ): void => {
    pendingOf(pending, tr).columns = true;
  };
  const onRows = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    tr: Y.Transaction,
  ): void => recordRowEvents(pendingOf(pending, tr), events);
  const onAfterTransaction = (tr: Y.Transaction): void => {
    const change = pending.get(tr);
    if (change === undefined) return;
    pending.delete(tr);
    try {
      listener({
        rowIds: [...change.rowIds].toSorted(compareStrings),
        fields: change.fields,
        columns: change.columns,
      });
    } catch (error) {
      thrown.push(error);
    }
  };
  const onAfterAll = (): void => {
    pending.clear();
    throwAll(thrown.splice(0));
  };
  fieldsMap.observe(onFields);
  columnsArr.observe(onColumns);
  rowsMap.observeDeep(onRows);
  ydoc.on("afterTransaction", onAfterTransaction);
  ydoc.on("afterAllTransactions", onAfterAll);
  return () => {
    fieldsMap.unobserve(onFields);
    columnsArr.unobserve(onColumns);
    rowsMap.unobserveDeep(onRows);
    ydoc.off("afterTransaction", onAfterTransaction);
    ydoc.off("afterAllTransactions", onAfterAll);
  };
}
