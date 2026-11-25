// The documents in Trash kept in memory, for the in-memory driver.
import type { TrashRow, TrashStore } from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface TrashTables {
  /** By docId. */
  rows: Map<string, TrashRow>;
}

export function createTrashTables(): TrashTables {
  return { rows: new Map() };
}

const copyRow = (row: TrashRow): TrashRow => ({ ...row });

const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

// As SQLite orders `deleted_at DESC, doc_id ASC`.
const newestFirst = (a: TrashRow, b: TrashRow): number =>
  b.deletedAt - a.deletedAt || byCodePoint(a.docId, b.docId);

// As SQLite orders `purge_after ASC, doc_id ASC`.
const earliestDue = (a: TrashRow, b: TrashRow): number =>
  a.purgeAfter - b.purgeAfter || byCodePoint(a.docId, b.docId);

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryTrash(options: {
  now: () => number;
  read: () => TrashTables;
  commit: <T>(apply: () => T) => T;
}): TrashStore {
  const { read, commit } = options;
  return {
    put(row) {
      const stored = copyRow(row);
      commit(() => {
        read().rows.set(stored.docId, stored);
      });
    },
    get(docId) {
      const row = read().rows.get(docId);
      return row === undefined ? null : copyRow(row);
    },
    remove(docId) {
      commit(() => {
        read().rows.delete(docId);
      });
    },
    listByWorkspace: (workspaceId) =>
      [...read().rows.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .toSorted(newestFirst)
        .map(copyRow),
    due: (nowMs) =>
      [...read().rows.values()]
        .filter((row) => row.purgeAfter <= nowMs)
        .toSorted(earliestDue)
        .map(copyRow),
  };
}
