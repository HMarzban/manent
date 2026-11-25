import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import {
  createIdbAssetStore,
  openIdbAssetStore,
  openLocalDatabase,
} from "../src/index.ts";

const ASSET_A = "a".repeat(64);
const ASSET_B = "b".repeat(64);
const ASSET_C = "c".repeat(64);
const ASSET_D = "d".repeat(64);

test("putPendingAsset uses strict durability and survives round-trip with defensive byte copies", async () => {
  const indexedDb = new IDBFactory();
  const db = await openLocalDatabase(indexedDb, "dana");
  const seenOptions: (IDBTransactionOptions | undefined)[] = [];
  const originalTransaction = db.transaction.bind(db);
  db.transaction = ((
    storeNames: string | Iterable<string>,
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ) => {
    seenOptions.push(options);
    return originalTransaction(storeNames, mode, options);
  }) as typeof db.transaction;

  let clock = 1_000;
  const store = createIdbAssetStore(db, { now: () => clock });
  const inputBytes = new Uint8Array([137, 80, 78, 71, 13, 10]);
  const written = await store.putPendingAsset({
    assetId: ASSET_A,
    projectId: "proj-1",
    mime: "image/png",
    width: 640,
    height: 360,
    bytes: inputBytes,
  });
  inputBytes[0] = 0;

  expect(seenOptions[0]).toEqual({ durability: "strict" });
  expect(written).toEqual({
    assetId: ASSET_A,
    projectId: "proj-1",
    mime: "image/png",
    byteLength: 6,
    width: 640,
    height: 360,
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10]),
    uploadState: "pending",
    createdAt: 1_000,
    lastUsedAt: 1_000,
  });

  clock = 2_000;
  const loaded = await store.getAsset(ASSET_A);
  expect(loaded?.bytes).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10]));
  expect(loaded?.lastUsedAt).toBe(2_000);
  db.close();
});

test("lists pending and project assets, marks uploaded, and keeps uploaded state on same-project re-put", async () => {
  const indexedDb = new IDBFactory();
  let clock = 100;
  const store = await openIdbAssetStore({
    userId: "dana",
    indexedDb,
    now: () => clock,
  });

  await store.putPendingAsset({
    assetId: ASSET_A,
    projectId: "proj-1",
    mime: "image/png",
    width: 100,
    height: 100,
    bytes: new Uint8Array([1, 2, 3]),
  });
  clock = 200;
  await store.putPendingAsset({
    assetId: ASSET_B,
    projectId: "proj-2",
    mime: "image/jpeg",
    width: 200,
    height: 200,
    bytes: new Uint8Array([4, 5]),
  });

  expect((await store.listPendingAssets()).map((a) => a.assetId)).toEqual([
    ASSET_A,
    ASSET_B,
  ]);
  expect(
    (await store.listPendingAssets("proj-1")).map((a) => a.assetId),
  ).toEqual([ASSET_A]);
  expect(
    (await store.listProjectAssets("proj-2")).map((a) => a.assetId),
  ).toEqual([ASSET_B]);

  clock = 300;
  expect(await store.markAssetUploaded(ASSET_A)).toBe(true);
  expect(await store.markAssetUploaded(ASSET_C)).toBe(false);
  expect((await store.listPendingAssets()).map((a) => a.assetId)).toEqual([
    ASSET_B,
  ]);

  // re-putting the same asset in the same project keeps uploadState === "uploaded"
  clock = 400;
  const dedup = await store.putPendingAsset({
    assetId: ASSET_A,
    projectId: "proj-1",
    mime: "image/png",
    width: 100,
    height: 100,
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(dedup.uploadState).toBe("uploaded");
  expect(dedup.lastUsedAt).toBe(400);

  // re-putting the same asset into a different project queues it as pending for that project
  clock = 500;
  const otherProj = await store.putPendingAsset({
    assetId: ASSET_A,
    projectId: "proj-2",
    mime: "image/png",
    width: 100,
    height: 100,
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(otherProj.uploadState).toBe("pending");
  expect(otherProj.projectId).toBe("proj-2");

  await store.close();
});

test("evictUploadedLru evicts least-recently-used uploaded blobs and never evicts pending blobs", async () => {
  const indexedDb = new IDBFactory();
  let clock = 100;
  const store = await openIdbAssetStore({
    userId: "dana",
    indexedDb,
    now: () => clock,
  });

  // 4 bytes pending (oldest, MUST NEVER be evicted)
  await store.putPendingAsset({
    assetId: ASSET_A,
    projectId: "proj-1",
    mime: "image/png",
    width: 10,
    height: 10,
    bytes: new Uint8Array(4),
  });
  // 4 bytes uploaded at t=200
  clock = 200;
  await store.putUploadedAsset({
    assetId: ASSET_B,
    projectId: "proj-1",
    mime: "image/png",
    width: 10,
    height: 10,
    bytes: new Uint8Array(4),
  });
  // 4 bytes uploaded at t=300
  clock = 300;
  await store.putUploadedAsset({
    assetId: ASSET_C,
    projectId: "proj-1",
    mime: "image/png",
    width: 10,
    height: 10,
    bytes: new Uint8Array(4),
  });
  // 4 bytes uploaded at t=400
  clock = 400;
  await store.putUploadedAsset({
    assetId: ASSET_D,
    projectId: "proj-1",
    mime: "image/png",
    width: 10,
    height: 10,
    bytes: new Uint8Array(4),
  });

  // Touch ASSET_B at t=500 so ASSET_C (t=300) becomes the oldest uploaded asset
  clock = 500;
  expect((await store.getAsset(ASSET_B))?.lastUsedAt).toBe(500);

  // Total is 16 bytes; cap at 12 bytes -> evicts only ASSET_C
  expect(await store.evictUploadedLru(12)).toEqual([ASSET_C]);
  expect(await store.getAsset(ASSET_C, { touch: false })).toBeNull();
  expect(await store.getAsset(ASSET_B, { touch: false })).not.toBeNull();
  expect(await store.getAsset(ASSET_D, { touch: false })).not.toBeNull();
  expect(await store.getAsset(ASSET_A, { touch: false })).not.toBeNull();

  // Even when cap is 0, evicts remaining uploaded assets (D then B) and pins pending ASSET_A
  expect(await store.evictUploadedLru(0)).toEqual([ASSET_D, ASSET_B]);
  expect(await store.getAsset(ASSET_A, { touch: false })).not.toBeNull();
  expect((await store.listPendingAssets()).map((a) => a.assetId)).toEqual([
    ASSET_A,
  ]);

  await store.close();
});
