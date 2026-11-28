// The tables of records.sqlite, made in this order when the file is new.
export const SCHEMA = [
  `CREATE TABLE secret (id INTEGER PRIMARY KEY CHECK (id = 1), key BLOB NOT NULL) STRICT`,
  `CREATE TABLE people (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, wants_cloud INTEGER NOT NULL,
    cloud_token TEXT, chosen_at INTEGER NOT NULL) STRICT`,
  `CREATE TABLE current_person (id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL, node_token TEXT NOT NULL) STRICT`,
  `CREATE TABLE docs (doc_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL,
    generation INTEGER NOT NULL, changed_at INTEGER NOT NULL) STRICT`,
  `CREATE TABLE handoffs (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, kind TEXT NOT NULL, home TEXT NOT NULL, workspace_id TEXT,
    snapshot BLOB NOT NULL, started_at INTEGER NOT NULL, refused TEXT) STRICT`,
  `CREATE TABLE cloud (id INTEGER PRIMARY KEY CHECK (id = 1), seed_id TEXT, demo_dismissed INTEGER NOT NULL DEFAULT 0) STRICT`,
  `CREATE TABLE recovered (doc_id TEXT NOT NULL, n INTEGER NOT NULL, user_id TEXT NOT NULL, cause TEXT NOT NULL,
    block_id TEXT, near_block_id TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (doc_id, n)) STRICT`,
  `CREATE TABLE workspaces (doc_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL) STRICT`,
] as const;
