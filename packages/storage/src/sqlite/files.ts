// Where each file lives, how a connection to it is opened, and how it reaches the current schema.
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { wellFormedKey } from "../home.ts";
import type { Home } from "../ports.ts";
import { STORAGE_SCHEMA_VERSION, StorageError } from "../ports.ts";
import { MIGRATIONS } from "./migrations.ts";

export const CONTROL_FILE = "control.sqlite";

/** `project-<uuid>.sqlite` or `user-<userId>.sqlite`, in `dir`. */
export const docFilePath = (dir: string, home: Home): string =>
  join(dir, `${wellFormedKey(home).replace(":", "-")}.sqlite`);

/** A connection with the pragmas every file runs with. StorageError("corrupt") when SQLite cannot read the file. */
export function openDatabase(path: string): Database {
  let db: Database | null = null;
  try {
    db = new Database(path, { create: true, strict: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = FULL");
    if (process.platform === "darwin") db.run("PRAGMA fullfsync = 1");
    db.run("PRAGMA foreign_keys = ON");
    db.run("PRAGMA busy_timeout = 5000");
    return db;
  } catch (error) {
    db?.close();
    throw new StorageError("corrupt", { cause: error });
  }
}

/**
 * Runs `fn` as one `BEGIN IMMEDIATE` transaction, or inside the one already open.
 * A failure rolls it back and throws StorageError("commit_failed"); a RangeError,
 * the caller's mistake, passes through.
 */
export function transact<T>(db: Database, fn: () => T): T {
  if (db.inTransaction) return fn();
  try {
    return db.transaction(fn).immediate();
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new StorageError("commit_failed", { cause: error });
  }
}

const userVersion = (db: Database): number =>
  db.query<{ user_version: number }, []>("PRAGMA user_version").get()
    ?.user_version ?? 0;

/** Brings the file to STORAGE_SCHEMA_VERSION. StorageError("corrupt") for a file a later build wrote. */
export function migrate(db: Database, kind: keyof typeof MIGRATIONS): void {
  const lists = Object.values(MIGRATIONS);
  if (lists.some((list) => list.length !== STORAGE_SCHEMA_VERSION))
    throw new StorageError("corrupt");
  const steps = MIGRATIONS[kind];
  if (userVersion(db) > steps.length) throw new StorageError("corrupt");
  if (userVersion(db) === steps.length) return;
  transact(db, () => {
    for (let n = userVersion(db) + 1; n <= steps.length; n++) {
      for (const statement of steps[n - 1] ?? []) db.run(statement);
      db.run(`PRAGMA user_version = ${n}`);
    }
  });
}
