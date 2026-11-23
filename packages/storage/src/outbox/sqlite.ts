// The notifications waiting to be delivered over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { OutboxStore } from "../ports/index.ts";

export function createSqliteOutbox(_options: {
  db: Database;
  now: () => number;
}): OutboxStore {
  return {};
}
