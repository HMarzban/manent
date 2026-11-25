// What one update wrote to a rundown document, read from the update's structs alone without walking the rows.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { updateMeta, withWholeUpdate } from "../updates.ts";
import type { Update } from "../updates.ts";
import { compareStrings } from "./rundown-order.ts";

type RundownRootName =
  | typeof RUNDOWN_FIELDS_ROOT
  | typeof RUNDOWN_COLUMNS_ROOT
  | typeof RUNDOWN_ROWS_ROOT;

export interface RundownWrites {
  roots: ("rundown" | "columns" | "rows")[];
  rows: {
    rowId: string;
    keys: string[];
    cells: { columnId: string; value: unknown }[];
    removed: boolean;
  }[];
}

interface RowChange {
  keys: Set<string>;
  cells: { columnId: string; value: unknown }[];
  writtenCellCols: Set<string>;
  deletedCellCols: Set<string>;
  removed: boolean;
}

interface ClockRange {
  clientId: number;
  fromClock: number;
  toClock: number;
}

type YType = Y.Doc["share"] extends Map<string, infer T> ? T : never;

interface Roots {
  fields: YType | null;
  columns: YType | null;
  rowsRoot: YType | null;
  rowsMap: Y.Map<unknown> | null;
  tr: Y.Transaction;
  paths: Map<YType, readonly (string | number)[]>;
}

/** Calls `visit` with each struct of `client` overlapping `[from, to)`. */
function eachStruct(
  ydoc: Y.Doc,
  client: number,
  from: number,
  to: number,
  visit: (struct: Y.Item | Y.GC) => void,
): void {
  const structs = ydoc.store.clients.get(client);
  const last = structs?.at(-1);
  if (structs === undefined || last === undefined) return;
  if (from >= last.id.clock + last.length) return;
  for (let at = Y.findIndexSS(structs, from); at < structs.length; at++) {
    const struct = structs[at];
    if (struct === undefined || struct.id.clock >= to) return;
    visit(struct);
  }
}

function rootOf(type: YType): YType {
  let current: YType = type;
  while (current.parent !== null) current = current.parent;
  return current;
}

function pathFromRows(
  target: YType,
  roots: Roots,
): readonly (string | number)[] {
  const cached = roots.paths.get(target);
  if (cached !== undefined) return cached;
  const event = new Y.YEvent(target, roots.tr);
  if (roots.rowsRoot !== null) event.currentTarget = roots.rowsRoot;
  const path = event.path;
  roots.paths.set(target, path);
  return path;
}

