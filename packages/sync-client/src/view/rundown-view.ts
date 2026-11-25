// Reading and applying server-projected rundown snapshots and incremental patches on the client.
import { STORED_COLUMNS } from "@manent/crdt";
import { ROW_KINDS, RUNDOWN_COLUMN_IDS } from "@manent/schema";
import type {
  PrompterStateJSON,
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";

/** The rundown as the server projects it; a reader ignores keys it does not know. */
export interface RundownViewSnapshot {
  v: 1;
  kind: "rundown";
  rundown: RundownFieldsJSON;
  columns: RundownColumnId[];
  rows: RundownRowJSON[];
}

/** Applied to a rundown view: `rundown` and `columns` replace when present; `remove` deletes; `upsert` inserts/updates; rows stay sorted by `(order, id)`. */
export interface RundownViewPatch {
  v: 1;
  kind: "rundown";
  rundown?: RundownFieldsJSON;
  columns?: RundownColumnId[];
  remove: string[];
  upsert: RundownRowJSON[];
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isNonNegativeInt = (value: unknown): value is number =>
  isSafeInt(value) && value >= 0;

const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

const isColumnId = (value: unknown): value is RundownColumnId =>
  RUNDOWN_COLUMN_IDS.some((col) => col === value);

const isStoredColumn = (value: unknown): value is RundownColumnId =>
  STORED_COLUMNS.some((col) => col === value);

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const sortRows = (rows: readonly RundownRowJSON[]): RundownRowJSON[] =>
  rows.toSorted(
    (a, b) =>
      compareCodeUnits(a.order, b.order) || compareCodeUnits(a.id, b.id),
  );

/** True when a decoded JSON view payload carries `kind: "rundown"`. */
export const isRundownViewPayload = (value: unknown): boolean =>
  isFields(value) && value.kind === "rundown";

function readRundownFields(value: unknown): RundownFieldsJSON | null {
  if (!isFields(value)) return null;
  const { airDate, airAt, windowLeadMs, targetMs } = value;
  if (typeof airDate !== "string") return null;
  if (airAt !== null && !isSafeInt(airAt)) return null;
  if (!isNonNegativeInt(windowLeadMs)) return null;
  if (targetMs !== null && !isNonNegativeInt(targetMs)) return null;
  return { airDate, airAt, windowLeadMs, targetMs };
}

function readColumns(value: unknown): RundownColumnId[] | null {
  if (!Array.isArray(value)) return null;
  const columns = value.filter(isColumnId);
  return columns.length === value.length ? columns : null;
}

function readCellEntry(
  value: unknown,
): { value: string | number | null; userId: string; setAt: number } | null {
  if (!isFields(value)) return null;
  const { value: raw, userId, setAt } = value;
  const validVal =
    raw === null ||
    typeof raw === "string" ||
    (typeof raw === "number" && Number.isFinite(raw));
  if (!validVal || typeof userId !== "string" || !isSafeInt(setAt)) return null;
  return { value: raw, userId, setAt };
}

function readCell(value: unknown): RundownCellJSON | null {
  const base = readCellEntry(value);
  if (base === null || !isFields(value)) return null;
  if (value.previous === null) return { ...base, previous: null };
  const previous = readCellEntry(value.previous);
  return previous === null ? null : { ...base, previous };
}

function readPrompter(value: unknown): PrompterStateJSON | null | undefined {
  if (value === null) return null;
  if (!isFields(value)) return undefined;
  const { state, versionId, sentAt, sentByUserId } = value;
  if (state !== "on" && state !== "changed") return undefined;
  if (versionId !== null && typeof versionId !== "string") return undefined;
  if (!isSafeInt(sentAt)) return undefined;
  if (sentByUserId !== null && typeof sentByUserId !== "string")
    return undefined;
  return { state, versionId, sentAt, sentByUserId };
}

function readRow(value: unknown): RundownRowJSON | null {
  if (!isFields(value)) return null;
  const { id, order, kind, cells: rawCells, docId, blockId } = value;
  const { durationMs, prompter: rawPrompter, unnumbered } = value;
  if (typeof id !== "string" || typeof order !== "string" || !isRowKind(kind))
    return null;
  if (!isFields(rawCells)) return null;
  if (docId !== null && typeof docId !== "string") return null;
  if (blockId !== null && typeof blockId !== "string") return null;
  if (durationMs !== null && !isNonNegativeInt(durationMs)) return null;
  const prompter = readPrompter(rawPrompter);
  if (prompter === undefined || typeof unnumbered !== "boolean") return null;
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  for (const [colId, rawCell] of Object.entries(rawCells)) {
    if (!isStoredColumn(colId)) return null;
    const cell = readCell(rawCell);
    if (cell === null) return null;
    cells[colId] = cell;
  }
  return {
    id,
    order,
    kind,
    cells,
    docId,
    blockId,
    durationMs,
    prompter,
    unnumbered,
  };
}

function readRows(value: unknown): RundownRowJSON[] | null {
  if (!Array.isArray(value)) return null;
  const rows: RundownRowJSON[] = [];
  for (const item of value) {
    const row = readRow(item);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

/** Null for anything but a version 1 rundown snapshot whose fields, columns and rows all validate. */
export function readRundownViewSnapshot(
  value: unknown,
): RundownViewSnapshot | null {
  if (!isFields(value) || value.v !== 1 || value.kind !== "rundown")
    return null;
  const rundown = readRundownFields(value.rundown);
  const columns = readColumns(value.columns);
  const rows = readRows(value.rows);
  if (rundown === null || columns === null || rows === null) return null;
  return { v: 1, kind: "rundown", rundown, columns, rows: sortRows(rows) };
}

/** Null for anything but a version 1 rundown patch whose fields all validate. */
export function readRundownViewPatch(value: unknown): RundownViewPatch | null {
  if (!isFields(value) || value.v !== 1 || value.kind !== "rundown")
    return null;
  if (!Array.isArray(value.remove)) return null;
  const remove = value.remove.filter((id) => typeof id === "string");
  if (remove.length !== value.remove.length) return null;
  const upsert = readRows(value.upsert);
  if (upsert === null) return null;
  const rundown =
    value.rundown === undefined ? undefined : readRundownFields(value.rundown);
  if (value.rundown !== undefined && rundown === null) return null;
  const columns =
    value.columns === undefined ? undefined : readColumns(value.columns);
  if (value.columns !== undefined && columns === null) return null;
  return {
    v: 1,
    kind: "rundown",
    ...(rundown === undefined || rundown === null ? {} : { rundown }),
    ...(columns === undefined || columns === null ? {} : { columns }),
    remove,
    upsert,
  };
}

/** Applies a rundown view patch immutably, keeping rows sorted by `(order, id)`. */
export function applyRundownViewPatch(
  current: RundownJSON,
  patch: RundownViewPatch,
): RundownJSON {
  const removed = new Set(patch.remove);
  const byId = new Map<string, RundownRowJSON>();
  for (const row of current.rows)
    if (!removed.has(row.id)) byId.set(row.id, row);
  for (const row of patch.upsert) byId.set(row.id, row);
  return {
    rundown: patch.rundown ?? current.rundown,
    columns: patch.columns ?? current.columns,
    rows: sortRows([...byId.values()]),
  };
}
