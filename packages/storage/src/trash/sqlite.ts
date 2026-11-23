// The documents in Trash over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { TrashStore } from "../ports/index.ts";

export function createSqliteTrash(_options: {
  db: Database;
  now: () => number;
}): TrashStore {
  return {};
}
