// Private copies and their hand-ins kept in memory, for the in-memory driver.
import type {
  HandInRow,
  PrivateCopyRow,
  PrivateCopyStore,
} from "../ports/index.ts";

/** One document file's rows. Values are replaced, never changed in place. */
export interface PrivateCopyTables {
  /** By privateDocId. */
  copies: Map<string, PrivateCopyRow>;
  /** By key. */
  handIns: Map<string, HandInRow>;
}

/** A copy that a transaction may change without touching `tables`. */
export function copyPrivateCopyTables(
  tables: PrivateCopyTables | undefined,
): PrivateCopyTables {
  return {
    copies: new Map(tables?.copies),
    handIns: new Map(tables?.handIns),
  };
}

// open first; then the latest hand-in, a tie broken by the greater id
const byLatest = (a: PrivateCopyRow, b: PrivateCopyRow): number =>
  a.handedInAt === null || b.handedInAt === null
    ? Number(a.handedInAt !== null) - Number(b.handedInAt !== null)
    : b.handedInAt - a.handedInAt || (a.privateDocId < b.privateDocId ? 1 : -1);

const isOpenCopyOf = (row: PrivateCopyRow, of: PrivateCopyRow): boolean =>
  row.handedInAt === null &&
  row.sourceDocId === of.sourceDocId &&
  row.ownerUserId === of.ownerUserId;

function addCopy(tables: PrivateCopyTables, row: PrivateCopyRow): void {
  if (tables.copies.has(row.privateDocId))
    throw new RangeError(`private copy ${row.privateDocId} is already stored`);
  if (
    row.handedInAt === null &&
    [...tables.copies.values()].some((r) => isOpenCopyOf(r, row))
  )
    throw new RangeError(
      `${row.ownerUserId} already has an open private copy of ${row.sourceDocId}`,
    );
  tables.copies.set(row.privateDocId, { ...row });
}

function markHandedIn(
  tables: PrivateCopyTables,
  privateDocId: string,
  at: number,
): void {
  const row = tables.copies.get(privateDocId);
  if (row === undefined || row.handedInAt !== null)
    throw new RangeError(`private copy ${privateDocId} is not open`);
  tables.copies.set(privateDocId, { ...row, handedInAt: at });
}

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemoryPrivateCopies(options: {
  read: () => PrivateCopyTables;
  write: <T>(op: (tables: PrivateCopyTables) => T) => T;
}): PrivateCopyStore {
  const { read, write } = options;
  return {
    copyOf: (privateDocId) => {
      const row = read().copies.get(privateDocId);
      return row === undefined ? null : { ...row };
    },
    latestCopyOf: (sourceDocId, ownerUserId) => {
      const [row] = [...read().copies.values()]
        .filter(
          (r) => r.sourceDocId === sourceDocId && r.ownerUserId === ownerUserId,
        )
        .toSorted(byLatest);
      return row === undefined ? null : { ...row };
    },
    addCopy: (row) => write((t) => addCopy(t, row)),
    markHandedIn: (privateDocId, at) =>
      write((t) => markHandedIn(t, privateDocId, at)),
    handInOf: (key) => {
      const row = read().handIns.get(key);
      return row === undefined ? null : { ...row };
    },
    addHandIn: (row) =>
      write((t) => {
        if (t.handIns.has(row.key))
          throw new RangeError(`hand-in key ${row.key} is already stored`);
        t.handIns.set(row.key, { ...row });
      }),
  };
}
