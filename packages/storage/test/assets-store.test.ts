import { afterAll, describe, expect, test } from "bun:test";
import { PROJECT_ASSETS_MAX_BYTES, openSqliteStorage } from "../src/index.ts";
import type { Storage } from "../src/index.ts";
import { createMemoryStorage } from "../src/testing/index.ts";
import { HOME, createTempTrees } from "./raw.ts";

const trees = createTempTrees("manent-assets-");
afterAll(() => trees.removeAll());

const ASSET_A = "a".repeat(64);
const ASSET_B = "b".repeat(64);
const ASSET_C = "c".repeat(64);

function runContract(
  label: string,
  open: () => Promise<{ storage: Storage; close(): void }>,
): void {
  describe(`ProjectAssetsStore (${label})`, () => {
    test("stores, heads, reads, lists and deduplicates content-addressed assets", async () => {
      const { storage, close } = await open();
      try {
        const file = storage.open(HOME);
        expect(file.assets.totalBytes()).toBe(0);
        expect(file.assets.listMeta()).toEqual([]);
        expect(file.assets.get(ASSET_A)).toBeNull();
        expect(file.assets.head(ASSET_A)).toBeNull();

        const bytesA = new Uint8Array([1, 2, 3, 4]);
        const first = file.assets.put({
          assetId: ASSET_A,
          mime: "image/png",
          width: 100,
          height: 50,
          bytes: bytesA,
          createdByUserId: "dana",
          createdAt: 1_000,
        });
        // mutating caller buffer after put must not corrupt stored bytes
        bytesA[0] = 99;

        const expectedMetaA = {
          assetId: ASSET_A,
          mime: "image/png",
          byteLength: 4,
          width: 100,
          height: 50,
          createdByUserId: "dana",
          createdAt: 1_000,
        };
        expect(first).toEqual({ status: "stored", meta: expectedMetaA });
        expect(file.assets.head(ASSET_A)).toEqual(expectedMetaA);
        const readA = file.assets.get(ASSET_A);
        expect(readA).toEqual({
          ...expectedMetaA,
          bytes: new Uint8Array([1, 2, 3, 4]),
        });
        // mutating returned buffer must not corrupt stored bytes
        readA!.bytes[1] = 88;
        expect(file.assets.get(ASSET_A)!.bytes).toEqual(
          new Uint8Array([1, 2, 3, 4]),
        );

        // idempotent deduplication returns exists and does not double-charge totalBytes
        const dup = file.assets.put({
          assetId: ASSET_A,
          mime: "image/png",
          width: 100,
          height: 50,
          bytes: new Uint8Array([1, 2, 3, 4]),
          createdByUserId: "sam",
          createdAt: 2_000,
        });
        expect(dup).toEqual({ status: "exists", meta: expectedMetaA });
        expect(file.assets.totalBytes()).toBe(4);

        const second = file.assets.put({
          assetId: ASSET_B,
          mime: "image/webp",
          width: 800,
          height: 600,
          bytes: new Uint8Array([5, 6, 7, 8, 9, 10]),
          createdByUserId: "sam",
          createdAt: 1_500,
        });
        expect(second.status).toBe("stored");
        expect(file.assets.totalBytes()).toBe(10);
        expect(file.assets.listMeta()).toEqual([
          expectedMetaA,
          {
            assetId: ASSET_B,
            mime: "image/webp",
            byteLength: 6,
            width: 800,
            height: 600,
            createdByUserId: "sam",
            createdAt: 1_500,
          },
        ]);
      } finally {
        close();
      }
    });

    test("enforces the project byte cap atomically and allows idempotent re-puts at the cap", async () => {
      const { storage, close } = await open();
      try {
        expect(PROJECT_ASSETS_MAX_BYTES).toBe(200 * 1024 * 1024);
        const file = storage.open(HOME);
        const cap = 10;

        expect(
          file.assets.put({
            assetId: ASSET_A,
            mime: "image/png",
            width: 10,
            height: 10,
            bytes: new Uint8Array(6),
            createdByUserId: "dana",
            createdAt: 100,
            maxProjectBytes: cap,
          }).status,
        ).toBe("stored");

        // exceeding the cap by 1 byte writes nothing
        expect(
          file.assets.put({
            assetId: ASSET_B,
            mime: "image/jpeg",
            width: 10,
            height: 10,
            bytes: new Uint8Array(5),
            createdByUserId: "dana",
            createdAt: 200,
            maxProjectBytes: cap,
          }),
        ).toEqual({
          status: "quota_exceeded",
          usedBytes: 6,
          maxBytes: 10,
        });
        expect(file.assets.head(ASSET_B)).toBeNull();
        expect(file.assets.totalBytes()).toBe(6);

        // exact remaining capacity succeeds
        expect(
          file.assets.put({
            assetId: ASSET_C,
            mime: "image/jpeg",
            width: 10,
            height: 10,
            bytes: new Uint8Array(4),
            createdByUserId: "dana",
            createdAt: 300,
            maxProjectBytes: cap,
          }).status,
        ).toBe("stored");
        expect(file.assets.totalBytes()).toBe(10);

        // deduplicating an already-stored asset at the cap still returns exists
        expect(
          file.assets.put({
            assetId: ASSET_A,
            mime: "image/png",
            width: 10,
            height: 10,
            bytes: new Uint8Array(6),
            createdByUserId: "dana",
            createdAt: 400,
            maxProjectBytes: cap,
          }).status,
        ).toBe("exists");
      } finally {
        close();
      }
    });

    test("joins DocFile.transaction and rolls back on failure", async () => {
      const { storage, close } = await open();
      try {
        const file = storage.open(HOME);
        expect(() =>
          file.transaction(() => {
            file.assets.put({
              assetId: ASSET_A,
              mime: "image/png",
              width: 10,
              height: 10,
              bytes: new Uint8Array([1, 2, 3]),
              createdByUserId: "dana",
              createdAt: 100,
            });
            throw new RangeError("abort");
          }),
        ).toThrow(RangeError);
        expect(file.assets.head(ASSET_A)).toBeNull();
        expect(file.assets.totalBytes()).toBe(0);
      } finally {
        close();
      }
    });
  });
}

runContract("sqlite", async () => {
  const dir = await trees.tree();
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  return { storage, close: () => storage.close() };
});

runContract("memory", async () => {
  const storage = createMemoryStorage({ now: () => 1_000 });
  return { storage, close: () => storage.close() };
});
