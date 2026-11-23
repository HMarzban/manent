// The sharing tables over SQLite: a document file's sends, opens and reads, and the control file's links and grants.
import type { Database } from "bun:sqlite";
import type { ShareLinkStore, SharingStore } from "../ports/index.ts";

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqliteSharing(_db: Database): SharingStore {
  return {};
}

export function createSqliteShareLinks(_options: {
  db: Database;
  now: () => number;
}): ShareLinkStore {
  return {};
}
