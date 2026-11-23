// The prompter tables, which migration 8 adds to every document file: each send of a rundown's row, and the
// stored answers of send requests.

/** Migration 8's statements, per kind of file, in order. */
export const PROMPTER_MIGRATION: {
  control: readonly string[];
  documents: readonly string[];
  checkpoints: readonly string[];
} = Object.freeze({
  control: [],
  documents: [
    `CREATE TABLE prompter_sends (doc_id TEXT NOT NULL, row_id TEXT NOT NULL, story_doc_id TEXT NOT NULL, version_id TEXT,
  generation INTEGER NOT NULL, seq INTEGER NOT NULL, sent_by_user_id TEXT, sent_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, row_id, sent_at)) STRICT, WITHOUT ROWID`,
    `CREATE TABLE prompter_requests (doc_id TEXT NOT NULL, request_key TEXT NOT NULL, user_id TEXT NOT NULL, result TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (doc_id, request_key)) STRICT, WITHOUT ROWID`,
  ],
  checkpoints: [],
});
