// Private copies and their hand-ins over SQLite.
import type { Database } from "bun:sqlite";
import type { PrivateCopyStore } from "../ports/index.ts";

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqlitePrivateCopies(_db: Database): PrivateCopyStore {
  return {};
}
