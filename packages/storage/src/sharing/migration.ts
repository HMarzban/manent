// The sharing tables and columns, which migration 6 adds: links and group grants to the control file, sends, opens
// and reads to every document file. Token hashes are stored as bytes; lists are JSON arrays.

/** Migration 6's statements, per kind of file, in order. */
export const SHARING_MIGRATION: {
  control: readonly string[];
  documents: readonly string[];
  checkpoints: readonly string[];
} = Object.freeze({
  control: [
    `CREATE TABLE share_links (id TEXT NOT NULL PRIMARY KEY, doc_id TEXT NOT NULL, token_hash BLOB NOT NULL, role TEXT NOT NULL,
  expires_at INTEGER, revoked_at INTEGER, created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    `CREATE TABLE draft_links (id TEXT NOT NULL PRIMARY KEY, send_id TEXT NOT NULL, token_hash BLOB NOT NULL, sign_in INTEGER NOT NULL,
  expires_at INTEGER, created_at INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    `ALTER TABLE doc_roles ADD COLUMN source TEXT NOT NULL DEFAULT 'own'`,
    `ALTER TABLE doc_roles ADD COLUMN last_active_at INTEGER`,
    `CREATE TABLE group_grants (doc_id TEXT NOT NULL, group_id TEXT NOT NULL, role TEXT NOT NULL,
  PRIMARY KEY (doc_id, group_id)) STRICT, WITHOUT ROWID`,
  ],
  documents: [
    `CREATE TABLE draft_sends (id TEXT NOT NULL PRIMARY KEY, doc_id TEXT NOT NULL, version_id TEXT NOT NULL, name TEXT NOT NULL,
  group_ids TEXT NOT NULL, recipient_user_ids TEXT NOT NULL, watermarked_user_ids TEXT NOT NULL, files TEXT NOT NULL, what TEXT NOT NULL,
  against_version_id TEXT, sent_by_user_id TEXT NOT NULL, sent_at INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
    `CREATE TABLE draft_opens (send_id TEXT NOT NULL, user_id TEXT, opened_at INTEGER NOT NULL) STRICT`,
    `CREATE TABLE reader_reads (doc_id TEXT NOT NULL, user_id TEXT NOT NULL, version_id TEXT NOT NULL, read_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, user_id)) STRICT, WITHOUT ROWID`,
  ],
  checkpoints: [],
});
