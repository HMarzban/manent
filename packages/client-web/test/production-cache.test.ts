import { expect, test } from "bun:test";
import type { CachedProduction } from "@manent/sync-client";
import type { ProductionState } from "@manent/sync-protocol";
import { IDBFactory } from "fake-indexeddb";
import { createIdbProductionCache, forgetOnNewSeed } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const OTHER = "7c1e2a90-4b5d-4f3e-8a21-93d0c6b5e4f2";

function state(docId: string, headSeq: number): ProductionState {
  return {
    v: 1,
    docId,
    headSeq,
    locked: true,
    lockLevel: 1,
    lockedOn: "2026-11-16",
    numbering: "suffix",
    colourOrder: ["white", "blue"],
    anchors: [],
    sceneNumbers: [{ blockId: "block-one-000001", num: "1", reserved: false }],
    sets: [],
    issues: [],
  };
}

const LOCKED: CachedProduction = {
  state: state(DOC, 3),
  baseline: {
    versionId: "version-white",
    content: {
      v: 1,
      blocks: [
        { type: "block", attrs: { id: "block-one-000001", type: "action" } },
      ],
      settings: { "script.numbering": "suffix" },
      schemaVersion: 1,
      engineVersion: 1,
      locks: [],
      authors: {},
    },
  },
};

/** Writes `value` under `key` into the cache's store with raw IndexedDB calls, as another build might have. */
async function rawPut(
  indexedDb: IDBFactory,
  key: string,
  value: unknown,
): Promise<void> {
  const opened = indexedDb.open("manent:production:sam");
  const db = await new Promise<IDBDatabase>((resolve) =>
    opened.addEventListener("success", () => resolve(opened.result)),
  );
  const tx = db.transaction("production", "readwrite");
  tx.objectStore("production").put(value, key);
  await new Promise((resolve) => tx.addEventListener("complete", resolve));
  db.close();
}

test("the production cache keeps one entry per document and survives a reopen", async () => {
  const indexedDb = new IDBFactory();
  const first = createIdbProductionCache({ userId: "sam", indexedDb });
  await first.write(DOC, { state: state(DOC, 2), baseline: null });
  await first.write(DOC, LOCKED);
  await first.write(OTHER, { state: state(OTHER, 1), baseline: null });
  const reopened = createIdbProductionCache({ userId: "sam", indexedDb });
  const kept = [await reopened.read(DOC), await reopened.read(OTHER)];
  const names = (await indexedDb.databases()).map((d) => d.name);
  await reopened.clear(OTHER);
  const cleared = await reopened.read(OTHER);
  await rawPut(indexedDb, OTHER, {
    state: { ...state(OTHER, 1), v: 2 },
    baseline: null,
  });
  const damaged = await reopened.read(OTHER);
  const memory = {
    seedId: "s1",
    read: () => memory.seedId,
    write: (id: string) => void (memory.seedId = id),
  };
  await forgetOnNewSeed({ indexedDb, seedId: "s2", remembered: memory });
  expect([
    kept,
    names,
    cleared,
    damaged,
    (await indexedDb.databases()).map((d) => d.name),
    await reopened.read(DOC),
  ]).toEqual([
    [LOCKED, { state: state(OTHER, 1), baseline: null }],
    ["manent:production:sam"],
    null,
    null,
    [],
    null,
  ]);
});

test("an entry whose baseline does not read is read as nothing", async () => {
  const indexedDb = new IDBFactory();
  const cache = createIdbProductionCache({ userId: "sam", indexedDb });
  const baseline = LOCKED.baseline!;
  const { blocks: _, ...noBlocks } = baseline.content;
  const entries: unknown[] = [
    LOCKED,
    { ...LOCKED, baseline: { ...baseline, versionId: 7 } },
    { ...LOCKED, baseline: { ...baseline, content: noBlocks } },
    {
      ...LOCKED,
      baseline: {
        ...baseline,
        content: { ...baseline.content, engineVersion: "1" },
      },
    },
    { ...LOCKED, baseline: { versionId: baseline.versionId } },
    { ...LOCKED, baseline: "version-white" },
  ];
  await cache.write(DOC, { state: state(DOC, 1), baseline: null });
  const read: unknown[] = [];
  for (const entry of entries) {
    await rawPut(indexedDb, DOC, entry);
    read.push(await cache.read(DOC));
  }
  expect(read).toEqual([LOCKED, null, null, null, null, null]);
});

test("production cache writes with relaxed durability and maps QuotaExceededError to StoreError('quota')", async () => {
  const durabilities: (IDBTransactionDurability | undefined)[] = [];
  const baseDb = new IDBFactory();
  const wrappedFactory = {
    open(name: string, version?: number) {
      const req = baseDb.open(name, version);
      const origAdd = req.addEventListener.bind(req);
      req.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) => {
        if (type === "success") {
          origAdd("success", (event) => {
            const db = req.result;
            const origTx = db.transaction.bind(db);
            db.transaction = ((
              storeNames: string | Iterable<string>,
              mode?: IDBTransactionMode,
              txOpts?: IDBTransactionOptions,
            ) => {
              if (mode === "readwrite") durabilities.push(txOpts?.durability);
              return origTx(storeNames, mode, txOpts);
            }) as typeof db.transaction;
            if (typeof listener === "function") listener(event);
            else listener.handleEvent(event);
          });
          return;
        }
        origAdd(type, listener, opts);
      }) as typeof req.addEventListener;
      return req;
    },
  } as unknown as IDBFactory;

  const cache = createIdbProductionCache({
    userId: "sam",
    indexedDb: wrappedFactory,
  });
  await cache.write(DOC, LOCKED);
  expect(durabilities).toEqual(["relaxed"]);

  // QuotaExceededError on transaction abort maps to StoreError("quota").
  const quotaFactory = {
    open() {
      const req = new EventTarget() as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        const fakeTx = new EventTarget() as unknown as IDBTransaction;
        Object.defineProperty(fakeTx, "error", {
          value: new DOMException("quota exceeded", "QuotaExceededError"),
        });
        Object.defineProperty(fakeTx, "objectStore", {
          value: () => ({
            put: () => {
              queueMicrotask(() => fakeTx.dispatchEvent(new Event("abort")));
              return {} as IDBRequest;
            },
          }),
        });
        const fakeDb = Object.assign(new EventTarget(), {
          transaction: () => fakeTx,
          close: () => {},
        });
        Object.defineProperty(req, "result", { value: fakeDb });
        req.dispatchEvent(new Event("success"));
      });
      return req;
    },
  } as unknown as IDBFactory;

  const quotaCache = createIdbProductionCache({
    userId: "sam",
    indexedDb: quotaFactory,
  });
  await expect(quotaCache.write(DOC, LOCKED)).rejects.toMatchObject({
    code: "quota",
  });
});
