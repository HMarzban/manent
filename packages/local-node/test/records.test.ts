import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecoveredItem } from "@manent/sync-client";
import { createTempTrees } from "@manent/testkit";
import type { Handoff, NodeRecords, Person } from "../src/index.ts";
import { RECORDS_VERSION, openSqliteRecords } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const trees = createTempTrees("manent-records-");
afterAll(() => trees.removeAll());

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "0193b1f4-2c1e-7a00-8000-00000000000b";
const PROJECT = "0193b1f4-2c1e-7a00-8000-0000000000aa";
const KEY = "0193b1f4-2c1e-7a00-8000-00000000000a";
const now = () => 1_700_000_000_000;

// Every draw differs, so a secret made twice never compares equal.
let drawn = 0;
const bytes = (length: number): Uint8Array =>
  new Uint8Array(length).fill(++drawn);

const recordsPath = async (): Promise<string> =>
  join(await trees.tree({}), "records.sqlite");

const H1: Handoff = {
  docId: DOC,
  key: KEY,
  kind: "script",
  home: `project:${PROJECT}`,
  workspaceId: null,
  snapshot: new Uint8Array([1, 2, 3]),
  startedAt: 1_700_000_000_001,
  refused: null,
};

const SAM: Person = {
  userId: "sam",
  name: "Sam Okafor",
  wantsCloud: true,
  cloudToken: null,
  chosenAt: 10,
};
const YOU: Person = {
  userId: "you",
  name: "You",
  wantsCloud: false,
  cloudToken: null,
  chosenAt: 20,
};

const overlap = (id: string, text: string): RecoveredItem => ({
  id,
  docId: DOC,
  blockId: `b-${id}`,
  nearBlockId: null,
  text,
  recoveredAt: 30,
  cause: "overlap",
  mine: {
    type: "block",
    attrs: { type: "action" },
    content: [{ type: "text", text }],
  },
  theirs: null,
  otherClientIds: [7],
});

// The records keep no item id and no wording: an item comes back numbered within its document.
const asKept = (item: RecoveredItem, n: number): RecoveredItem => ({
  ...item,
  id: `${DOC}:${n}`,
  mine: null,
  theirs: null,
  otherClientIds: [],
});

const drivers: [string, () => Promise<NodeRecords>][] = [
  ["sqlite", async () => openSqliteRecords(await recordsPath(), now, bytes)],
  ["memory", async () => createMemoryRecords()],
];

for (const [name, make] of drivers) {
  test(`${name}: a hand-off keeps its first key and snapshot until it is finished`, async () => {
    const r = await make();
    r.setDocState(DOC, "you", "handing_off", 0);
    r.startHandoff(H1);
    r.startHandoff({ ...H1, key: "other", snapshot: new Uint8Array([9]) });
    expect(r.handoff(DOC)).toEqual(H1);
    r.finishHandoff(DOC, 1);
    expect([r.handoff(DOC), r.docState(DOC)]).toEqual([
      null,
      { userId: "you", state: "synced", generation: 1 },
    ]);
    r.close();
  });

  test(`${name}: a refused hand-off keeps its reason and gives the document back to this device`, async () => {
    const r = await make();
    r.setDocState(DOC, "you", "handing_off", 0);
    r.setDocState(DOC2, "you", "synced", 4);
    r.startHandoff(H1);
    r.refuseHandoff(DOC, "exists_elsewhere");
    expect([r.handoff(DOC), r.docState(DOC), r.docsOf("you")]).toEqual([
      { ...H1, refused: "exists_elsewhere" },
      null,
      [{ docId: DOC2, state: "synced" }],
    ]);
    r.removeDoc(DOC2);
    expect(r.docsOf("you")).toEqual([]);
    r.close();
  });

  test(`${name}: a script's workspace is kept until its hand-off starts, which then holds it`, async () => {
    const r = await make();
    r.setWorkspace(DOC, "lamp-room");
    r.setWorkspace(DOC2, "night-shift");
    expect([r.workspaceOf(DOC), r.workspaceOf(DOC2)]).toEqual([
      "lamp-room",
      "night-shift",
    ]);
    r.startHandoff({ ...H1, workspaceId: "lamp-room" });
    expect([
      r.workspaceOf(DOC),
      r.workspaceOf(DOC2),
      r.handoff(DOC)?.workspaceId,
    ]).toEqual([null, "night-shift", "lamp-room"]);
    // a retry keeps the hand-off it finds, and takes nothing more
    r.setWorkspace(DOC, "lamp-room");
    r.startHandoff({ ...H1, key: "other" });
    expect(r.workspaceOf(DOC)).toBe("lamp-room");
    r.close();
  });

  test(`${name}: the secret is made once and kept`, async () => {
    const r = await make();
    const secret = r.secret();
    expect([secret.length, r.secret()]).toEqual([32, secret]);
    r.close();
  });

  test(`${name}: people, the current person and the seed are kept`, async () => {
    const r = await make();
    expect([r.people(), r.person("sam"), r.current(), r.seedId()]).toEqual([
      [],
      null,
      null,
      null,
    ]);
    r.savePerson(YOU);
    r.savePerson(SAM);
    r.savePerson({ ...YOU, wantsCloud: true, cloudToken: "c1", chosenAt: 40 });
    r.setCurrent("sam", "n1");
    r.setCurrent("you", "n2");
    r.setSeedId("seed-1");
    const you = { ...YOU, wantsCloud: true, cloudToken: "c1", chosenAt: 40 };
    expect([r.people(), r.person("you"), r.current(), r.seedId()]).toEqual([
      [SAM, you],
      you,
      { userId: "you", nodeToken: "n2" },
      "seed-1",
    ]);
    r.setSeedId(null);
    expect(r.seedId()).toBeNull();
    r.close();
  });

  test(`${name}: text a follow could not place is kept in order`, async () => {
    const r = await make();
    const first = [overlap("x1", "one"), overlap("x2", "two")];
    const second = { ...overlap("x3", "three"), cause: "merge" as const };
    r.addRecovered(DOC, "sam", first);
    r.addRecovered(DOC, "dana", [second]);
    expect([r.recovered(DOC), r.recovered(DOC2)]).toEqual([
      [asKept(first[0]!, 1), asKept(first[1]!, 2), asKept(second, 3)],
      [],
    ]);
    r.close();
  });
}

