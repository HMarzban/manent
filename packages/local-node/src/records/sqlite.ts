// The node's records in records.sqlite: one statement per question, every change of two rows in one transaction.
import { Database } from "bun:sqlite";
import type { RecoveredItem } from "@manent/sync-client";
import { HANDOFF_REFUSALS } from "@manent/sync-client";
import type { Handoff, NodeDocState, NodeRecords, Person } from "./ports.ts";

/** `PRAGMA user_version` of records.sqlite. */
export const RECORDS_VERSION = 1;

const SECRET_BYTES = 32;

const SCHEMA = [
  `CREATE TABLE secret (id INTEGER PRIMARY KEY CHECK (id = 1), key BLOB NOT NULL) STRICT`,
  `CREATE TABLE people (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, wants_cloud INTEGER NOT NULL,
    cloud_token TEXT, chosen_at INTEGER NOT NULL) STRICT`,
  `CREATE TABLE current_person (id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL, node_token TEXT NOT NULL) STRICT`,
  `CREATE TABLE docs (doc_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL,
    generation INTEGER NOT NULL, changed_at INTEGER NOT NULL) STRICT`,
  `CREATE TABLE handoffs (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, kind TEXT NOT NULL, home TEXT NOT NULL, workspace_id TEXT,
    snapshot BLOB NOT NULL, started_at INTEGER NOT NULL, refused TEXT) STRICT`,
  `CREATE TABLE cloud (id INTEGER PRIMARY KEY CHECK (id = 1), seed_id TEXT) STRICT`,
  `CREATE TABLE recovered (doc_id TEXT NOT NULL, n INTEGER NOT NULL, user_id TEXT NOT NULL, cause TEXT NOT NULL,
    block_id TEXT, near_block_id TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (doc_id, n)) STRICT`,
] as const;

const NODE_DOC_STATES: readonly NodeDocState[] = ["handing_off", "synced"];
const RECOVERED_CAUSES: readonly RecoveredItem["cause"][] = [
  "merge",
  "rejected",
  "overlap",
];

interface PersonRow {
  user_id: string;
  name: string;
  wants_cloud: number;
  cloud_token: string | null;
  chosen_at: number;
}

interface HandoffRow {
  doc_id: string;
  key: string;
  kind: string;
  home: string;
  workspace_id: string | null;
  snapshot: Uint8Array;
  started_at: number;
  refused: string | null;
}

interface RecoveredRow {
  doc_id: string;
  n: number;
  cause: string;
  block_id: string | null;
  near_block_id: string | null;
  text: string;
  at: number;
}

/** A stored string that must be one of `values`; TypeError for a file this driver did not write. */
function readOneOf<T extends string>(values: readonly T[], value: string): T {
  const found = values.find((v) => v === value);
  if (found === undefined)
    throw new TypeError(`records hold an unknown value ${value}`);
  return found;
}

const toPerson = (row: PersonRow): Person => ({
  userId: row.user_id,
  name: row.name,
  wantsCloud: row.wants_cloud === 1,
  cloudToken: row.cloud_token,
  chosenAt: row.chosen_at,
});

const toHandoff = (row: HandoffRow): Handoff => ({
  docId: row.doc_id,
  key: row.key,
  kind: row.kind,
  home: row.home,
  workspaceId: row.workspace_id,
  snapshot: new Uint8Array(row.snapshot),
  startedAt: row.started_at,
  refused:
    row.refused === null ? null : readOneOf(HANDOFF_REFUSALS, row.refused),
});

/** The records keep no item id and no wording: an item is numbered `<docId>:<n>` within its document. */
const toRecovered = (row: RecoveredRow): RecoveredItem => ({
  id: `${row.doc_id}:${row.n}`,
  docId: row.doc_id,
  blockId: row.block_id,
  nearBlockId: row.near_block_id,
  text: row.text,
  recoveredAt: row.at,
  cause: readOneOf(RECOVERED_CAUSES, row.cause),
  mine: null,
  theirs: null,
  otherClientIds: [],
});

/** The connection settings of every store file; a file from a newer version is closed untouched first. */
function openRecordsFile(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  const version =
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version ?? 0;
  if (version > RECORDS_VERSION) {
    db.close();
    throw new RangeError("records from a newer version");
  }
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = FULL");
  if (process.platform === "darwin") db.run("PRAGMA fullfsync = 1");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  if (version < RECORDS_VERSION)
    db.transaction(() => {
      for (const statement of SCHEMA) db.run(statement);
      db.run(`PRAGMA user_version = ${RECORDS_VERSION}`);
    }).immediate();
  return db;
}

