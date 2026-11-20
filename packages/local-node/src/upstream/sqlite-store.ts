// One person's upstream outbox in SQLite: the layout of the browser's store, a table per kind of
// record, and every write one transaction.
import { Database, SQLiteError } from "bun:sqlite";
import type { SQLQueryBindings } from "bun:sqlite";
import { StoreError, toRecoveredItem } from "@manent/sync-client";
import type {
  DeviceVersion,
  DocMeta,
  LoadedDocument,
  LocalStore,
  RecoveredItem,
  StoredEntry,
} from "@manent/sync-client";
import { readMeta, readRecovered, readVersion } from "./stored-shapes.ts";

/** `PRAGMA user_version` of an upstream outbox file; a file with a higher one is refused unchanged. */
export const SQLITE_STORE_VERSION = 1;

const SCHEMA = [
  `CREATE TABLE meta (doc_id TEXT PRIMARY KEY, meta TEXT NOT NULL, highest_local_seq INTEGER NOT NULL) STRICT`,
  `CREATE TABLE entries (doc_id TEXT NOT NULL, local_seq INTEGER NOT NULL, kind TEXT NOT NULL, bytes BLOB,
    key TEXT, value TEXT, own INTEGER NOT NULL, acked INTEGER NOT NULL, applied INTEGER NOT NULL,
    elements TEXT NOT NULL, PRIMARY KEY (doc_id, local_seq)) STRICT`,
  `CREATE TABLE checkpoint (doc_id TEXT PRIMARY KEY, state BLOB NOT NULL, through_local_seq INTEGER NOT NULL,
    synced_base BLOB) STRICT`,
  `CREATE TABLE versions (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, doc_id TEXT NOT NULL,
    version TEXT NOT NULL, uploaded INTEGER NOT NULL) STRICT`,
  `CREATE TABLE recovered (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, doc_id TEXT NOT NULL,
    item TEXT NOT NULL) STRICT`,
] as const;

// SQLite's result code when a write needs a page the disk cannot give.
const SQLITE_FULL = 13;

interface EntryRow {
  local_seq: number;
  kind: string;
  bytes: Uint8Array | null;
  key: string | null;
  value: string | null;
  own: number;
  acked: number;
  applied: number;
  elements: string;
}

interface CheckpointRow {
  state: Uint8Array;
  through_local_seq: number;
  synced_base: Uint8Array | null;
}

function readElements(text: string): string[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string"))
    throw new TypeError(`an outbox entry holds elements ${text}`);
  return value;
}

function toEntry(row: EntryRow): StoredEntry {
  const { local_seq: localSeq, key, value, bytes } = row;
  const acked = row.acked === 1;
  if (row.kind === "set" && key !== null && value !== null)
    return { kind: "set", localSeq, key, value, acked };
  if (row.kind !== "update" || bytes === null)
    throw new TypeError(`an outbox entry of kind ${row.kind} cannot be read`);
  const update = new Uint8Array(bytes);
  const elements = readElements(row.elements);
  const own = row.own === 1;
  return {
    kind: "update",
    localSeq,
    update,
    own,
    acked,
    applied: row.applied === 1,
    elements,
  };
}

function openOutboxFile(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  const version =
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version ?? 0;
  if (version > SQLITE_STORE_VERSION) {
    db.close();
    throw new RangeError("an upstream outbox from a newer version");
  }
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = FULL");
  if (process.platform === "darwin") db.run("PRAGMA fullfsync = 1");
  db.run("PRAGMA busy_timeout = 5000");
  if (version < SQLITE_STORE_VERSION)
    db.transaction(() => {
      for (const statement of SCHEMA) db.run(statement);
      db.run(`PRAGMA user_version = ${SQLITE_STORE_VERSION}`);
    }).immediate();
  return db;
}

