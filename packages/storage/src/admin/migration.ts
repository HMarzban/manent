// The control file's administration tables, which migration 9 adds: Trash, workspace settings, API keys and the
// notification outbox, whose rows are numbered in the order they are queued.

/** Migration 9's statements, per kind of file, in order. */
export const ADMIN_MIGRATION: {
  control: readonly string[];
  documents: readonly string[];
  checkpoints: readonly string[];
} = Object.freeze({
  control: [
    `CREATE TABLE trash (doc_id TEXT NOT NULL PRIMARY KEY, workspace_id TEXT NOT NULL, home TEXT NOT NULL,
  deleted_by_user_id TEXT NOT NULL, deleted_at INTEGER NOT NULL, purge_after INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    `CREATE TABLE workspace_settings (workspace_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (workspace_id, key)) STRICT, WITHOUT ROWID`,
    `CREATE TABLE api_keys (id TEXT NOT NULL PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, key_hash BLOB NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER) STRICT, WITHOUT ROWID`,
    `CREATE TABLE notification_outbox (id INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL, adapter TEXT NOT NULL, payload TEXT NOT NULL,
  attempts INTEGER NOT NULL, next_try_at INTEGER NOT NULL, delivered_at INTEGER) STRICT`,
  ],
  documents: [],
  checkpoints: [],
});
