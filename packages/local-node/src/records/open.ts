// Opening and migrating records.sqlite, kept apart from statement definitions.
import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema.ts";

/** `PRAGMA user_version` of records.sqlite. */
export const RECORDS_VERSION = 2;

/** The connection settings of every store file; a file from a newer version is closed untouched first. */
export function openRecordsFile(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  const version =
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version ?? 0;
  if (version > RECORDS_VERSION) {
    db.close();
    throw new RangeError("records from a newer version");
  }
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = FULL");
  if (process.platform === "darwin") db.run("PRAGMA fullfsync = 1");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  if (version < RECORDS_VERSION)
    db.transaction(() => {
      if (version === 0) {
        for (const statement of SCHEMA) db.run(statement);
      } else if (version < 2) {
        db.run(
          "ALTER TABLE cloud ADD COLUMN demo_dismissed INTEGER NOT NULL DEFAULT 0",
        );
      }
      db.run(`PRAGMA user_version = ${RECORDS_VERSION}`);
    }).immediate();
  return db;
}