/** Every statement the store runs, prepared once per connection. */
function prepare(db: Database) {
  const q = <R, P extends SQLQueryBindings[]>(sql: string) =>
    db.query<R, P>(sql);
  return {
    meta: q<{ meta: string; highest: number }, [string]>(
      "SELECT meta, highest_local_seq AS highest FROM meta WHERE doc_id = ?1",
    ),
    allMeta: q<{ meta: string }, []>("SELECT meta FROM meta ORDER BY doc_id"),
    create: q<never, [string, string]>(
      "INSERT INTO meta (doc_id, meta, highest_local_seq) VALUES (?1, ?2, 0) ON CONFLICT (doc_id) DO NOTHING",
    ),
    setMeta: q<never, [string, string]>(
      "UPDATE meta SET meta = ?2 WHERE doc_id = ?1",
    ),
    raise: q<never, [string, number]>(
      "UPDATE meta SET highest_local_seq = max(highest_local_seq, ?2) WHERE doc_id = ?1",
    ),
    checkpoint: q<CheckpointRow, [string]>(
      "SELECT state, through_local_seq, synced_base FROM checkpoint WHERE doc_id = ?1",
    ),
    putCheckpoint: q<never, [string, Uint8Array, number, Uint8Array | null]>(
      `INSERT INTO checkpoint (doc_id, state, through_local_seq, synced_base) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (doc_id) DO UPDATE SET state = excluded.state, through_local_seq = excluded.through_local_seq,
       synced_base = coalesce(excluded.synced_base, checkpoint.synced_base)`,
    ),
    entries: q<EntryRow, [string, number]>(
      "SELECT * FROM entries WHERE doc_id = ?1 AND (local_seq > ?2 OR acked = 0) ORDER BY local_seq",
    ),
    putEntry: q<
      never,
      [
        string,
        number,
        string,
        Uint8Array | null,
        string | null,
        string | null,
        number,
        number,
        number,
        string,
      ]
    >(
      `INSERT OR REPLACE INTO entries (doc_id, local_seq, kind, bytes, key, value, own, acked, applied, elements)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ),
    ack: q<never, [string, number]>(
      "UPDATE entries SET acked = 1 WHERE doc_id = ?1 AND acked = 0 AND local_seq <= ?2",
    ),
    applied: q<never, [string, number]>(
      "UPDATE entries SET applied = 1 WHERE doc_id = ?1 AND kind = 'update' AND applied = 0 AND local_seq <= ?2",
    ),
    dropEntry: q<never, [string, number]>(
      "DELETE FROM entries WHERE doc_id = ?1 AND local_seq = ?2",
    ),
    dropCovered: q<never, [string, number]>(
      `DELETE FROM entries WHERE doc_id = ?1 AND local_seq <= ?2 AND acked = 1
       AND (kind = 'set' OR applied = 1)`,
    ),
    dropAllButWaitingSettings: q<never, [string]>(
      "DELETE FROM entries WHERE doc_id = ?1 AND NOT (kind = 'set' AND acked = 0)",
    ),
    addVersion: q<never, [string, string, string]>(
      "INSERT INTO versions (id, doc_id, version, uploaded) VALUES (?1, ?2, ?3, 0)",
    ),
    versions: q<{ version: string; uploaded: number }, [string]>(
      "SELECT version, uploaded FROM versions WHERE doc_id = ?1 ORDER BY n",
    ),
    uploaded: q<never, [string]>(
      "UPDATE versions SET uploaded = 1 WHERE id = ?1",
    ),
    putRecovered: q<never, [string, string, string]>(
      `INSERT INTO recovered (id, doc_id, item) VALUES (?1, ?2, ?3)
       ON CONFLICT (id) DO UPDATE SET doc_id = excluded.doc_id, item = excluded.item`,
    ),
    recovered: q<{ item: string }, [string]>(
      "SELECT item FROM recovered WHERE doc_id = ?1 ORDER BY n",
    ),
    dismiss: q<never, [string]>("DELETE FROM recovered WHERE id = ?1"),
  };
}

type Statements = ReturnType<typeof prepare>;

const bit = (on: boolean): number => (on ? 1 : 0);

function putEntry(sql: Statements, docId: string, entry: StoredEntry): void {
  if (entry.kind === "set") {
    const { localSeq, key, value, acked } = entry;
    sql.putEntry.run(
      docId,
      localSeq,
      "set",
      null,
      key,
      value,
      0,
      bit(acked),
      0,
      "[]",
    );
    return;
  }
  const { localSeq, update, own, acked, applied, elements } = entry;
  const json = JSON.stringify(elements);
  sql.putEntry.run(
    docId,
    localSeq,
    "update",
    update,
    null,
    null,
    bit(own),
    bit(acked),
    bit(applied),
    json,
  );
}

/**
 * Dana's file is never Sam's: one file per person. A full disk rejects StoreError("quota"),
 * any other failed write StoreError("write_failed"), each having written nothing; a document
 * the file does not hold rejects RangeError, as the memory store does.
 */
class SqliteLocalStore implements LocalStore {
  private readonly sql: Statements;

  constructor(
    readonly userId: string,
    private readonly db: Database,
  ) {
    this.sql = prepare(db);
  }

  async load(docId: string): Promise<LoadedDocument | null> {
    const row = this.sql.meta.get(docId);
    if (row === null) return null;
    const point = this.sql.checkpoint.get(docId);
    const through = point?.through_local_seq ?? 0;
    return {
      meta: readMeta(row.meta),
      checkpoint:
        point === null
          ? null
          : { state: new Uint8Array(point.state), throughLocalSeq: through },
      syncedBase:
        point?.synced_base == null ? null : new Uint8Array(point.synced_base),
      entries: this.sql.entries
        .all(docId, point === null ? -1 : through)
        .map(toEntry),
    };
  }

  async create(meta: DocMeta): Promise<void> {
    this.write(() => this.sql.create.run(meta.docId, JSON.stringify(meta)));
  }

  async append(docId: string, entry: StoredEntry): Promise<void> {
    this.change(docId, () => {
      putEntry(this.sql, docId, entry);
      this.sql.raise.run(docId, entry.localSeq);
    });
  }

  async acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void> {
    this.change(docId, (meta) => {
      this.sql.ack.run(docId, throughLocalSeq);
      this.sql.setMeta.run(docId, JSON.stringify({ ...meta, ...patch }));
    });
  }

  async refuse(docId: string, localSeq: number): Promise<void> {
    this.change(docId, () => this.sql.dropEntry.run(docId, localSeq));
  }

  async markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void> {
    this.change(docId, () => {
      this.sql.applied.run(docId, throughLocalSeq);
      for (const item of setAside)
        this.sql.putRecovered.run(item.id, item.docId, JSON.stringify(item));
    });
  }

  async checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void> {
    this.change(docId, () => {
      const base = synced ? state : null;
      this.sql.putCheckpoint.run(docId, state, throughLocalSeq, base);
      this.sql.dropCovered.run(docId, throughLocalSeq);
      this.sql.raise.run(docId, throughLocalSeq);
    });
  }

  async patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void> {
    this.change(docId, (meta) =>
      this.sql.setMeta.run(docId, JSON.stringify({ ...meta, ...patch })),
    );
  }

  async reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void> {
    this.change(docId, (_meta, highest) => {
      this.sql.putCheckpoint.run(docId, state, highest, state);
      this.sql.dropAllButWaitingSettings.run(docId);
      this.sql.setMeta.run(docId, JSON.stringify(meta));
    });
  }

  async addVersion(version: DeviceVersion): Promise<void> {
    const { uploaded: _uploaded, ...stored } = version;
    this.write(() =>
      this.sql.addVersion.run(
        version.id,
        version.docId,
        JSON.stringify(stored),
      ),
    );
  }

  async versions(docId: string): Promise<DeviceVersion[]> {
    return this.sql.versions
      .all(docId)
      .map((row) => readVersion(row.version, row.uploaded === 1));
  }

  async markUploaded(versionId: string): Promise<void> {
    this.write(() => this.sql.uploaded.run(versionId));
  }

  async recovered(docId: string): Promise<RecoveredItem[]> {
    return this.sql.recovered
      .all(docId)
      .map((row) => toRecoveredItem(readRecovered(row.item)));
  }

  async dismissRecovered(itemId: string): Promise<void> {
    this.write(() => this.sql.dismiss.run(itemId));
  }

  async documents(): Promise<DocMeta[]> {
    return this.sql.allMeta.all().map((row) => readMeta(row.meta));
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** One transaction over a document this file holds: `fn` gets its meta and its highest local sequence. */
  private change(
    docId: string,
    fn: (meta: DocMeta, highest: number) => void,
  ): void {
    this.write(() => {
      const row = this.sql.meta.get(docId);
      if (row === null)
        throw new RangeError(`the store holds no document ${docId}`);
      fn(readMeta(row.meta), row.highest);
    });
  }

  private write(fn: () => void): void {
    try {
      this.db.transaction(fn).immediate();
    } catch (error) {
      if (error instanceof RangeError) throw error;
      const full = error instanceof SQLiteError && error.errno === SQLITE_FULL;
      throw new StoreError(full ? "quota" : "write_failed", { cause: error });
    }
  }
}

/** One file per person, never shared with the node's documents. RangeError, the file unchanged, when a newer build wrote it. */
export function openSqliteLocalStore(options: {
  path: string;
  userId: string;
  now: () => number;
}): LocalStore {
  return new SqliteLocalStore(options.userId, openOutboxFile(options.path));
}
