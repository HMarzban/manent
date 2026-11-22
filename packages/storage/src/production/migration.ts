// The production tables, which migration 5 adds to every document file.

/** Migration 5's statements for a document file, in order. */
export const PRODUCTION_MIGRATION: readonly string[] = Object.freeze([
  `CREATE TABLE production (doc_id TEXT PRIMARY KEY, numbering TEXT NOT NULL, colour_order TEXT NOT NULL,   -- JSON array of colour names
  locked_at INTEGER NOT NULL, locked_on TEXT NOT NULL, locked_by TEXT NOT NULL, ended_at INTEGER) STRICT, WITHOUT ROWID`,
  `CREATE TABLE page_locks (doc_id TEXT NOT NULL, lock_level INTEGER NOT NULL, page_order INTEGER NOT NULL, label TEXT NOT NULL,
  block_id TEXT NOT NULL, offset INTEGER NOT NULL DEFAULT 0, quote TEXT, fallback_ids TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'lock', from_generation INTEGER NOT NULL, from_seq INTEGER NOT NULL,
  to_generation INTEGER, to_seq INTEGER,
  PRIMARY KEY (doc_id, lock_level, page_order, from_generation, from_seq)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE revision_sets (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, ordinal INTEGER NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL,
  mark TEXT NOT NULL DEFAULT '*', baseline_version_id TEXT NOT NULL, issued_version_id TEXT, issued_at INTEGER, issued_on TEXT,
  issued_by TEXT, recalled_at INTEGER, is_full_draft INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL,
  engine_version INTEGER NOT NULL, UNIQUE (doc_id, ordinal)) STRICT`,
  `CREATE TABLE revision_set_blocks (set_id TEXT NOT NULL, block_id TEXT NOT NULL, page_label TEXT NOT NULL, change TEXT NOT NULL,
  hash TEXT NOT NULL, ranges TEXT NOT NULL DEFAULT '{"inserted":[],"deletedAt":[]}', PRIMARY KEY (set_id, block_id)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE revision_issues (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, set_id TEXT NOT NULL, kind TEXT NOT NULL,  -- issue | correction
  version_id TEXT NOT NULL, issued_by TEXT NOT NULL, issued_at INTEGER NOT NULL, issued_on TEXT NOT NULL,
  recipients TEXT NOT NULL, pages TEXT NOT NULL, memo TEXT NOT NULL, files TEXT NOT NULL, tint INTEGER NOT NULL, what TEXT NOT NULL) STRICT`,
  `CREATE TABLE issued_scene_numbers (doc_id TEXT NOT NULL, block_id TEXT NOT NULL, num TEXT NOT NULL, reserved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_id, block_id)) STRICT, WITHOUT ROWID`,
  `CREATE TABLE production_requests (doc_id TEXT NOT NULL, request_key TEXT NOT NULL, user_id TEXT NOT NULL, status INTEGER NOT NULL,
  result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (doc_id, request_key)) STRICT, WITHOUT ROWID`,
]);
