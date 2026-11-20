import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { localStoreContract } from "@manent/sync-client/testing";
import type { DocMeta, StoredUpdate } from "@manent/sync-client";
import { createTempTrees } from "@manent/testkit";
import { SQLITE_STORE_VERSION, openSqliteLocalStore } from "../src/index.ts";

const trees = createTempTrees("manent-outbox-");
afterAll(() => trees.removeAll());

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const now = () => 1_700_000_000_000;

localStoreContract({ test, expect }, async () => {
  const dir = await trees.tree({});
  const opened: { close(): Promise<void> }[] = [];
  return {
    async open(userId) {
      const store = openSqliteLocalStore({
        path: join(dir, `${userId}.sqlite`),
        userId,
        now,
      });
      opened.push(store);
      return store;
    },
    async dispose() {
      await Promise.all(opened.map((store) => store.close()));
      await rm(dir, { recursive: true, force: true });
    },
  };
});

const META: DocMeta = {
  docId: DOC,
  generation: 1,
  lastServerSeq: 0,
  clientIds: [7],
  ackedClocks: {},
  neverSynced: false,
  create: null,
  parked: null,
  recovering: null,
  lastDeviceVersionAt: 0,
  lastSyncedAt: null,
  moving: null,
};

const own = (localSeq: number): StoredUpdate => ({
  kind: "update",
  localSeq,
  update: new Uint8Array([localSeq, 1, 2]),
  own: true,
  acked: false,
  applied: true,
  elements: [`b${localSeq}`],
});

test("what the store said it wrote survives a reopen", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const first = openSqliteLocalStore({ path, userId: "sam", now });
  await first.create(META);
  for (const n of [1, 2, 3]) await first.append(DOC, own(n));
  await first.acknowledge(DOC, 2, { lastServerSeq: 9 });
  await first.close();
  const again = openSqliteLocalStore({ path, userId: "sam", now });
  expect(await again.load(DOC)).toEqual({
    meta: { ...META, lastServerSeq: 9 },
    checkpoint: null,
    syncedBase: null,
    entries: [{ ...own(1), acked: true }, { ...own(2), acked: true }, own(3)],
  });
  await again.close();
});

test("an outbox file from a newer version is refused unchanged", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const db = new Database(path, { create: true });
  db.run(`PRAGMA user_version = ${SQLITE_STORE_VERSION + 1}`);
  db.close();
  const before = readFileSync(path);
  expect(() => openSqliteLocalStore({ path, userId: "sam", now })).toThrow(
    new RangeError("an upstream outbox from a newer version"),
  );
  expect(readFileSync(path)).toEqual(before);
});
