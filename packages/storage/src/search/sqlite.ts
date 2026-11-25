// SQLite FTS5 (unicode61) driver for SearchIndex, stored in search.sqlite beside control.sqlite.
import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { SEARCH_INDEX_FILE, SEARCH_INDEX_VERSION } from "../ports/search.ts";
import type {
  SearchEntry,
  SearchHead,
  SearchHit,
  SearchIndex,
  SearchQuery,
} from "../ports/search.ts";
import { openDatabase, transact } from "../sqlite/files.ts";
import { runSearchQuery } from "./query.ts";

/** Where to open the derived search index: a storage directory (using search.sqlite) or an explicit path (such as ":memory:"). */
export type SqliteSearchIndexOptions =
  { readonly dir: string } | { readonly path: string };

const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE search_docs (
    doc_id TEXT NOT NULL PRIMARY KEY,
    workspace_id TEXT,
    kind TEXT NOT NULL,
    project_kind TEXT,
    title TEXT NOT NULL,
    changed_at INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    body TEXT NOT NULL,
    editor_body TEXT NOT NULL
  )`,
  `CREATE TABLE search_doc_folders (
    doc_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    PRIMARY KEY (doc_id, folder_id),
    FOREIGN KEY (doc_id) REFERENCES search_docs(doc_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX search_doc_folders_folder_idx ON search_doc_folders (folder_id, doc_id)`,
  `CREATE VIRTUAL TABLE search_fts USING fts5(title, body, tokenize='unicode61')`,
  `CREATE VIRTUAL TABLE search_editor_fts USING fts5(title, body, editor_body, tokenize='unicode61')`,
];

const readUserVersion = (db: Database): number =>
  db.query<{ user_version: number }, []>("PRAGMA user_version").get()
    ?.user_version ?? 0;

function resetSchema(db: Database): void {
  transact(db, () => {
    const virtualTables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%'",
      )
      .all();
    for (const { name } of virtualTables) {
      db.run(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`);
    }
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    for (const { name } of tables) {
      db.run(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`);
    }
    for (const statement of SCHEMA_STATEMENTS) db.run(statement);
    db.run(`PRAGMA user_version = ${SEARCH_INDEX_VERSION}`);
  });
}

function prepareStatements(db: Database) {
  return {
    selectRowid: db.query<{ rowid: number }, [string]>(
      "SELECT rowid FROM search_docs WHERE doc_id = ?",
    ),
    selectHead: db.query<{ generation: number; seq: number }, [string]>(
      "SELECT generation, seq FROM search_docs WHERE doc_id = ?",
    ),
    selectAllIds: db.query<{ doc_id: string }, []>(
      "SELECT doc_id FROM search_docs ORDER BY doc_id ASC",
    ),
    insertDoc: db.query<
      { rowid: number },
      [
        string,
        string | null,
        string,
        string | null,
        string,
        number,
        number,
        number,
        string,
        string,
      ]
    >(
      `INSERT INTO search_docs (doc_id, workspace_id, kind, project_kind, title, changed_at, generation, seq, body, editor_body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING rowid`,
    ),
    updateDoc: db.query<
      null,
      [
        string | null,
        string,
        string | null,
        string,
        number,
        number,
        number,
        string,
        string,
        string,
      ]
    >(
      `UPDATE search_docs
       SET workspace_id = ?, kind = ?, project_kind = ?, title = ?, changed_at = ?, generation = ?, seq = ?, body = ?, editor_body = ?
       WHERE doc_id = ?`,
    ),
    deleteDoc: db.query<null, [string]>(
      "DELETE FROM search_docs WHERE doc_id = ?",
    ),
    deleteFolders: db.query<null, [string]>(
      "DELETE FROM search_doc_folders WHERE doc_id = ?",
    ),
    insertFolder: db.query<null, [string, string]>(
      "INSERT OR IGNORE INTO search_doc_folders (doc_id, folder_id) VALUES (?, ?)",
    ),
    deleteViewerFts: db.query<null, [number]>(
      "DELETE FROM search_fts WHERE rowid = ?",
    ),
    deleteEditorFts: db.query<null, [number]>(
      "DELETE FROM search_editor_fts WHERE rowid = ?",
    ),
    insertViewerFts: db.query<null, [number, string, string]>(
      "INSERT INTO search_fts (rowid, title, body) VALUES (?, ?, ?)",
    ),
    insertEditorFts: db.query<null, [number, string, string, string]>(
      "INSERT INTO search_editor_fts (rowid, title, body, editor_body) VALUES (?, ?, ?, ?)",
    ),
  };
}

/** Opens or creates the SQLite FTS5 (unicode61) search index; resets all tables empty when PRAGMA user_version differs. */
export function openSqliteSearchIndex(
  options: SqliteSearchIndexOptions,
): SearchIndex {
  const path =
    "dir" in options ? join(options.dir, SEARCH_INDEX_FILE) : options.path;
  const db = openDatabase(path, { durability: "normal" });
  if (readUserVersion(db) !== SEARCH_INDEX_VERSION) resetSchema(db);
  const stmts = prepareStatements(db);

  return {
    put(entry: SearchEntry): void {
      const editorBody = entry.editorText ?? "";
      transact(db, () => {
        const existing = stmts.selectRowid.get(entry.docId);
        let rowid: number;
        if (existing !== null) {
          rowid = existing.rowid;
          stmts.deleteViewerFts.run(rowid);
          stmts.deleteEditorFts.run(rowid);
          stmts.deleteFolders.run(entry.docId);
          stmts.updateDoc.run(
            entry.workspaceId,
            entry.kind,
            entry.projectKind,
            entry.title,
            entry.changedAt,
            entry.generation,
            entry.seq,
            entry.text,
            editorBody,
            entry.docId,
          );
        } else {
          rowid = stmts.insertDoc.get(
            entry.docId,
            entry.workspaceId,
            entry.kind,
            entry.projectKind,
            entry.title,
            entry.changedAt,
            entry.generation,
            entry.seq,
            entry.text,
            editorBody,
          )!.rowid;
        }
        for (const folderId of entry.folderIds) {
          stmts.insertFolder.run(entry.docId, folderId);
        }
        stmts.insertViewerFts.run(rowid, entry.title, entry.text);
        stmts.insertEditorFts.run(rowid, entry.title, entry.text, editorBody);
      });
    },
    remove(docId: string): void {
      transact(db, () => {
        const existing = stmts.selectRowid.get(docId);
        if (existing === null) return;
        stmts.deleteViewerFts.run(existing.rowid);
        stmts.deleteEditorFts.run(existing.rowid);
        stmts.deleteDoc.run(docId);
      });
    },
    headOf(docId: string): SearchHead | null {
      const row = stmts.selectHead.get(docId);
      return row === null ? null : { generation: row.generation, seq: row.seq };
    },
    indexedDocIds(): string[] {
      return stmts.selectAllIds.all().map((row) => row.doc_id);
    },
    query(query: SearchQuery): SearchHit[] {
      return runSearchQuery(db, query);
    },
    close(): void {
      db.close();
    },
  };
}
