// The sharing tables kept in memory, for the in-memory driver.
import type {
  DocDirectory,
  ShareLinkStore,
  SharingStore,
} from "../ports/index.ts";

/** One document file's sharing rows. Values are replaced, never changed in place. */
export interface SharingTables {}

/** A copy that a transaction may change without touching `tables`. */
export function copySharingTables(
  tables: SharingTables | undefined,
): SharingTables {
  return { ...tables };
}

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemorySharing(_options: {
  read: () => SharingTables;
  write: <T>(op: (tables: SharingTables) => T) => T;
}): SharingStore {
  return {};
}

/** The control file's sharing rows. */
export interface ShareLinkTables {}

export function createShareLinkTables(): ShareLinkTables {
  return {};
}

/** The store over the storage's tables; `commit` writes through whatever fault is armed, and `directory` holds the roles. */
export function createMemoryShareLinks(_options: {
  now: () => number;
  read: () => ShareLinkTables;
  commit: <T>(apply: () => T) => T;
  directory: DocDirectory;
}): ShareLinkStore {
  return {};
}
