import { afterEach, expect, test } from "bun:test";
import { computeSha256Hex, openIdbAssetStore } from "@manent/client-web";
import { createValue } from "@manent/ui";
import { IDBFactory } from "fake-indexeddb";
import {
  disposeProjectAssetUploaders,
  drainPendingAssetsForUser,
  startPendingAssetDrain,
} from "../src/editor-host/asset-pool.ts";

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[11] = 13;
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

afterEach(async () => {
  await disposeProjectAssetUploaders("drain-user");
  await disposeProjectAssetUploaders("empty-user");
});

test("drainPendingAssetsForUser does not create an IDB database when none exists", async () => {
  const indexedDb = new IDBFactory();
  const uploaded = await drainPendingAssetsForUser(
    { userId: "empty-user" },
    { indexedDb, isOnline: () => true },
  );
  expect(uploaded).toEqual([]);
  expect(await indexedDb.databases()).toEqual([]);
});

test("startPendingAssetDrain uploads offline-added graphics on reconnect without opening an editor", async () => {
  const indexedDb = new IDBFactory();
  const store = await openIdbAssetStore({ userId: "drain-user", indexedDb });
  const pngA = makePng(120, 80);
  const pngB = makePng(240, 160);
  const idA = await computeSha256Hex(pngA);
  const idB = await computeSha256Hex(pngB);
  await store.putPendingAsset({
    assetId: idA,
    projectId: "proj-a",
    mime: "image/png",
    width: 120,
    height: 80,
    bytes: pngA,
  });
  await store.putPendingAsset({
    assetId: idB,
    projectId: "proj-b",
    mime: "image/png",
    width: 240,
    height: 160,
    bytes: pngB,
  });
  await store.close();

  const network = createValue(false);
  const uploadedUrls: string[] = [];
  const stop = startPendingAssetDrain({
    userId: "drain-user",
    network,
    onlineTarget: null,
    visibilityTarget: null,
    overrides: {
      indexedDb,
      isOnline: () => network.get(),
      createObjectURL: () => "blob:test/1",
      revokeObjectURL: () => {},
      fetch: async (input) => {
        uploadedUrls.push(String(input));
        return new Response(null, { status: 201 });
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(uploadedUrls).toEqual([]);

  // Going online drains both projects automatically even while staying on Library
  network.set(true);
  for (let i = 0; i < 40 && uploadedUrls.length < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  stop();

  expect(uploadedUrls.toSorted()).toEqual([
    `/api/projects/proj-a/assets/${idA}`,
    `/api/projects/proj-b/assets/${idB}`,
  ]);

  const checkStore = await openIdbAssetStore({
    userId: "drain-user",
    indexedDb,
  });
  expect(await checkStore.listPendingAssets()).toEqual([]);
  await checkStore.close();
});