/** Every statement the records run, prepared once per connection. */
function prepare(db: Database) {
  return {
    secret: db.query<{ key: Uint8Array }, []>(
      "SELECT key FROM secret WHERE id = 1",
    ),
    makeSecret: db.query<never, [Uint8Array]>(
      "INSERT INTO secret (id, key) VALUES (1, ?1) ON CONFLICT (id) DO NOTHING",
    ),
    person: db.query<PersonRow, [string]>(
      "SELECT * FROM people WHERE user_id = ?1",
    ),
    people: db.query<PersonRow, []>("SELECT * FROM people ORDER BY user_id"),
    savePerson: db.query<
      never,
      [string, string, number, string | null, number]
    >(
      `INSERT INTO people (user_id, name, wants_cloud, cloud_token, chosen_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, wants_cloud = excluded.wants_cloud,
       cloud_token = excluded.cloud_token, chosen_at = excluded.chosen_at`,
    ),
    current: db.query<{ userId: string; nodeToken: string }, []>(
      "SELECT user_id AS userId, node_token AS nodeToken FROM current_person WHERE id = 1",
    ),
    setCurrent: db.query<never, [string, string]>(
      `INSERT INTO current_person (id, user_id, node_token) VALUES (1, ?1, ?2)
       ON CONFLICT (id) DO UPDATE SET user_id = excluded.user_id, node_token = excluded.node_token`,
    ),
    docState: db.query<
      { userId: string; state: string; generation: number },
      [string]
    >(
      "SELECT user_id AS userId, state, generation FROM docs WHERE doc_id = ?1",
    ),
    setDocState: db.query<never, [string, string, string, number, number]>(
      `INSERT INTO docs (doc_id, user_id, state, generation, changed_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (doc_id) DO UPDATE SET user_id = excluded.user_id, state = excluded.state,
       generation = excluded.generation, changed_at = excluded.changed_at`,
    ),
    synced: db.query<never, [string, number, number]>(
      "UPDATE docs SET state = 'synced', generation = ?2, changed_at = ?3 WHERE doc_id = ?1",
    ),
    removeDoc: db.query<never, [string]>("DELETE FROM docs WHERE doc_id = ?1"),
    docsOf: db.query<{ docId: string; state: string }, [string]>(
      "SELECT doc_id AS docId, state FROM docs WHERE user_id = ?1 ORDER BY doc_id",
    ),
    lastRecovered: db.query<{ n: number | null }, [string]>(
      "SELECT max(n) AS n FROM recovered WHERE doc_id = ?1",
    ),
    addRecovered: db.query<
      never,
      [
        string,
        number,
        string,
        string,
        string | null,
        string | null,
        string,
        number,
      ]
    >(
      `INSERT INTO recovered (doc_id, n, user_id, cause, block_id, near_block_id, text, at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ),
    recovered: db.query<RecoveredRow, [string]>(
      "SELECT doc_id, n, cause, block_id, near_block_id, text, at FROM recovered WHERE doc_id = ?1 ORDER BY n",
    ),
    handoff: db.query<HandoffRow, [string]>(
      "SELECT * FROM handoffs WHERE doc_id = ?1",
    ),
    startHandoff: db.query<
      never,
      [
        string,
        string,
        string,
        string,
        string | null,
        Uint8Array,
        number,
        string | null,
      ]
    >(
      `INSERT INTO handoffs (doc_id, key, kind, home, workspace_id, snapshot, started_at, refused)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (doc_id) DO NOTHING`,
    ),
    refuseHandoff: db.query<never, [string, string]>(
      "UPDATE handoffs SET refused = ?2 WHERE doc_id = ?1",
    ),
    removeHandoff: db.query<never, [string]>(
      "DELETE FROM handoffs WHERE doc_id = ?1",
    ),
    seedId: db.query<{ seedId: string | null }, []>(
      "SELECT seed_id AS seedId FROM cloud WHERE id = 1",
    ),
    setSeedId: db.query<never, [string | null]>(
      "INSERT INTO cloud (id, seed_id) VALUES (1, ?1) ON CONFLICT (id) DO UPDATE SET seed_id = excluded.seed_id",
    ),
  };
}

type Statements = ReturnType<typeof prepare>;

function peopleRecords(
  sql: Statements,
  random: (length: number) => Uint8Array,
): Pick<
  NodeRecords,
  | "secret"
  | "person"
  | "savePerson"
  | "people"
  | "current"
  | "setCurrent"
  | "seedId"
  | "setSeedId"
> {
  return {
    secret() {
      const kept = sql.secret.get();
      if (kept !== null) return new Uint8Array(kept.key);
      sql.makeSecret.run(random(SECRET_BYTES));
      return new Uint8Array(sql.secret.get()!.key);
    },
    person(userId) {
      const row = sql.person.get(userId);
      return row === null ? null : toPerson(row);
    },
    savePerson(person) {
      sql.savePerson.run(
        person.userId,
        person.name,
        person.wantsCloud ? 1 : 0,
        person.cloudToken,
        person.chosenAt,
      );
    },
    people: () => sql.people.all().map(toPerson),
    current: () => sql.current.get(),
    setCurrent(userId, nodeToken) {
      sql.setCurrent.run(userId, nodeToken);
    },
    seedId: () => sql.seedId.get()?.seedId ?? null,
    setSeedId(seedId) {
      sql.setSeedId.run(seedId);
    },
  };
}

function docRecords(
  sql: Statements,
  now: () => number,
  inOne: (fn: () => void) => void,
): Pick<
  NodeRecords,
  | "docState"
  | "setDocState"
  | "removeDoc"
  | "docsOf"
  | "addRecovered"
  | "recovered"
> {
  return {
    docState(docId) {
      const row = sql.docState.get(docId);
      if (row === null) return null;
      return { ...row, state: readOneOf(NODE_DOC_STATES, row.state) };
    },
    setDocState(docId, userId, state, generation) {
      sql.setDocState.run(docId, userId, state, generation, now());
    },
    removeDoc(docId) {
      sql.removeDoc.run(docId);
    },
    docsOf: (userId) =>
      sql.docsOf.all(userId).map((row) => ({
        docId: row.docId,
        state: readOneOf(NODE_DOC_STATES, row.state),
      })),
    addRecovered(docId, userId, items) {
      inOne(() => {
        let n = sql.lastRecovered.get(docId)?.n ?? 0;
        for (const item of items)
          sql.addRecovered.run(
            docId,
            ++n,
            userId,
            item.cause,
            item.blockId,
            item.nearBlockId,
            item.text,
            item.recoveredAt,
          );
      });
    },
    recovered: (docId) => sql.recovered.all(docId).map(toRecovered),
  };
}

function handoffRecords(
  sql: Statements,
  now: () => number,
  inOne: (fn: () => void) => void,
): Pick<
  NodeRecords,
  "handoff" | "startHandoff" | "refuseHandoff" | "finishHandoff"
> {
  return {
    handoff(docId) {
      const row = sql.handoff.get(docId);
      return row === null ? null : toHandoff(row);
    },
    startHandoff(handoff) {
      sql.startHandoff.run(
        handoff.docId,
        handoff.key,
        handoff.kind,
        handoff.home,
        handoff.workspaceId,
        handoff.snapshot,
        handoff.startedAt,
        handoff.refused,
      );
    },
    refuseHandoff(docId, reason) {
      inOne(() => {
        sql.refuseHandoff.run(docId, reason);
        sql.removeDoc.run(docId);
      });
    },
    finishHandoff(docId, generation) {
      inOne(() => {
        sql.removeHandoff.run(docId);
        sql.synced.run(docId, generation, now());
      });
    },
  };
}

/**
 * The records at `path`, created when missing. `now` stamps a document's state change; `random` makes the
 * secret, once. RangeError("records from a newer version") for a file a later build wrote, which is left unchanged.
 */
export function openSqliteRecords(
  path: string,
  now: () => number,
  random: (length: number) => Uint8Array,
): NodeRecords {
  const db = openRecordsFile(path);
  const sql = prepare(db);
  const inOne = (fn: () => void): void => db.transaction(fn).immediate();
  return {
    ...peopleRecords(sql, random),
    ...docRecords(sql, now, inOne),
    ...handoffRecords(sql, now, inOne),
    close: () => db.close(),
  };
}
