// The documents in Trash over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { TrashRow, TrashStore } from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

// the row as a type alias, which SQLite's named bindings accept where an interface lacks the index signature
type Bindings<T> = { [K in keyof T]: T[K] };

const TRASH_COLUMNS = `doc_id AS docId, workspace_id AS workspaceId, home,
  deleted_by_user_id AS deletedByUserId, deleted_at AS deletedAt, purge_after AS purgeAfter`;

function prepare(db: Database) {
  return {
    put: db.query<never, Bindings<TrashRow>>(
      `INSERT OR REPLACE INTO trash (doc_id, workspace_id, home, deleted_by_user_id, deleted_at, purge_after)
       VALUES ($docId, $workspaceId, $home, $deletedByUserId, $deletedAt, $purgeAfter)`,
    ),
    get: db.query<TrashRow, [string]>(
      `SELECT ${TRASH_COLUMNS} FROM trash WHERE doc_id = ?1`,
    ),
    remove: db.query<never, [string]>("DELETE FROM trash WHERE doc_id = ?1"),
    listByWorkspace: db.query<TrashRow, [string]>(
      `SELECT ${TRASH_COLUMNS} FROM trash WHERE workspace_id = ?1 ORDER BY deleted_at DESC, doc_id ASC`,
    ),
    due: db.query<TrashRow, [number]>(
      `SELECT ${TRASH_COLUMNS} FROM trash WHERE purge_after <= ?1 ORDER BY purge_after ASC, doc_id ASC`,
    ),
  };
}

/** The control file's Trash store over SQLite. */
export function createSqliteTrash(options: {
  db: Database;
  now: () => number;
}): TrashStore {
  const { db } = options;
  const sql = prepare(db);
  return {
    put(row) {
      transact(db, () => {
        sql.put.run(row);
      });
    },
    get: (docId) => sql.get.get(docId),
    remove(docId) {
      transact(db, () => {
        sql.remove.run(docId);
      });
    },
    listByWorkspace: (workspaceId) => sql.listByWorkspace.all(workspaceId),
    due: (nowMs) => sql.due.all(nowMs),
  };
}
