// The public API's keys over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { ApiKeyStore } from "../ports/index.ts";

export function createSqliteApiKeys(_options: {
  db: Database;
  now: () => number;
}): ApiKeyStore {
  return {};
}
