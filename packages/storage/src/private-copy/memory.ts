// Private copies and their hand-ins kept in memory, for the in-memory driver.
import type { PrivateCopyStore } from "../ports/index.ts";

/** One document file's rows. Values are replaced, never changed in place. */
export interface PrivateCopyTables {}

/** A copy that a transaction may change without touching `tables`. */
export function copyPrivateCopyTables(
  tables: PrivateCopyTables | undefined,
): PrivateCopyTables {
  return { ...tables };
}

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemoryPrivateCopies(_options: {
  read: () => PrivateCopyTables;
  write: <T>(op: (tables: PrivateCopyTables) => T) => T;
}): PrivateCopyStore {
  return {};
}
