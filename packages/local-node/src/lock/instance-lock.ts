// The single-instance lock: a SQLite file held in exclusive locking mode while an instance runs.
import { Database, SQLiteError } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const COMMIT_WAIT_MS = 2_000;

/** Held until `release()`, or until the object is collected: keep a reference for as long as the instance runs. */
export interface InstanceLock {
  release(): void;
}

/**
 * Takes `<root>/instance.lock`, creating the root when missing. In exclusive locking mode SQLite keeps the
 * file lock from the first write until the connection closes, and the system frees it when the process dies.
 * "held" is answered at once; another failure to open the file is thrown.
 */
export function acquireInstanceLock(
  root: string,
): { ok: true; lock: InstanceLock } | { ok: false; reason: "held" } {
  mkdirSync(root, { recursive: true });
  const db = new Database(join(root, "instance.lock"), { create: true });
  try {
    db.run("PRAGMA busy_timeout = 0");
    db.run("PRAGMA locking_mode = EXCLUSIVE");
    db.run("BEGIN IMMEDIATE");
  } catch (error) {
    db.close();
    if (error instanceof SQLiteError && error.code === "SQLITE_BUSY")
      return { ok: false, reason: "held" };
    throw error;
  }
  try {
    // Ours now. A launch started at the same moment may still hold a read lock for the instant before it
    // closes, so the commit that takes the exclusive lock waits for it instead of failing both launches.
    db.run(`PRAGMA busy_timeout = ${COMMIT_WAIT_MS}`);
    db.run("CREATE TABLE IF NOT EXISTS instance (id INTEGER PRIMARY KEY)");
    db.run("INSERT OR REPLACE INTO instance (id) VALUES (1)");
    db.run("COMMIT");
  } catch (error) {
    db.close();
    throw error;
  }
  return { ok: true, lock: { release: () => db.close() } };
}
