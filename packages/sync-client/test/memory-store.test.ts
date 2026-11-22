import { expect, test } from "bun:test";
import { StoreError } from "../src/index.ts";
import type { DeviceVersion, StoredUpdate } from "../src/index.ts";
import {
  blankMeta,
  createFaultyStore,
  createFaultyStoreSpace,
  createMemoryStore,
  createMemoryStoreSpace,
  localStoreContract,
} from "../src/testing/index.ts";

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

const VERSION: DeviceVersion = {
  id: "v1",
  docId: DOC,
  kind: "device",
  label: "session_end",
  name: null,
  createdAt: 1,
  content: { type: "doc", content: [] },
  uploaded: false,
};

/** Lets every pending microtask chain run its course. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

localStoreContract({ test, expect }, async () => {
  const space = createMemoryStoreSpace();
  return {
    open: async (userId) => space.store(userId),
    dispose: async () => {},
  };
});
// with no fault set it is the store it wraps
localStoreContract({ test, expect }, async () => {
  const space = createFaultyStoreSpace();
  return {
    open: async (userId) => space.store(userId),
    dispose: async () => {},
  };
});

test("a refused write is its own outcome", async () => {
  const s = createFaultyStore("dana");
  await s.create(blankMeta(DOC));
  s.refuseWrites("quota");
  const refused = await s.append(DOC, own(1)).then(
    () => null,
    (e: unknown) => e,
  );
  expect(refused).toBeInstanceOf(StoreError);
  expect((refused as StoreError).code).toBe("quota");
  // nothing half-written
  expect((await s.load(DOC))!.entries).toEqual([]);
  s.refuseWrites(null);
  await s.append(DOC, own(1));
  expect((await s.load(DOC))!.entries).toEqual([own(1)]);
});

test("a store that cannot be opened says so", async () => {
  const s = createFaultyStore("dana");
  await s.create(blankMeta(DOC));
  s.refuseOpen(true);
  const refused = await s.load(DOC).then(
    () => null,
    (e: unknown) => e,
  );
  expect(refused).toBeInstanceOf(StoreError);
  expect((refused as StoreError).code).toBe("unavailable");
  s.refuseOpen(false);
  expect((await s.load(DOC))!.meta).toEqual(blankMeta(DOC));
});

test("a wiped store is empty", async () => {
  const space = createFaultyStoreSpace();
  const s = space.store("dana");
  await s.create(blankMeta(DOC));
  await s.append(DOC, own(1));
  await s.addVersion(VERSION);
  s.wipe();
  expect([
    await s.load(DOC),
    await s.documents(),
    await s.versions(DOC),
  ]).toEqual([null, [], []]);
  const again = space.store("dana");
  expect([await again.load(DOC), await again.documents()]).toEqual([null, []]);
});

test("held writes settle in order, and only when released", async () => {
  const s = createFaultyStore("dana");
  await s.create(blankMeta(DOC));
  s.holdWrites();
  const settled: number[] = [];
  const first = s.append(DOC, own(1)).then(() => settled.push(1));
  const second = s.append(DOC, own(2)).then(() => settled.push(2));
  await settle();
  expect([settled, (await s.load(DOC))!.entries, s.writes()]).toEqual([
    [],
    [],
    1,
  ]);
  s.releaseWrites();
  await Promise.all([first, second]);
  expect([settled, (await s.load(DOC))!.entries, s.writes()]).toEqual([
    [1, 2],
    [own(1), own(2)],
    3,
  ]);
});

test("a write to a document the store does not hold is refused as a mistake", async () => {
  await expect(
    createMemoryStore("dana").append(DOC, own(1)),
  ).rejects.toBeInstanceOf(RangeError);
});

test("two memory stores made on their own share nothing", async () => {
  const first = createMemoryStore("dana");
  await first.create(blankMeta(DOC));
  expect(await createMemoryStore("dana").documents()).toEqual([]);
});

test("the main entry and the testing entry give the same store", async () => {
  // the testing entry re-exports it
  expect(createMemoryStore).toBe(
    (await import("../src/index.ts")).createMemoryStore,
  );
});
