// The project assets table, which migration 12 adds to every document file:
// SHA-256 content-addressed binary blobs kept inside project-<uuid>.sqlite.

/** Migration 12's statements, per kind of file, in order. */
export const ASSETS_MIGRATION: {
  control: readonly string[];
  documents: readonly string[];
  checkpoints: readonly string[];
} = Object.freeze({
  control: [],
  documents: [
    `CREATE TABLE project_assets (
  asset_id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID`,
  ],
  checkpoints: [],
});
