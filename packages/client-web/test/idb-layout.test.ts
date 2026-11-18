// What a browser keeps on disk is frozen: these literals change only with a new layout version.
import { expect, test } from "bun:test";
import type { DocMeta, StoredUpdate } from "@manent/sync-client";
import { blankMeta } from "@manent/sync-client/testing";
import { IDBFactory } from "fake-indexeddb";
import {
  LOCAL_STORE_VERSION,
  localDatabaseName,
  openIdbStore,
} from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

const GOLDEN_META: DocMeta = {
  docId: DOC,
  generation: 1,
  lastServerSeq: 40,
  clientIds: [7],
  ackedClocks: { "7": 12 },
  neverSynced: false,
  create: null,
  parked: null,
  recovering: null,
  lastDeviceVersionAt: 0,
  lastSyncedAt: 1_700,
};

function own(n: number): StoredUpdate {
  return {
    kind: "update",
    localSeq: n,
    update: new Uint8Array([n, n + 1, n + 2]),
    own: true,
    acked: false,
    applied: true,
    elements: [`b${n}`],
  };
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

/** Opens with raw IndexedDB calls; `upgrade` lays out a database being created. */
function rawOpen(
  indexedDb: IDBFactory,
  name: string,
  version?: number,
  upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  const request = indexedDb.open(name, version);
  request.addEventListener("upgradeneeded", () => upgrade?.(request.result));
  return settle(request);
}

function describeStores(
  db: IDBDatabase,
): Record<string, { keyPath: unknown; indexes: Record<string, unknown> }> {
  const names = [...db.objectStoreNames];
  const transaction = db.transaction(names, "readonly");
  return Object.fromEntries(
    names.map((name) => {
      const store = transaction.objectStore(name);
      const indexes = [...store.indexNames].map((index) => [
        index,
        store.index(index).keyPath,
      ]);
      return [
        name,
        { keyPath: store.keyPath, indexes: Object.fromEntries(indexes) },
      ];
    }),
  );
}

/** Version 1 as it was first written, built without the code under test. */
async function writeGoldenDatabase(indexedDb: IDBFactory): Promise<void> {
  const db = await rawOpen(indexedDb, "manent:dana", 1, (created) => {
    created.createObjectStore("meta", { keyPath: "docId" });
    created.createObjectStore("entries", { keyPath: ["docId", "localSeq"] });
    created.createObjectStore("checkpoints", { keyPath: "docId" });
    created.createObjectStore("bases", { keyPath: "docId" });
    created
      .createObjectStore("versions", { keyPath: "id" })
      .createIndex("byDoc", "docId");
    created
      .createObjectStore("recovered", { keyPath: "id" })
      .createIndex("byDoc", "docId");
    created.createObjectStore("lease", { keyPath: "name" });
  });
  const transaction = db.transaction(
    ["meta", "entries", "checkpoints", "bases"],
    "readwrite",
  );
  transaction.objectStore("meta").put({ ...GOLDEN_META, highestLocalSeq: 0 });
  transaction.objectStore("entries").put({
    docId: DOC,
    kind: "update",
    localSeq: 2,
    update: new Uint8Array([1, 2, 3]),
    own: true,
    acked: false,
    applied: true,
    elements: ["b000000000000001"],
  });
  transaction.objectStore("entries").put({
    docId: DOC,
    kind: "set",
    localSeq: 3,
    key: "script.paper",
    value: '"a4"',
    acked: false,
  });
  transaction
    .objectStore("checkpoints")
    .put({ docId: DOC, state: new Uint8Array([9]), throughLocalSeq: 1 });
  transaction
    .objectStore("bases")
    .put({ docId: DOC, state: new Uint8Array([8]) });
  await done(transaction);
  db.close();
}

async function putLease(
  indexedDb: IDBFactory,
  name: string,
  lease: { name: string; tabId: string; expiresAt: number },
): Promise<void> {
  const db = await rawOpen(indexedDb, name);
  const transaction = db.transaction(["lease"], "readwrite");
  transaction.objectStore("lease").put(lease);
  await done(transaction);
  db.close();
}

test("LOCAL_STORE_VERSION 1 is exactly these stores, keys and indexes", async () => {
  const indexedDb = new IDBFactory();
  await openIdbStore({ userId: "dana", indexedDb });
  const db = await rawOpen(indexedDb, "manent:dana");
  expect(LOCAL_STORE_VERSION).toBe(1);
  expect(db.version).toBe(1);
  expect(localDatabaseName("dana")).toBe("manent:dana");
  expect(describeStores(db)).toEqual({
    bases: { keyPath: "docId", indexes: {} },
    checkpoints: { keyPath: "docId", indexes: {} },
    entries: { keyPath: ["docId", "localSeq"], indexes: {} },
    lease: { keyPath: "name", indexes: {} },
    meta: { keyPath: "docId", indexes: {} },
    recovered: { keyPath: "id", indexes: { byDoc: "docId" } },
    versions: { keyPath: "id", indexes: { byDoc: "docId" } },
  });
});

test("a store written by this version, record by record, still opens", async () => {
  const indexedDb = new IDBFactory();
  await writeGoldenDatabase(indexedDb);
  const loaded = (await (
    await openIdbStore({ userId: "dana", indexedDb })
  ).load(DOC))!;
  expect(loaded).toEqual({
    meta: GOLDEN_META,
    checkpoint: { state: new Uint8Array([9]), throughLocalSeq: 1 },
    syncedBase: new Uint8Array([8]),
    entries: [
      {
        kind: "update",
        localSeq: 2,
        update: new Uint8Array([1, 2, 3]),
        own: true,
        acked: false,
        applied: true,
        elements: ["b000000000000001"],
      },
      {
        kind: "set",
        localSeq: 3,
        key: "script.paper",
        value: '"a4"',
        acked: false,
      },
    ],
  });
});

test("a refused setting leaves its sequence on the document's meta record", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({ userId: "dana", indexedDb });
  await store.create(blankMeta(DOC));
  await store.refuse(DOC, 4);
  const db = await rawOpen(indexedDb, "manent:dana");
  const meta = db.transaction(["meta"], "readonly").objectStore("meta");
  expect(await settle(meta.get(DOC))).toEqual({
    ...blankMeta(DOC),
    highestLocalSeq: 4,
  });
  expect(await store.documents()).toEqual([blankMeta(DOC)]);
});

test("a tab that lost the lead cannot write", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({
    userId: "dana",
    indexedDb,
    leaseTabId: "t1",
  });
  await putLease(indexedDb, "manent:dana", {
    name: "leader",
    tabId: "t1",
    expiresAt: 9,
  });
  // t1 leads: writes pass
  await store.create(blankMeta(DOC));
  await putLease(indexedDb, "manent:dana", {
    name: "leader",
    tabId: "t2",
    expiresAt: 99,
  });
  await expect(store.append(DOC, own(1))).rejects.toMatchObject({
    code: "lost_lead",
  });
  // nothing was written
  expect(
    (await (await openIdbStore({ userId: "dana", indexedDb })).load(DOC))!
      .entries,
  ).toEqual([]);
});

test("a database from a newer build is refused and left as it is", async () => {
  const indexedDb = new IDBFactory();
  (await rawOpen(indexedDb, "manent:dana", 2)).close();
  await expect(
    openIdbStore({ userId: "dana", indexedDb }),
  ).rejects.toMatchObject({ code: "unavailable" });
  expect((await rawOpen(indexedDb, "manent:dana")).version).toBe(2);
});
