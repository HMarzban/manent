// The private-copy tables, which migration 7 adds to every document file. `answer` is a hand-in's stored response
// JSON, given again for a retried key.

/** Migration 7's statements, per kind of file, in order. */
export const PRIVATE_COPY_MIGRATION: {
  control: readonly string[];
  documents: readonly string[];
  checkpoints: readonly string[];
} = Object.freeze({
  control: [],
  documents: [
    `CREATE TABLE private_copies (private_doc_id TEXT PRIMARY KEY, source_doc_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  base_generation INTEGER NOT NULL, base_seq INTEGER NOT NULL, base_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  handed_in_at INTEGER) STRICT, WITHOUT ROWID`,
    `CREATE UNIQUE INDEX private_copies_open ON private_copies (source_doc_id, owner_user_id) WHERE handed_in_at IS NULL`,
    `CREATE TABLE handins (key TEXT PRIMARY KEY, private_doc_id TEXT NOT NULL, user_id TEXT NOT NULL, before_version_id TEXT NOT NULL,
  answer TEXT NOT NULL, at INTEGER NOT NULL) STRICT, WITHOUT ROWID`,
  ],
  checkpoints: [],
});
