// One home's document file: its log and versions over one connection, and its checkpoints.
import type { Database } from "bun:sqlite";
import { crc32, sha256 } from "../checksum.ts";
import type {
  AppendItem,
  Checkpoints,
  DocFile,
  DocLog,
  DocumentRow,
  HealingRow,
  Home,
  UpdateOrigin,
  UpdateRow,
  VersionKind,
  VersionRow,
  Versions,
} from "../ports.ts";
import { CHECKPOINTS_KEPT, COLOR_COUNT, StorageError } from "../ports.ts";
import { docFilePath, migrate, openDatabase, transact } from "./files.ts";

/** A document file the storage closes when it closes. */
export interface SqliteDocFile extends DocFile {
  close(): void;
}

// The closed sets a stored name is checked against; a member added to a union fails typecheck here.
const ORIGINS = {
  edit: true,
  restore: true,
  import: true,
  replay: true,
  heal: true,
  system: true,
} satisfies Record<UpdateOrigin, true>;
const REASONS = {
  quarantine: true,
  behind: true,
  restore: true,
} satisfies Record<HealingRow["reason"], true>;
const VERSION_KINDS = {
  auto: true,
  saved: true,
  named: true,
  sent: true,
  export: true,
  device: true,
  pre_restore: true,
  pre_merge: true,
  pre_heal: true,
  recovered: true,
  revision_baseline: true,
  revision_issue: true,
} satisfies Record<VersionKind, true>;

const isIn = <T extends string>(
  table: Record<T, true>,
  value: string,
): value is T => Object.hasOwn(table, value);

/** A stored name outside its closed set is damage, never a value. */
function member<T extends string>(table: Record<T, true>, value: string): T {
  if (isIn(table, value)) return value;
  throw new StorageError("corrupt");
}

const DOCUMENT = `SELECT id, kind, owner_id AS ownerUserId, generation, head_seq AS headSeq, schema_version AS schemaVersion,
  engine_version AS engineVersion, locked, created_at AS createdAt, deleted_at AS deletedAt FROM documents WHERE id = ?1`;

interface StoredUpdate {
  seq: number;
  update: Uint8Array;
  crc: number;
  userId: string;
  origin: string;
  createdAt: number;
}

