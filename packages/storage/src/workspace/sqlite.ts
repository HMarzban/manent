// Each workspace's settings over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type {
  WorkspaceSettingRow,
  WorkspaceSettingsStore,
} from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

// the row as a type alias, which SQLite's named bindings accept where an interface lacks the index signature
type Bindings<T> = { [K in keyof T]: T[K] };

const SETTING_COLUMNS = `workspace_id AS workspaceId, "key", value,
  updated_by_user_id AS updatedByUserId, updated_at AS updatedAt`;

function prepare(db: Database) {
  return {
    get: db.query<WorkspaceSettingRow, [string, string]>(
      `SELECT ${SETTING_COLUMNS} FROM workspace_settings WHERE workspace_id = ?1 AND "key" = ?2`,
    ),
    list: db.query<WorkspaceSettingRow, [string]>(
      `SELECT ${SETTING_COLUMNS} FROM workspace_settings WHERE workspace_id = ?1 ORDER BY "key" ASC`,
    ),
    set: db.query<never, Bindings<WorkspaceSettingRow>>(
      `INSERT INTO workspace_settings (workspace_id, "key", value, updated_by_user_id, updated_at)
       VALUES ($workspaceId, $key, $value, $updatedByUserId, $updatedAt)
       ON CONFLICT (workspace_id, "key") DO UPDATE SET
         value = excluded.value,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
    ),
    remove: db.query<never, [string, string]>(
      'DELETE FROM workspace_settings WHERE workspace_id = ?1 AND "key" = ?2',
    ),
  };
}

/** The control file's workspace settings store over SQLite. */
export function createSqliteWorkspaceSettings(options: {
  db: Database;
  now: () => number;
}): WorkspaceSettingsStore {
  const { db, now } = options;
  const sql = prepare(db);
  return {
    get: (workspaceId, key) => sql.get.get(workspaceId, key),
    list: (workspaceId) => sql.list.all(workspaceId),
    set: (workspaceId, key, value, updatedByUserId) =>
      transact(db, () => {
        const row: WorkspaceSettingRow = {
          workspaceId,
          key,
          value,
          updatedByUserId,
          updatedAt: now(),
        };
        sql.set.run(row);
        return row;
      }),
    remove: (workspaceId, key) =>
      transact(db, () => sql.remove.run(workspaceId, key).changes > 0),
  };
}
