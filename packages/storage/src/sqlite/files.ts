// Where each file lives, how a connection to it is opened, and how it reaches the current schema.
import { Database, SQLiteError } from "bun:sqlite";
import { join } from "node:path";
import { wellFormedKey } from "../home.ts";
import type { Home } from "../ports/index.ts";
import { STORAGE_SCHEMA_VERSION, StorageError } from "../ports/index.ts";
import { MIGRATIONS } from "./migrations.ts";

export const CONTROL_FILE = "control.sqlite";

/** Write durability for a SQLite WAL connection: "full" (default) for primary files, "normal" for derived caches, "off" for disposable staging. */
export type SqliteDurability = "full" | "normal" | "off";

/** `project-<uuid>.sqlite` or `user-<userId>.sqlite`, in `dir`. */
export const docFilePath = (dir: string, home: Home): string =>
  join(dir, `${wellFormedKey(home).replace(":", "-")}.sqlite`);

function applyDurability(db: Database, durability: SqliteDurability): void {
  switch (durability) {
    case "full":
      db.run("PRAGMA synchronous = FULL");
      if (process.platform === "darwin") db.run("PRAGMA fullfsync = 1");
      return;
    case "normal":
      db.run("PRAGMA synchronous = NORMAL");
      return;
    case "off":
      db.run("PRAGMA synchronous = OFF");
      return;
    default:
      durability satisfies never;
  }
}

/** A connection with the pragmas every file runs with. StorageError("corrupt") when SQLite cannot read the file. */
export function openDatabase(
  path: string,
  options?: { durability?: SqliteDurability },
): Database {
  let db: Database | null = null;
  try {
    db = new Database(path, { create: true, strict: true });
    db.run("PRAGMA journal_mode = WAL");
    applyDurability(db, options?.durability ?? "full");
    db.run("PRAGMA cache_size = -16000");
    db.run("PRAGMA temp_store = MEMORY");
    db.run("PRAGMA foreign_keys = ON");
    db.run("PRAGMA busy_timeout = 5000");
    return db;
  } catch (error) {
    db?.close();
    throw new StorageError("corrupt", { cause: error });
  }
}

// SQLite's result code when a write needs a page the disk, or the file's page limit, cannot give.
const SQLITE_FULL = 13;

/**
 * Runs `fn` as one `BEGIN IMMEDIATE` transaction, or inside the one already open.
 * A failure rolls it back and throws StorageError("disk_full") when SQLite reports
 * SQLITE_FULL, else StorageError("commit_failed"); a RangeError, the caller's
 * mistake, passes through.
 */
export function transact<T>(db: Database, fn: () => T): T {
  if (db.inTransaction) return fn();
  try {
    return db.transaction(fn).immediate();
  } catch (error) {
    if (error instanceof RangeError) throw error;
    const full = error instanceof SQLiteError && error.errno === SQLITE_FULL;
    throw new StorageError(full ? "disk_full" : "commit_failed", {
      cause: error,
    });
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
