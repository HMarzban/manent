// What a rundown viewer receives: fields, columns and rows in order, and incremental patches from update structs alone.
import {
  STORED_COLUMNS,
  jsonMap,
  readRundownColumns,
  readRundownWrites,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
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

const DEFAULT_WINDOW_LEAD_MS = 3_600_000;

/** The rundown as a viewer receives it: fields, columns and rows sorted by `(order, id)`, never a CRDT document. */
export interface RundownViewSnapshot {
  v: 1;
  kind: "rundown";
  rundown: RundownFieldsJSON;
  columns: RundownColumnId[];
  rows: RundownRowJSON[];
}

/**
 * Applied to a rundown view: `rundown` and `columns` replace their whole values when present,
 * `remove` deletes row ids, and `upsert` inserts or replaces rows by `id` (kept sorted by `(order, id)`).
 */
export interface RundownViewPatch {
  v: 1;
  kind: "rundown";
  rundown?: RundownFieldsJSON;
  columns?: RundownColumnId[];
  remove: string[];
  upsert: RundownRowJSON[];
}

interface MapLike {
  get(key: string): unknown;
  has(key: string): boolean;
  entries(): IterableIterator<[string, unknown]>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMapLike = (value: unknown): value is MapLike =>
  typeof value === "object" &&
  value !== null &&
  "get" in value &&
  typeof value.get === "function" &&
  "has" in value &&
  typeof value.has === "function" &&
  "entries" in value &&
  typeof value.entries === "function";

const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

const isColumnId = (value: unknown): value is RundownColumnId =>
  RUNDOWN_COLUMN_IDS.some((col) => col === value);

const isStoredColumn = (value: unknown): value is RundownColumnId =>
  STORED_COLUMNS.some((col) => col === value);

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isNonNegativeInt = (value: unknown): value is number =>
  isSafeInt(value) && value >= 0;

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

function readCell(value: unknown): RundownCellJSON | null {
  const base = readCellEntry(value);
  if (base === null || !isPlainObject(value)) return null;
  if (value.previous === null) return { ...base, previous: null };
  const previous = readCellEntry(value.previous);
  return previous === null ? null : { ...base, previous };
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

function readRow(key: string, raw: unknown): RundownRowJSON | null {
  if (!isMapLike(raw)) return null;
  const rawKind = raw.get("kind");
  if (!isRowKind(rawKind)) return null;
  const rawId = raw.get("id");
  const rawOrder = raw.get("order");
  const rawDocId = raw.get("docId");
  const rawBlockId = raw.get("blockId");
  const rawDuration = raw.get("durationMs");
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  const rawCells = raw.get("cells");
  if (isMapLike(rawCells)) {
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
    prompter: readPrompterState(raw.get("prompter")),
    unnumbered: raw.get("unnumbered") === true,
  };
}

function readFields(doc: CrdtDoc): RundownFieldsJSON {
  const fields = jsonMap(doc, RUNDOWN_FIELDS_ROOT);
  const rawAirDate = fields.get("airDate");
  const rawAirAt = fields.get("airAt");
  const rawWindowLead = fields.get("windowLeadMs");
  const rawTarget = fields.get("targetMs");
  return {
    airDate: typeof rawAirDate === "string" ? rawAirDate : "",
    airAt: isSafeInt(rawAirAt) ? rawAirAt : null,
    windowLeadMs: isNonNegativeInt(rawWindowLead)
      ? rawWindowLead
      : DEFAULT_WINDOW_LEAD_MS,
    targetMs: isNonNegativeInt(rawTarget) ? rawTarget : null,
  };
}

export function rundownViewSnapshot(rundown: RundownJSON): RundownViewSnapshot {
  return {
    v: 1,
    kind: "rundown",
    rundown: { ...rundown.rundown },
    columns: [...rundown.columns],
    rows: rundown.rows.map((row) => ({ ...row, cells: { ...row.cells } })),
  };
}

/**
 * Incremental rundown view patch computed in O(changed structs) from `update` without walking all rows;
 * returns null when `update` changed nothing a rundown viewer sees.
 */
export function rundownViewPatch(
  doc: CrdtDoc,
  update: Uint8Array,
): RundownViewPatch | null {
  let writes;
  try {
    writes = readRundownWrites(doc, update);
  } catch {
    return null;
  }
  const rundown = writes.roots.includes(RUNDOWN_FIELDS_ROOT)
    ? readFields(doc)
    : undefined;
  const columns = writes.roots.includes(RUNDOWN_COLUMNS_ROOT)
    ? readRundownColumns(doc).filter(isColumnId)
    : undefined;
  const remove: string[] = [];
  const upsert: RundownRowJSON[] = [];
  if (writes.rows.length > 0) {
    const rowsView = jsonMap(doc, RUNDOWN_ROWS_ROOT);
    for (const { rowId, removed } of writes.rows) {
      if (removed) {
        remove.push(rowId);
        continue;
      }
      const row = readRow(rowId, rowsView.get(rowId));
      if (row === null) remove.push(rowId);
      else upsert.push(row);
    }
  }
  if (
    rundown === undefined &&
    columns === undefined &&
    remove.length === 0 &&
    upsert.length === 0
  )
    return null;
  return {
    v: 1,
    kind: "rundown",
    ...(rundown === undefined ? {} : { rundown }),
    ...(columns === undefined ? {} : { columns }),
    remove,
    upsert,
  };
}

/** The UTF-8 bytes of a rundown view payload's JSON text. */
export function encodeRundownView(
  value: RundownViewSnapshot | RundownViewPatch,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