function prepareLog(db: Database) {
  return {
    document: db.query<DocumentRow, [string]>(DOCUMENT),
    create: db.query<
      never,
      [string, string, string | null, number, number | null, number]
    >(
      "INSERT INTO documents (id, kind, owner_id, schema_version, engine_version, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (id) DO NOTHING",
    ),
    append: db.query<
      never,
      [string, number, number, Uint8Array, number, string, string, number]
    >(
      "INSERT INTO doc_updates (doc_id, generation, seq, update_blob, crc32, user_id, origin, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    ),
    head: db.query<never, [string, number]>(
      "UPDATE documents SET head_seq = ?2 WHERE id = ?1",
    ),
    raiseSchema: db.query<never, [string, number]>(
      "UPDATE documents SET schema_version = ?2 WHERE id = ?1 AND schema_version < ?2",
    ),
    tail: db.query<StoredUpdate, [string, number, number]>(
      'SELECT seq, update_blob AS "update", crc32 AS crc, user_id AS userId, origin, created_at AS createdAt FROM doc_updates WHERE doc_id = ?1 AND generation = ?2 AND seq > ?3 ORDER BY seq',
    ),
    quarantine: db.query<never, [string, number, number, number]>(
      `INSERT INTO doc_quarantine (doc_id, generation, seq, update_blob, crc32, user_id, origin, created_at, quarantined_at)
       SELECT doc_id, generation, seq, update_blob, crc32, user_id, origin, created_at, ?4 FROM doc_updates
       WHERE doc_id = ?1 AND generation = ?2 AND seq = ?3`,
    ),
    drop: db.query<never, [string, number, number]>(
      "DELETE FROM doc_updates WHERE doc_id = ?1 AND generation = ?2 AND seq = ?3",
    ),
  };
}

function prepareLedger(db: Database) {
  return {
    owner: db.query<{ userId: string }, [string, number]>(
      "SELECT user_id AS userId FROM doc_clients WHERE doc_id = ?1 AND client_id = ?2",
    ),
    register: db.query<never, [string, string, number, number, number]>(
      "INSERT INTO doc_clients (doc_id, user_id, client_id, first_seen, acked_clock) VALUES (?1, ?2, ?3, ?4, ?5)",
    ),
    person: db.query<never, [string, string, number]>(
      `INSERT INTO doc_people (doc_id, user_id, color_index, first_seen)
       VALUES (?1, ?2, (SELECT count(*) FROM doc_people WHERE doc_id = ?1) % ${COLOR_COUNT}, ?3) ON CONFLICT (doc_id, user_id) DO NOTHING`,
    ),
    acknowledge: db.query<never, [string, number, number]>(
      "UPDATE doc_clients SET acked_clock = max(acked_clock, ?3) WHERE doc_id = ?1 AND client_id = ?2",
    ),
    ledger: db.query<
      { clientId: number; userId: string; ackedClock: number },
      [string]
    >(
      "SELECT client_id AS clientId, user_id AS userId, acked_clock AS ackedClock FROM doc_clients WHERE doc_id = ?1",
    ),
    colors: db.query<{ userId: string; colorIndex: number }, [string]>(
      "SELECT user_id AS userId, color_index AS colorIndex FROM doc_people WHERE doc_id = ?1 ORDER BY first_seen, color_index",
    ),
    setRequest: db.query<never, [string, string, string, number]>(
      `INSERT INTO doc_set_requests (doc_id, user_id, device_id, client_seq) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (doc_id, user_id, device_id) DO UPDATE SET client_seq = max(client_seq, excluded.client_seq)`,
    ),
    lastSetRequest: db.query<{ clientSeq: number }, [string, string, string]>(
      "SELECT client_seq AS clientSeq FROM doc_set_requests WHERE doc_id = ?1 AND user_id = ?2 AND device_id = ?3",
    ),
    healing: db.query<
      Omit<HealingRow, "reason"> & { reason: string },
      [string]
    >(
      "SELECT reason, verified_seq AS verifiedSeq, flagged_at AS flaggedAt, pre_heal_version_id AS preHealVersionId FROM doc_healing WHERE doc_id = ?1",
    ),
    flag: db.query<never, [string, string, number, number]>(
      `INSERT INTO doc_healing (doc_id, reason, verified_seq, flagged_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (doc_id) DO UPDATE SET verified_seq = min(verified_seq, excluded.verified_seq)`,
    ),
    notePreHeal: db.query<never, [string, string]>(
      "UPDATE doc_healing SET pre_heal_version_id = ?2 WHERE doc_id = ?1",
    ),
  };
}

type Statements = ReturnType<typeof prepareLog> &
  ReturnType<typeof prepareLedger>;

// A client id nobody holds is registered to `userId`, who gets a colour with their first one; returns its holder.
function register(
  sql: Statements,
  at: number,
  entry: { docId: string; userId: string; clientId: number },
): string {
  const { docId, userId, clientId } = entry;
  const owner = sql.owner.get(docId, clientId)?.userId ?? null;
  if (owner !== null) return owner;
  sql.register.run(docId, userId, clientId, at, 0);
  sql.person.run(docId, userId, at);
  return userId;
}

// Runs inside the caller's transaction.
function appendRow(sql: Statements, item: AppendItem, at: number): number {
  const { docId, generation, update, userId, origin, setRequest } = item;
  const row = sql.document.get(docId);
  if (row?.generation !== generation)
    throw new RangeError(`no document ${docId} at generation ${generation}`);
  const seq = row.headSeq + 1;
  const crc = crc32(update);
  sql.append.run(docId, generation, seq, update, crc, userId, origin, at);
  sql.head.run(docId, seq);
  for (const { clientId, clock } of item.clocks) {
    register(sql, at, { docId, userId, clientId });
    sql.acknowledge.run(docId, clientId, clock);
  }
  if (setRequest !== undefined) {
    const { deviceId, clientSeq } = setRequest;
    sql.setRequest.run(docId, userId, deviceId, clientSeq);
  }
  return seq;
}

// A row whose checksum fails, or whose origin is not one, is corrupt.
function readTail(
  sql: Statements,
  where: [docId: string, generation: number, afterSeq: number],
) {
  const rows: UpdateRow[] = [];
  const corrupt: number[] = [];
  for (const { crc, origin, ...row } of sql.tail.all(...where)) {
    if (crc32(row.update) === crc && isIn(ORIGINS, origin))
      rows.push({ ...row, origin });
    else corrupt.push(row.seq);
  }
  return { rows, corrupt };
}

function createLog(db: Database, sql: Statements, now: () => number): DocLog {
  const log: DocLog = {
    create(doc) {
      const { id, kind, ownerUserId, schemaVersion, engineVersion } = doc;
      return transact(db, () => {
        sql.create.run(
          id,
          kind,
          ownerUserId,
          schemaVersion,
          engineVersion,
          now(),
        );
        const row = sql.document.get(id);
        if (row === null) throw new StorageError("commit_failed");
        return row;
      });
    },
    get: (docId) => sql.document.get(docId),
    append: (item) => transact(db, () => appendRow(sql, item, now())),
    raiseSchema: (docId, toVersion) =>
      transact(db, () => sql.raiseSchema.run(docId, toVersion)),
    tail(docId, generation, afterSeq, options) {
      const tail = readTail(sql, [docId, generation, afterSeq]);
      if (tail.corrupt.length > 0 && options?.quarantine !== false)
        transact(db, () => {
          for (const seq of tail.corrupt) {
            sql.quarantine.run(docId, generation, seq, now());
            sql.drop.run(docId, generation, seq);
            log.flagHealing(docId, "quarantine", seq - 1);
          }
        });
      return tail;
    },
    registerClients: (docId, userId, clientIds) =>
      transact(db, () => {
        const taken: number[] = [];
        for (const clientId of clientIds)
          if (register(sql, now(), { docId, userId, clientId }) !== userId)
            taken.push(clientId);
        return taken;
      }),
    ledger: (docId) =>
      new Map(sql.ledger.all(docId).map(({ clientId, ...e }) => [clientId, e])),
    colors: (docId) =>
      new Map(sql.colors.all(docId).map((p) => [p.userId, p.colorIndex])),
    lastSetRequest: (docId, userId, deviceId) =>
      sql.lastSetRequest.get(docId, userId, deviceId)?.clientSeq ?? 0,
    healing(docId) {
      const row = sql.healing.get(docId);
      if (row === null) return null;
      return { ...row, reason: member(REASONS, row.reason) };
    },
    flagHealing: (docId, reason, verifiedSeq) =>
      transact(db, () => sql.flag.run(docId, reason, verifiedSeq, now())),
    notePreHeal: (docId, versionId) =>
      transact(db, () => sql.notePreHeal.run(docId, versionId)),
  };
  return log;
}

function createVersions(db: Database): Versions {
  const add = db.query<
    never,
    [
      string,
      string,
      number | null,
      number | null,
      string,
      string | null,
      string,
      number,
      string | null,
    ]
  >(
    "INSERT INTO doc_versions (id, doc_id, generation, seq, kind, name, created_by, created_at, device_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
  );
  const list = db.query<Omit<VersionRow, "kind"> & { kind: string }, [string]>(
    `SELECT id, doc_id AS docId, generation, seq, kind, name, created_by AS createdByUserId, created_at AS createdAt,
     device_id AS deviceId FROM doc_versions WHERE doc_id = ?1 ORDER BY created_at DESC, rowid DESC`,
  );
  return {
    add(v) {
      transact(db, () =>
        add.run(
          v.id,
          v.docId,
          v.generation,
          v.seq,
          v.kind,
          v.name,
          v.createdByUserId,
          v.createdAt,
          v.deviceId,
        ),
      );
    },
    list: (docId) =>
      list
        .all(docId)
        .map((row) => ({ ...row, kind: member(VERSION_KINDS, row.kind) })),
  };
}

const key = (docId: string, generation: number) =>
  JSON.stringify([docId, generation]);

// Held in memory until checkpoints get a file of their own: a reopen loses them.
function createCheckpoints(): Checkpoints {
  const kept = new Map<
    string,
    { seq: number; state: Uint8Array; sha: string }[]
  >();
  return {
    put(docId, generation, seq, state) {
      const rest = (kept.get(key(docId, generation)) ?? []).filter(
        (c) => c.seq !== seq,
      );
      const added = {
        seq,
        state: new Uint8Array(state),
        sha: sha256(state).toHex(),
      };
      kept.set(
        key(docId, generation),
        [added, ...rest]
          .toSorted((a, b) => b.seq - a.seq)
          .slice(0, CHECKPOINTS_KEPT),
      );
    },
    newest(docId, generation) {
      const stored = kept.get(key(docId, generation)) ?? [];
      const index = stored.findIndex((c) => sha256(c.state).toHex() === c.sha);
      kept.set(key(docId, generation), index < 0 ? [] : stored.slice(index));
      const found = stored[index];
      return found === undefined
        ? null
        : { seq: found.seq, state: new Uint8Array(found.state) };
    },
  };
}

/** Opens and migrates the home's file. RangeError for a home that is not well formed; StorageError("corrupt") for a file it cannot use. */
export function openDocFile(options: {
  dir: string;
  home: Home;
  now: () => number;
}): SqliteDocFile {
  const db = openDatabase(docFilePath(options.dir, options.home));
  try {
    migrate(db, "documents");
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    home: { ...options.home },
    log: createLog(
      db,
      { ...prepareLog(db), ...prepareLedger(db) },
      options.now,
    ),
    versions: createVersions(db),
    checkpoints: createCheckpoints(),
    transaction: (fn) => transact(db, fn),
    close: () => db.close(),
  };
}
