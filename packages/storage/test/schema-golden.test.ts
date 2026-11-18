import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { DocFile, Storage } from "../src/index.ts";
import { openSqliteStorage, STORAGE_SCHEMA_VERSION } from "../src/index.ts";
import {
  DOC,
  HOME,
  PROJECT,
  codeOfOpening,
  createTempTrees,
  doc,
  docPath,
  item,
  rawRows,
  checkpointsPath,
  rawSql,
  tableColumns,
  tableNames,
  userVersion,
} from "./raw.ts";

// What is frozen on disk. Changing a literal here means a new migration and a new STORAGE_SCHEMA_VERSION.
const trees = createTempTrees("manent storage-");
const now = () => 1_000;
let dir: string;
let s: Storage;
let f: DocFile;

beforeEach(async () => {
  dir = await trees.tree();
  s = openSqliteStorage({ dir, now });
  f = s.open(HOME);
  f.log.create(doc(DOC));
  // the checkpoints file is opened on first use
  f.checkpoints.newest(DOC, 1);
});
afterEach(() => s.close());
afterAll(() => trees.removeAll());

test("the storage schema is exactly these tables", () => {
  expect(STORAGE_SCHEMA_VERSION).toBe(2);
  expect(userVersion(join(dir, "control.sqlite"))).toBe(2);
  expect(userVersion(join(dir, `project-${PROJECT}.sqlite`))).toBe(2);
  expect(tableColumns(join(dir, "control.sqlite"))).toEqual({
    doc_directory: [
      "doc_id TEXT",
      "home TEXT",
      "kind TEXT",
      "created_by_user_id TEXT",
      "created_at INTEGER",
    ],
    doc_roles: [
      "doc_id TEXT",
      "user_id TEXT",
      "role TEXT",
      "capabilities TEXT",
    ],
    tombstones: [
      "doc_id TEXT",
      "deleted_by_user_id TEXT",
      "deleted_at INTEGER",
    ],
  });
  expect(tableColumns(join(dir, `project-${PROJECT}.sqlite`))).toEqual({
    documents: [
      "id TEXT",
      "kind TEXT",
      "owner_id TEXT",
      "generation INTEGER",
      "head_seq INTEGER",
      "schema_version INTEGER",
      "engine_version INTEGER",
      "locked INTEGER",
      "created_at INTEGER",
      "deleted_at INTEGER",
    ],
    doc_updates: [
      "doc_id TEXT",
      "generation INTEGER",
      "seq INTEGER",
      "update_blob BLOB",
      "crc32 INTEGER",
      "user_id TEXT",
      "origin TEXT",
      "created_at INTEGER",
    ],
    doc_clients: [
      "doc_id TEXT",
      "client_id INTEGER",
      "user_id TEXT",
      "first_seen INTEGER",
      "acked_clock INTEGER",
    ],
    doc_people: [
      "doc_id TEXT",
      "user_id TEXT",
      "color_index INTEGER",
      "first_seen INTEGER",
    ],
    doc_set_requests: [
      "doc_id TEXT",
      "user_id TEXT",
      "device_id TEXT",
      "client_seq INTEGER",
    ],
    doc_versions: [
      "id TEXT",
      "doc_id TEXT",
      "generation INTEGER",
      "seq INTEGER",
      "kind TEXT",
      "name TEXT",
      "created_by TEXT",
      "created_at INTEGER",
      "device_id TEXT",
      "snapshot_ref TEXT",
      "engine_version INTEGER",
      "recipients TEXT",
    ],
    doc_quarantine: [
      "doc_id TEXT",
      "generation INTEGER",
      "seq INTEGER",
      "update_blob BLOB",
      "crc32 INTEGER",
      "user_id TEXT",
      "origin TEXT",
      "created_at INTEGER",
      "quarantined_at INTEGER",
    ],
    doc_healing: [
      "doc_id TEXT",
      "reason TEXT",
      "verified_seq INTEGER",
      "flagged_at INTEGER",
      "pre_heal_version_id TEXT",
    ],
    doc_generations: [
      "doc_id TEXT",
      "generation INTEGER",
      "final_state BLOB",
      "final_seq INTEGER",
      "frozen_at INTEGER",
      "purge_after INTEGER",
      "reason TEXT",
      "next_initial_bytes INTEGER",
      "rebuilt_by_client_id INTEGER",
    ],
    doc_replays: [
      "doc_id TEXT",
      "replay_key TEXT",
      "user_id TEXT",
      "from_generation INTEGER",
      "generation INTEGER",
      "seq INTEGER",
      "result TEXT",
      "created_at INTEGER",
    ],
  });
});

// the on-disk pins stay in one file
test("every kind of file carries the one storage version", () => {
  for (const file of [
    "control.sqlite",
    `project-${PROJECT}.sqlite`,
    `project-${PROJECT}.checkpoints.sqlite`,
  ])
    expect({ file, version: userVersion(join(dir, file)) }).toEqual({
      file,
      version: STORAGE_SCHEMA_VERSION,
    });
  expect(tableNames(checkpointsPath(dir, HOME))).toEqual([
    "doc_checkpoints",
    "doc_measures",
  ]);
  expect(tableColumns(checkpointsPath(dir, HOME)).doc_measures).toEqual([
    "doc_id TEXT",
    "generation INTEGER",
    "seq INTEGER",
    "live_bytes INTEGER",
    "plain_bytes INTEGER",
    "client_ids INTEGER",
    "largest_section INTEGER",
  ]);
});

test("a stored person and setting request are exactly this", () => {
  f.log.registerClients(DOC, "sam", [7]);
  f.log.append({
    ...item(1),
    setRequest: { deviceId: "device-1", clientSeq: 4 },
  });
  expect(rawRows(docPath(dir, HOME), "SELECT * FROM doc_people")).toEqual([
    { doc_id: DOC, user_id: "sam", color_index: 0, first_seen: 1_000 },
  ]);
  expect(rawRows(docPath(dir, HOME), "SELECT * FROM doc_set_requests")).toEqual(
    [{ doc_id: DOC, user_id: "sam", device_id: "device-1", client_seq: 4 }],
  );
});

test("a stored update row is exactly this", () => {
  f.log.registerClients(DOC, "sam", [7]);
  f.log.append({
    docId: DOC,
    generation: 1,
    update: new Uint8Array([1, 2, 3]),
    userId: "sam",
    origin: "edit",
    clocks: [{ clientId: 7, clock: 3 }],
  });
  expect(rawRows(docPath(dir, HOME), "SELECT * FROM doc_updates")).toEqual([
    {
      doc_id: DOC,
      generation: 1,
      seq: 1,
      update_blob: new Uint8Array([1, 2, 3]),
      crc32: 1438416925,
      user_id: "sam",
      origin: "edit",
      created_at: 1_000,
    },
  ]);
  expect(rawRows(docPath(dir, HOME), "SELECT * FROM doc_clients")).toEqual([
    {
      doc_id: DOC,
      client_id: 7,
      user_id: "sam",
      first_seen: 1_000,
      acked_clock: 3,
    },
  ]);
});

test("a file written by a later build is refused, not rewritten", () => {
  s.close();
  rawSql(
    docPath(dir, HOME),
    `PRAGMA user_version = ${STORAGE_SCHEMA_VERSION + 1}`,
  );
  // nothing is migrated downwards
  expect(codeOfOpening(dir)).toBe("corrupt");
});
