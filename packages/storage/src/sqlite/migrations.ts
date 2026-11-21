// Every migration appends one entry to each of the three lists ([] where that kind of file does not change) and never edits an earlier one;
// each list's length is STORAGE_SCHEMA_VERSION.

/** Per kind of file, each migration's statements, in order: entry n takes a file from user_version n - 1 to n. */
export const MIGRATIONS: {
  control: string[][];
  documents: string[][];
  checkpoints: string[][];
} = Object.freeze({
  control: [
    [
      `CREATE TABLE doc_directory (
        doc_id TEXT PRIMARY KEY, home TEXT NOT NULL,
        kind TEXT NOT NULL, created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT`,
      `CREATE INDEX doc_directory_by_home ON doc_directory (home, doc_id)`,
      `CREATE TABLE doc_roles (
        doc_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (doc_id, user_id)
      ) STRICT, WITHOUT ROWID`,
      `CREATE TABLE tombstones (doc_id TEXT PRIMARY KEY, deleted_by_user_id TEXT NOT NULL, deleted_at INTEGER NOT NULL) STRICT`,
    ],
    [],
    [],
    [],
  ],
  documents: [
    [
      `CREATE TABLE documents (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL,
        owner_id TEXT,
        generation INTEGER NOT NULL DEFAULT 1, head_seq INTEGER NOT NULL DEFAULT 0,
        schema_version INTEGER NOT NULL, engine_version INTEGER, locked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, deleted_at INTEGER
      ) STRICT`,
      `CREATE TABLE doc_updates (
        doc_id TEXT NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL,
        update_blob BLOB NOT NULL, crc32 INTEGER NOT NULL, user_id TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'edit',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, generation, seq)
      ) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_clients (
        doc_id TEXT, client_id INTEGER, user_id TEXT NOT NULL, first_seen INTEGER, acked_clock INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (doc_id, client_id)) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_people (
        doc_id TEXT NOT NULL, user_id TEXT NOT NULL, color_index INTEGER NOT NULL, first_seen INTEGER NOT NULL,
        PRIMARY KEY (doc_id, user_id)) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_set_requests (
        doc_id TEXT NOT NULL, user_id TEXT NOT NULL, device_id TEXT NOT NULL, client_seq INTEGER NOT NULL,
        PRIMARY KEY (doc_id, user_id, device_id)) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_versions (
        id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, generation INTEGER, seq INTEGER,
        kind TEXT NOT NULL,
        name TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, device_id TEXT,
        snapshot_ref TEXT, engine_version INTEGER, recipients TEXT
      ) STRICT`,
      `CREATE INDEX doc_versions_by_doc ON doc_versions (doc_id, created_at)`,
      `CREATE TABLE doc_quarantine (
        doc_id TEXT NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL,
        update_blob BLOB NOT NULL, crc32 INTEGER NOT NULL, user_id TEXT NOT NULL, origin TEXT NOT NULL,
        created_at INTEGER NOT NULL, quarantined_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, generation, seq)
      ) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_healing (
        doc_id TEXT PRIMARY KEY, reason TEXT NOT NULL,
        verified_seq INTEGER NOT NULL, flagged_at INTEGER NOT NULL, pre_heal_version_id TEXT
      ) STRICT`,
    ],
    [
      `CREATE TABLE doc_generations (
        doc_id TEXT NOT NULL, generation INTEGER NOT NULL,
        final_state BLOB, final_seq INTEGER NOT NULL, frozen_at INTEGER NOT NULL, purge_after INTEGER NOT NULL,
        reason TEXT NOT NULL, next_initial_bytes INTEGER NOT NULL, rebuilt_by_client_id INTEGER NOT NULL,
        PRIMARY KEY (doc_id, generation)) STRICT, WITHOUT ROWID`,
      `CREATE TABLE doc_replays (
        doc_id TEXT NOT NULL, replay_key TEXT NOT NULL, user_id TEXT NOT NULL,
        from_generation INTEGER NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL,
        result TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, replay_key)) STRICT, WITHOUT ROWID`,
    ],
    [
      `CREATE TABLE doc_adoptions (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, user_id TEXT NOT NULL, seq INTEGER NOT NULL,
        adopted_at INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    ],
    [
      `CREATE TABLE version_chunks (hash BLOB PRIMARY KEY, body BLOB NOT NULL) STRICT, WITHOUT ROWID`,
      `CREATE TABLE version_summaries (version_id TEXT PRIMARY KEY, author_ids TEXT NOT NULL,
        block_ids TEXT NOT NULL, scene_ids TEXT NOT NULL) STRICT, WITHOUT ROWID`,
      `CREATE TABLE history_requests (doc_id TEXT NOT NULL, request_key TEXT NOT NULL, user_id TEXT NOT NULL,
        result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (doc_id, request_key)) STRICT, WITHOUT ROWID`,
      `CREATE INDEX doc_versions_page ON doc_versions (doc_id, created_at DESC, id DESC)`,
    ],
  ],
  checkpoints: [
    [
      `CREATE TABLE doc_checkpoints (
        doc_id TEXT NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL,
        state BLOB NOT NULL, sha256 BLOB NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, generation, seq)
      ) STRICT, WITHOUT ROWID`,
    ],
    [
      `CREATE TABLE doc_measures (
        doc_id TEXT NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL,
        live_bytes INTEGER NOT NULL, plain_bytes INTEGER NOT NULL, client_ids INTEGER NOT NULL, largest_section INTEGER NOT NULL,
        PRIMARY KEY (doc_id, generation)) STRICT, WITHOUT ROWID`,
    ],
    [],
    [
      `CREATE TABLE checkpoint_pins (version_id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, generation INTEGER NOT NULL,
        seq INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    ],
  ],
});