function itemValue(item: Y.Item): unknown {
  if (
    item.content instanceof Y.ContentAny ||
    item.content instanceof Y.ContentJSON
  )
    return item.content.getContent().at(-1);
  if (item.content instanceof Y.ContentType) return item.content.type;
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureRow(map: Map<string, RowChange>, rowId: string): RowChange {
  const existing = map.get(rowId);
  if (existing !== undefined) return existing;
  const created: RowChange = {
    keys: new Set(),
    cells: [],
    writtenCellCols: new Set(),
    deletedCellCols: new Set(),
    removed: false,
  };
  map.set(rowId, created);
  return created;
}

function recordRowStruct(
  item: Y.Item,
  target: YType,
  roots: Roots,
  written: boolean,
  changes: Map<string, RowChange>,
): void {
  const { rowsMap } = roots;
  if (rowsMap === null) return;
  const path = pathFromRows(target, roots);
  if (path.length === 0) {
    const rowId = item.parentSub;
    if (typeof rowId !== "string") return;
    const change = ensureRow(changes, rowId);
    if (!rowsMap.has(rowId)) change.removed = true;
    return;
  }
  const rowId = path[0];
  if (typeof rowId !== "string") return;
  const change = ensureRow(changes, rowId);
  if (path.length === 1) {
    const key = item.parentSub;
    if (typeof key !== "string") return;
    change.keys.add(key);
    if (written && key === "cells") {
      const val = itemValue(item);
      if (!(val instanceof Y.AbstractType) && isPlainObject(val))
        for (const [colId, cellVal] of Object.entries(val)) {
          change.cells.push({ columnId: colId, value: cellVal });
          change.writtenCellCols.add(colId);
        }
    }
    return;
  }
  const fieldKey = path[1];
  if (typeof fieldKey !== "string") return;
  if (fieldKey !== "cells") {
    change.keys.add(fieldKey);
    return;
  }
  const columnId = path.length === 2 ? item.parentSub : path[2];
  if (typeof columnId !== "string") return;
  if (written) {
    change.cells.push({ columnId, value: itemValue(item) });
    change.writtenCellCols.add(columnId);
  } else change.deletedCellCols.add(columnId);
}

function inspectItem(
  item: Y.Item,
  roots: Roots,
  written: boolean,
  touchedRoots: Set<RundownRootName>,
  rowChanges: Map<string, RowChange>,
): void {
  if (!(item.parent instanceof Y.AbstractType)) return;
  const root = rootOf(item.parent);
  if (root === roots.fields && roots.fields !== null) {
    touchedRoots.add(RUNDOWN_FIELDS_ROOT);
    return;
  }
  if (root === roots.columns && roots.columns !== null) {
    touchedRoots.add(RUNDOWN_COLUMNS_ROOT);
    return;
  }
  if (root === roots.rowsRoot && roots.rowsRoot !== null) {
    touchedRoots.add(RUNDOWN_ROWS_ROOT);
    recordRowStruct(item, item.parent, roots, written, rowChanges);
  }
}

function isInRanges(item: Y.Item, ranges: readonly ClockRange[]): boolean {
  const { client, clock } = item.id;
  return ranges.some(
    (range) =>
      range.clientId === client &&
      clock >= range.fromClock &&
      clock < range.toClock,
  );
}

const ROOT_ORDER: readonly RundownRootName[] = Object.freeze([
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_ROWS_ROOT,
]);

/**
 * The rundown roots and per-row keys and cells that `update` wrote or deleted
 * in `doc`, read from the update's structs alone. `doc` holds the state after
 * `update` was applied. Throws CrdtUpdateError for malformed bytes.
 */
export function readRundownWrites(doc: CrdtDoc, update: Update): RundownWrites {
  const ydoc = yDocOf(doc);
  const ranges = updateMeta(update);
  const decoded = withWholeUpdate(update, () => Y.decodeUpdate(update));
  const rowsMap = ydoc.share.has(RUNDOWN_ROWS_ROOT)
    ? ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT)
    : null;
  const roots: Roots = {
    fields: ydoc.share.get(RUNDOWN_FIELDS_ROOT) ?? null,
    columns: ydoc.share.get(RUNDOWN_COLUMNS_ROOT) ?? null,
    rowsRoot: ydoc.share.get(RUNDOWN_ROWS_ROOT) ?? null,
    rowsMap,
    tr: new Y.Transaction(ydoc, null, false),
    paths: new Map(),
  };
  const touchedRoots = new Set<RundownRootName>();
  const rowChanges = new Map<string, RowChange>();
  const visitWritten = (struct: Y.Item | Y.GC): void => {
    if (struct instanceof Y.Item)
      inspectItem(struct, roots, true, touchedRoots, rowChanges);
  };
  const visitDeleted = (struct: Y.Item | Y.GC): void => {
    if (!(struct instanceof Y.Item)) return;
    if (isInRanges(struct, ranges)) return;
    // a map entry with a right neighbour was superseded by a newer write, not deleted
    if (struct.parentSub !== null && struct.right !== null) return;
    inspectItem(struct, roots, false, touchedRoots, rowChanges);
  };
  for (const { clientId, fromClock, toClock } of ranges)
    eachStruct(ydoc, clientId, fromClock, toClock, visitWritten);
  for (const [client, deleted] of decoded.ds.clients)
    for (const { clock, len } of deleted)
      eachStruct(ydoc, client, clock, clock + len, visitDeleted);
  const rows = [...rowChanges.entries()]
    .toSorted(([a], [b]) => compareStrings(a, b))
    .map(([rowId, change]) => {
      const cells = [...change.cells];
      for (const columnId of change.deletedCellCols)
        if (!change.writtenCellCols.has(columnId))
          cells.push({ columnId, value: null });
      return {
        rowId,
        keys: [...change.keys].toSorted(compareStrings),
        cells: cells.toSorted((a, b) => compareStrings(a.columnId, b.columnId)),
        removed: change.removed,
      };
    });
  return {
    roots: ROOT_ORDER.filter((root) => touchedRoots.has(root)),
    rows,
  };
}
