// Client-owned row snapshots and pre-GC recovery for rundown undo steps, omitting server-only keys.
import * as Y from "yjs";

export const ABSENT = Symbol("absent");

export const CLIENT_ROW_KEYS = Object.freeze([
  "id",
  "order",
  "kind",
  "docId",
  "blockId",
  "unnumbered",
] as const);
export type ClientRowKey = (typeof CLIENT_ROW_KEYS)[number];

export const isClientRowKey = (key: string): key is ClientRowKey =>
  CLIENT_ROW_KEYS.some((known) => known === key);

export interface ClientRowSnapshot {
  id: string;
  order: string;
  kind: unknown;
  docId: unknown;
  blockId: unknown;
  unnumbered: unknown;
  cells: [string, unknown][];
}

export function cloneValue(value: unknown): unknown {
  if (value === ABSENT || value === null || typeof value !== "object")
    return value;
  return structuredClone(value);
}

export function snapshotLiveRow(
  rowId: string,
  rowMap: Y.Map<unknown>,
): ClientRowSnapshot {
  const rawId = rowMap.get("id");
  const rawOrder = rowMap.get("order");
  const cells: [string, unknown][] = [];
  const rawCells = rowMap.get("cells");
  if (rawCells instanceof Y.Map) {
    for (const [colId, val] of rawCells.entries())
      cells.push([colId, cloneValue(val)]);
  }
  return {
    id: typeof rawId === "string" ? rawId : rowId,
    order: typeof rawOrder === "string" ? rawOrder : "",
    kind: cloneValue(rowMap.get("kind") ?? null),
    docId: cloneValue(rowMap.get("docId") ?? null),
    blockId: cloneValue(rowMap.get("blockId") ?? null),
    unnumbered: rowMap.get("unnumbered") === true,
    cells,
  };
}

/** Re-inserts a row with only client-owned keys, never `durationMs` or `prompter`. */
export function writeClientRow(
  rowsMap: Y.Map<unknown>,
  rowId: string,
  snap: ClientRowSnapshot,
): void {
  const rowMap = new Y.Map<unknown>();
  rowMap.set("id", snap.id);
  rowMap.set("order", snap.order);
  rowMap.set("kind", cloneValue(snap.kind));
  const cellsMap = new Y.Map<unknown>();
  for (const [colId, val] of snap.cells) cellsMap.set(colId, cloneValue(val));
  rowMap.set("cells", cellsMap);
  rowMap.set("docId", cloneValue(snap.docId));
  rowMap.set("blockId", cloneValue(snap.blockId));
  rowMap.set("unnumbered", snap.unnumbered === true);
  rowsMap.set(rowId, rowMap);
}

function itemPlainValue(item: Y.Item): unknown {
  if (
    item.content instanceof Y.ContentAny ||
    item.content instanceof Y.ContentJSON
  )
    return cloneValue(item.content.getContent().at(-1));
  return ABSENT;
}

/**
 * Recovers client-owned fields and cells of rows deleted in `tr` from
 * `tr.deleteSet` before Yjs runs garbage collection.
 */
export function recoverDeletedRows(
  rowsMap: Y.Map<unknown>,
  tr: Y.Transaction,
  targetIds: ReadonlySet<string>,
): Map<string, ClientRowSnapshot> {
  const rowTypes = new Map<
    unknown,
    {
      rowId: string;
      fields: Map<ClientRowKey, unknown>;
      cells: [string, unknown][];
    }
  >();
  const cellTypes = new Map<unknown, [string, unknown][]>();
  Y.iterateDeletedStructs(tr, tr.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item) || struct.parent !== rowsMap) return;
    const rowId = struct.parentSub;
    if (typeof rowId !== "string" || !targetIds.has(rowId)) return;
    if (struct.content instanceof Y.ContentType)
      rowTypes.set(struct.content.type, {
        rowId,
        fields: new Map(),
        cells: [],
      });
  });
  Y.iterateDeletedStructs(tr, tr.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item) || struct.right !== null) return;
    const entry = rowTypes.get(struct.parent);
    if (entry === undefined || typeof struct.parentSub !== "string") return;
    if (
      struct.parentSub === "cells" &&
      struct.content instanceof Y.ContentType
    ) {
      cellTypes.set(struct.content.type, entry.cells);
      return;
    }
    if (!isClientRowKey(struct.parentSub)) return;
    const value = itemPlainValue(struct);
    if (value !== ABSENT) entry.fields.set(struct.parentSub, value);
  });
  Y.iterateDeletedStructs(tr, tr.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item) || struct.right !== null) return;
    const cells = cellTypes.get(struct.parent);
    if (cells === undefined || typeof struct.parentSub !== "string") return;
    const value = itemPlainValue(struct);
    if (value !== ABSENT) cells.push([struct.parentSub, value]);
  });
  const recovered = new Map<string, ClientRowSnapshot>();
  for (const { rowId, fields, cells } of rowTypes.values()) {
    const rawId = fields.get("id");
    const rawOrder = fields.get("order");
    recovered.set(rowId, {
      id: typeof rawId === "string" ? rawId : rowId,
      order: typeof rawOrder === "string" ? rawOrder : "",
      kind: fields.get("kind") ?? null,
      docId: fields.get("docId") ?? null,
      blockId: fields.get("blockId") ?? null,
      unnumbered: fields.get("unnumbered") === true,
      cells,
    });
  }
  return recovered;
}