test("sqlite: what the records hold outlives the process", async () => {
  const path = await recordsPath();
  const first = openSqliteRecords(path, now, bytes);
  const secret = first.secret();
  first.savePerson(SAM);
  first.setDocState(DOC, "you", "handing_off", 0);
  first.startHandoff({ ...H1, workspaceId: PROJECT });
  first.close();
  const again = openSqliteRecords(path, now, bytes);
  expect([again.secret(), again.people(), again.handoff(DOC)]).toEqual([
    secret,
    [SAM],
    { ...H1, workspaceId: PROJECT },
  ]);
  again.close();
});

const collapse = (sql: string): string => sql.replaceAll(/\s+/g, " ").trim();

test("the records file is pinned", async () => {
  const path = await recordsPath();
  openSqliteRecords(path, now, bytes).close();
  const db = new Database(path, { readonly: true });
  const version = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get();
  const tables = db
    .query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY rowid",
    )
    .all()
    .map((row) => collapse(row.sql));
  db.close();
  expect([version, tables]).toEqual([
    { user_version: 2 },
    [
      "CREATE TABLE secret (id INTEGER PRIMARY KEY CHECK (id = 1), key BLOB NOT NULL) STRICT",
      "CREATE TABLE people (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, wants_cloud INTEGER NOT NULL, cloud_token TEXT, chosen_at INTEGER NOT NULL) STRICT",
      "CREATE TABLE current_person (id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL, node_token TEXT NOT NULL) STRICT",
      "CREATE TABLE docs (doc_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL, generation INTEGER NOT NULL, changed_at INTEGER NOT NULL) STRICT",
      "CREATE TABLE handoffs (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, kind TEXT NOT NULL, home TEXT NOT NULL, workspace_id TEXT, snapshot BLOB NOT NULL, started_at INTEGER NOT NULL, refused TEXT) STRICT",
      "CREATE TABLE cloud (id INTEGER PRIMARY KEY CHECK (id = 1), seed_id TEXT, demo_dismissed INTEGER NOT NULL DEFAULT 0) STRICT",
      "CREATE TABLE recovered (doc_id TEXT NOT NULL, n INTEGER NOT NULL, user_id TEXT NOT NULL, cause TEXT NOT NULL, block_id TEXT, near_block_id TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (doc_id, n)) STRICT",
      "CREATE TABLE workspaces (doc_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL) STRICT",
    ],
  ]);
});

test("a records file from a newer version is refused unchanged", async () => {
  const path = await recordsPath();
  const newer = new Database(path, { create: true });
  newer.run("CREATE TABLE later (v TEXT)");
  newer.run(`PRAGMA user_version = ${RECORDS_VERSION + 1}`);
  newer.close();
  const before = readFileSync(path);
  expect(() => openSqliteRecords(path, now, bytes)).toThrow(RangeError);
  expect(() => openSqliteRecords(path, now, bytes)).toThrow(
    "records from a newer version",
  );
  expect(readFileSync(path)).toEqual(before);
});

test("memory: a step that crashes writes nothing, and a snapshot brings back what was kept", () => {
  const r = createMemoryRecords({ crashOn: "finishHandoff" });
  r.setDocState(DOC, "you", "handing_off", 0);
  r.startHandoff(H1);
  const kept = r.snapshot();
  r.savePerson(SAM);
  expect(() => r.finishHandoff(DOC, 1)).toThrow(Error);
  expect([r.handoff(DOC), r.docState(DOC)]).toEqual([
    H1,
    { userId: "you", state: "handing_off", generation: 0 },
  ]);
  const next = createMemoryRecords();
  next.restore(kept);
  expect([next.handoff(DOC), next.people()]).toEqual([H1, []]);
  expect(() => next.restore({ handoffs: [] })).toThrow(TypeError);
  const starting = createMemoryRecords({ crashOn: "startHandoff" });
  expect(() => starting.startHandoff(H1)).toThrow(Error);
  expect(starting.handoff(DOC)).toBeNull();
});
