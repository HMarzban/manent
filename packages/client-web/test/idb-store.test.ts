import { expect, test } from "bun:test";
import type { StoredSetting, StoredUpdate } from "@manent/sync-client";
import { blankMeta, localStoreContract } from "@manent/sync-client/testing";
import { IDBFactory } from "fake-indexeddb";
import { openIdbStore } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

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

/** Calls each method of `target` with `target` as `this`, and passes every other read through. */
function forwarding<T extends object>(
  target: T,
  get: (key: string | symbol) => unknown,
): T {
  return new Proxy(target, {
    get(real, key) {
      const replaced = get(key);
      if (replaced !== undefined) return replaced;
      const value: unknown = Reflect.get(real, key, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    set: (real, key, value) => Reflect.set(real, key, value, real),
  });
}

type TransactionArgs = [
  stores: string | string[],
  mode: IDBTransactionMode | undefined,
  options: IDBTransactionOptions | undefined,
];

/** A fake-indexeddb factory whose databases hand every new transaction to `wrap`. */
function wrappedFactory(
  wrap: (
    transaction: IDBTransaction,
    ...args: TransactionArgs
  ) => IDBTransaction,
): IDBFactory {
  const real = new IDBFactory();
  return forwarding(real, (key) => {
    if (key !== "open") return undefined;
    return (name: string, version?: number) => {
      const request = real.open(name, version);
      return forwarding(request, (requestKey) => {
        if (requestKey !== "result") return undefined;
        const db = request.result;
        return forwarding(db, (dbKey) =>
          dbKey === "transaction"
            ? (...args: TransactionArgs) =>
                wrap(db.transaction(...args), ...args)
            : undefined,
        );
      });
    };
  });
}

/** Readwrite transactions abort with an error of that name as soon as their first request succeeds. */
function abortingFactory(errorName: string): IDBFactory {
  return wrappedFactory((transaction, _stores, mode) => {
    if (mode !== "readwrite") return transaction;
    let error: DOMException | null = null;
    const abortAfter = (request: IDBRequest): IDBRequest => {
      request.addEventListener("success", () => {
        error = new DOMException("the disk said no", errorName);
        transaction.abort();
      });
      return request;
    };
    return forwarding(transaction, (key) => {
      if (key === "error") return error ?? undefined;
      if (key !== "objectStore") return undefined;
      return (name: string) => {
        const store = transaction.objectStore(name);
        return forwarding(store, (storeKey) =>
          storeKey === "put" || storeKey === "get" || storeKey === "delete"
            ? (...args: unknown[]) =>
                abortAfter(Reflect.apply(store[storeKey], store, args))
            : undefined,
        );
      };
    });
  });
}

/** Records the store names, mode and options of every transaction. */
function recordingFactory(seen: unknown[]): IDBFactory {
  return wrappedFactory((transaction, stores, mode, options) => {
    seen.push({ stores, mode, options });
    return transaction;
  });
}

/** An open request that fails, as a private window's does. */
function failingOpen() {
  return {
    error: new DOMException("no storage here", "InvalidStateError"),
    addEventListener(type: string, listener: () => void) {
      if (type === "error") queueMicrotask(listener);
    },
  };
}

function failingFactory(): IDBFactory {
  return { open: failingOpen } as unknown as IDBFactory;
}

localStoreContract({ test, expect }, async () => {
  const indexedDb = new IDBFactory();
  return {
    open: (userId) => openIdbStore({ userId, indexedDb }),
    dispose: async () => {},
  };
});

test("two people on one origin never see each other's documents", async () => {
  const indexedDb = new IDBFactory();
  const dana = await openIdbStore({ userId: "dana", indexedDb });
  const sam = await openIdbStore({ userId: "sam", indexedDb });
  await dana.create(blankMeta(DOC));
  await dana.append(DOC, own(1));
  expect(await sam.load(DOC)).toBeNull();
  expect(await sam.documents()).toEqual([]);
  expect((await indexedDb.databases()).map((d) => d.name).toSorted()).toEqual([
    "manent:dana",
    "manent:sam",
  ]);
});

test("a quota abort is seen, not swallowed", async () => {
  const store = await openIdbStore({
    userId: "dana",
    indexedDb: abortingFactory("QuotaExceededError"),
  });
  await expect(store.append(DOC, own(1))).rejects.toMatchObject({
    name: "StoreError",
    code: "quota",
  });
});

test("any other abort is a refused write", async () => {
  const store = await openIdbStore({
    userId: "dana",
    indexedDb: abortingFactory("UnknownError"),
  });
  await expect(store.append(DOC, own(1))).rejects.toMatchObject({
    name: "StoreError",
    code: "write_failed",
  });
});

test("outbox writes ask for strict durability and resolve on completion", async () => {
  const seen: unknown[] = [];
  const store = await openIdbStore({
    userId: "dana",
    indexedDb: recordingFactory(seen),
  });
  await store.create(blankMeta(DOC));
  await store.append(DOC, own(1));
  expect(
    seen
      .filter((t) => (t as { mode: string }).mode === "readwrite")
      .every(
        (t) =>
          (t as { options: { durability: string } }).options.durability ===
          "strict",
      ),
  ).toBe(true);
  expect(seen).toEqual([
    { stores: ["meta"], mode: "readwrite", options: { durability: "strict" } },
    {
      stores: ["meta", "entries"],
      mode: "readwrite",
      options: { durability: "strict" },
    },
  ]);
  expect((await store.load(DOC))!.entries).toEqual([own(1)]);
});

test("metadata, remote and checkpoint writes use relaxed durability and summaries never read blobs", async () => {
  const seen: {
    stores: string | string[];
    mode?: string;
    options?: { durability?: string };
  }[] = [];
  const store = await openIdbStore({
    userId: "dana",
    indexedDb: recordingFactory(seen),
  });
  await store.create(blankMeta(DOC));
  await store.append(DOC, own(1));
  await store.append(DOC, {
    kind: "update",
    localSeq: 2,
    update: new Uint8Array([4, 5]),
    own: false,
    acked: true,
    applied: false,
    elements: [],
  });
  await store.markApplied(DOC, 2, []);
  await store.patchMeta(DOC, { generation: 1 });
  await store.checkpoint(DOC, new Uint8Array([9, 9]), 2, true);
  seen.length = 0;
  expect(await store.summaries?.()).toEqual([
    { docId: DOC, neverSynced: true, waiting: 1, parked: null, recovered: 0 },
  ]);
  expect(
    seen.every((t) => {
      const list = Array.isArray(t.stores) ? t.stores : [t.stores];
      return !list.includes("checkpoints") && !list.includes("bases");
    }),
  ).toBe(true);
  seen.length = 0;
  await store.acknowledge(DOC, 1, { neverSynced: false });
  await store.patchMeta(DOC, { lastServerSeq: 5 });
  await store.checkpoint(DOC, new Uint8Array([8]), 2, true);
  expect(seen.every((t) => t.options?.durability === "relaxed")).toBe(true);
  seen.length = 0;
  await store.markApplied(DOC, 2, [
    {
      id: "rec-1",
      docId: DOC,
      blockId: "b1",
      nearBlockId: null,
      text: "recovered line",
      recoveredAt: 10,
      cause: "merge",
      mine: null,
      theirs: null,
      otherClientIds: [],
    },
  ]);
  expect(seen.map((t) => t.options?.durability)).toEqual(["strict"]);
  expect(await store.summaries?.()).toEqual([
    { docId: DOC, neverSynced: false, waiting: 0, parked: null, recovered: 1 },
  ]);
});

test("a store that cannot be opened is its own outcome", async () => {
  await expect(
    openIdbStore({ userId: "dana", indexedDb: failingFactory() }),
  ).rejects.toMatchObject({ name: "StoreError", code: "unavailable" });
});

test("a reset never issues again the sequence of a refused setting", async () => {
  const store = await openIdbStore({
    userId: "dana",
    indexedDb: new IDBFactory(),
  });
  const paper: StoredSetting = {
    kind: "set",
    localSeq: 2,
    key: "script.paper",
    value: '"a4"',
    acked: false,
  };
  await store.create(blankMeta(DOC));
  await store.append(DOC, own(1));
  await store.append(DOC, paper);
  await store.refuse(DOC, 2);
  await store.reset(DOC, new Uint8Array([5]), blankMeta(DOC));
  expect(await store.load(DOC)).toEqual({
    meta: blankMeta(DOC),
    checkpoint: { state: new Uint8Array([5]), throughLocalSeq: 2 },
    syncedBase: new Uint8Array([5]),
    entries: [],
  });
});

/** Puts a record as an earlier build wrote it, with raw IndexedDB calls. */
async function putOlder(
  indexedDb: IDBFactory,
  store: "meta" | "recovered" | "versions",
  record: Record<string, unknown>,
): Promise<void> {
  const opening = indexedDb.open("manent:dana");
  const db = await new Promise<IDBDatabase>((resolve) =>
    opening.addEventListener("success", () => resolve(opening.result)),
  );
  const tx = db.transaction([store], "readwrite");
  tx.objectStore(store).put(record);
  await new Promise((resolve) => tx.addEventListener("complete", resolve));
  db.close();
}

test("a document stored before moves existed reads as not moving", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({ userId: "dana", indexedDb });
  const { moving: _moving, ...older } = blankMeta(DOC);
  await putOlder(indexedDb, "meta", {
    ...older,
    recovering: { versionId: "v1", heal: true },
    highestLocalSeq: 0,
  });
  const meta = {
    ...blankMeta(DOC),
    recovering: { versionId: "v1", heal: true, replaying: false },
  };
  expect((await store.load(DOC))!.meta).toEqual(meta);
  expect(await store.documents()).toEqual([meta]);
});

test("a document stored before creates named a workspace reads as having none", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({ userId: "dana", indexedDb });
  await putOlder(indexedDb, "meta", {
    ...blankMeta(DOC),
    create: { kind: "script", home: "user" },
    highestLocalSeq: 0,
  });
  const meta = {
    ...blankMeta(DOC),
    create: { kind: "script", home: "user", workspaceId: null },
  };
  expect((await store.load(DOC))!.meta).toEqual(meta);
  expect(await store.documents()).toEqual([meta]);
});

test("a recovered item stored before overlaps carried wordings reads with none", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({ userId: "dana", indexedDb });
  const older = {
    id: "item-1",
    docId: DOC,
    blockId: "b1",
    nearBlockId: null,
    text: "kept",
    recoveredAt: 5,
    cause: "merge" as const,
  };
  await putOlder(indexedDb, "recovered", older);
  expect(await store.recovered(DOC)).toEqual([
    { ...older, mine: null, theirs: null, otherClientIds: [] },
  ]);
});

test("a device version keeps its name", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbStore({ userId: "dana", indexedDb });
  const content = { type: "doc" as const };
  const older = {
    id: "version-1",
    docId: DOC,
    kind: "device" as const,
    label: "manual" as const,
    createdAt: 5,
    content,
    uploaded: false,
  };
  await putOlder(indexedDb, "versions", older);
  const named = {
    ...older,
    id: "version-2",
    label: "named" as const,
    name: "Table read draft",
  };
  await store.addVersion(named);
  expect(await store.versions(DOC)).toEqual([{ ...older, name: null }, named]);
});
