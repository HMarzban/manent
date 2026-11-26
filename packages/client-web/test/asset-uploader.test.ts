import { describe, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import {
  ASSET_MAX_BYTES,
  AssetValidationError,
  computeSha256Hex,
  createAssetUploader,
  openIdbAssetStore,
  validateLocalAssetBytes,
} from "../src/index.ts";
import type { AssetUploaderTimers } from "../src/index.ts";

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[11] = 13;
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function makeJpeg(width: number, height: number): Uint8Array {
  // SOI + APP0 (length 4) + SOF0 (length 11) + EOI
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00], 0);
  bytes.set([0xff, 0xc0, 0x00, 0x0b, 0x08], 8);
  const view = new DataView(bytes.buffer);
  view.setUint16(13, height, false);
  view.setUint16(15, width, false);
  bytes.set([0xff, 0xd9], 19);
  return bytes;
}

function makeWebpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

function fakeTimers(): AssetUploaderTimers & {
  readonly delays: number[];
  fireNext(): boolean;
} {
  const queue: { delayMs: number; fn: () => void; cancelled: boolean }[] = [];
  const delays: number[] = [];
  return {
    delays,
    schedule(fn, delayMs) {
      delays.push(delayMs);
      const entry = { delayMs, fn, cancelled: false };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    fireNext() {
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (next.cancelled) continue;
        next.fn();
        return true;
      }
      return false;
    },
  };
}

describe("validateLocalAssetBytes", () => {
  test("accepts valid PNG, JPEG and WebP headers", () => {
    expect(validateLocalAssetBytes(makePng(640, 360))).toEqual({
      mime: "image/png",
      width: 640,
      height: 360,
      byteLength: 32,
    });
    expect(validateLocalAssetBytes(makeJpeg(1920, 1080))).toEqual({
      mime: "image/jpeg",
      width: 1920,
      height: 1080,
      byteLength: 21,
    });
    expect(validateLocalAssetBytes(makeWebpVp8x(1280, 720))).toEqual({
      mime: "image/webp",
      width: 1280,
      height: 720,
      byteLength: 30,
    });
  });

  test("rejects SVG, HTML, oversized payloads, invalid headers and >4096px dimensions", () => {
    const svg = new TextEncoder().encode(
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
    expect(() => validateLocalAssetBytes(svg)).toThrow(AssetValidationError);
    try {
      validateLocalAssetBytes(svg);
    } catch (e) {
      expect((e as AssetValidationError).reason).toBe("unsupported_type");
    }

    expect(() => validateLocalAssetBytes(new Uint8Array(0))).toThrow(
      AssetValidationError,
    );

    const tooBig = new Uint8Array(ASSET_MAX_BYTES + 1);
    tooBig.set(makePng(10, 10), 0);
    try {
      validateLocalAssetBytes(tooBig);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AssetValidationError).reason).toBe("too_large");
    }

    try {
      validateLocalAssetBytes(makePng(4097, 100));
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AssetValidationError).reason).toBe("dimensions_exceeded");
    }

    const corruptPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    try {
      validateLocalAssetBytes(corruptPng);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AssetValidationError).reason).toBe("invalid_header");
    }
  });
});

describe("createAssetUploader", () => {
  test("stages offline to strict IDB, returns immediate object URL, and drains PUT on reconnect", async () => {
    const store = await openIdbAssetStore({
      userId: "user-1",
      indexedDb: new IDBFactory(),
    });
    let online = false;
    const requests: {
      url: string;
      method: string;
      contentType: string | null;
    }[] = [];
    const created: string[] = [];
    const revoked: string[] = [];
    const uploader = createAssetUploader({
      projectId: "proj-1",
      store,
      baseUrl: "https://manent.test",
      isOnline: () => online,
      headers: () => ({ Authorization: "Bearer tok" }),
      createObjectURL: () => {
        const url = `blob:mem/${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url) => revoked.push(url),
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          contentType: headers.get("Content-Type"),
        });
        return new Response(null, { status: 201 });
      },
    });

    const png = makePng(320, 200);
    const expectedId = await computeSha256Hex(png);
    const staged = await uploader.stageAsset(png);
    expect(staged).toEqual({
      assetId: expectedId,
      mime: "image/png",
      width: 320,
      height: 200,
      byteLength: png.byteLength,
      url: "blob:mem/1",
    });
    expect(requests.length).toBe(0);
    expect((await store.listPendingAssets("proj-1")).length).toBe(1);
    expect(await uploader.resolveAssetUrl(expectedId)).toBe("blob:mem/1");

    online = true;
    const drained = await uploader.notifyOnline();
    expect(drained).toEqual({
      uploaded: [expectedId],
      pending: 0,
      refused: [],
    });
    expect(requests).toEqual([
      {
        url: `https://manent.test/api/projects/proj-1/assets/${expectedId}`,
        method: "PUT",
        contentType: "image/png",
      },
    ]);
    expect((await store.listPendingAssets("proj-1")).length).toBe(0);
    expect((await store.getAsset(expectedId))?.uploadState).toBe("uploaded");

    uploader.destroy();
    expect(revoked).toEqual(["blob:mem/1"]);
    await store.close();
  });

  test("applies exponential backoff on 503 and stops retrying permanently refused 413 assets", async () => {
    const store = await openIdbAssetStore({
      userId: "user-2",
      indexedDb: new IDBFactory(),
    });
    const timers = fakeTimers();
    const refusedCalls: { assetId: string; status: number }[] = [];
    let attempt = 0;
    const uploader = createAssetUploader({
      projectId: "proj-2",
      store,
      isOnline: () => true,
      timers,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      createObjectURL: () => "blob:mem/x",
      revokeObjectURL: () => {},
      onUploadRefused: (assetId, status) =>
        refusedCalls.push({ assetId, status }),
      fetch: async () => {
        attempt += 1;
        if (attempt <= 2) return new Response(null, { status: 503 });
        return new Response(null, { status: 200 });
      },
    });

    const png = makePng(100, 100);
    const id = await computeSha256Hex(png);
    await store.putPendingAsset({
      assetId: id,
      projectId: "proj-2",
      mime: "image/png",
      width: 100,
      height: 100,
      bytes: png,
    });

    const first = await uploader.drainPending();
    expect(first.pending).toBe(1);
    expect(timers.delays).toEqual([500]);

    timers.fireNext();
    await uploader.drainPending();
    expect(timers.delays).toEqual([500, 1000]);

    timers.fireNext();
    await uploader.drainPending();
    expect((await store.listPendingAssets("proj-2")).length).toBe(0);
    uploader.destroy();

    // Permanent 413 refusal should not schedule infinite retries.
    const timers2 = fakeTimers();
    const uploader2 = createAssetUploader({
      projectId: "proj-2",
      store,
      isOnline: () => true,
      timers: timers2,
      createObjectURL: () => "blob:mem/y",
      revokeObjectURL: () => {},
      onUploadRefused: (assetId, status) =>
        refusedCalls.push({ assetId, status }),
      fetch: async () => new Response(null, { status: 413 }),
    });
    const jpeg = makeJpeg(50, 50);
    const jpegId = await computeSha256Hex(jpeg);
    await store.putPendingAsset({
      assetId: jpegId,
      projectId: "proj-2",
      mime: "image/jpeg",
      width: 50,
      height: 50,
      bytes: jpeg,
    });
    const res = await uploader2.drainPending();
    expect(res).toEqual({ uploaded: [], pending: 0, refused: [jpegId] });
    expect(timers2.delays).toEqual([]);
    expect(refusedCalls).toEqual([{ assetId: jpegId, status: 413 }]);

    uploader2.destroy();
    await store.close();
  });

  test("resolveAssetUrl fetches on demand, verifies SHA-256, caches in IDB and rejects mismatched digests", async () => {
    const store = await openIdbAssetStore({
      userId: "user-3",
      indexedDb: new IDBFactory(),
    });
    const goodPng = makePng(64, 64);
    const goodId = await computeSha256Hex(goodPng);
    const badId = "f".repeat(64);
    let fetches = 0;
    const created: string[] = [];
    const revoked: string[] = [];

    const uploader = createAssetUploader({
      projectId: "proj-3",
      store,
      isOnline: () => true,
      createObjectURL: () => {
        const url = `blob:get/${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url) => revoked.push(url),
      fetch: async (input) => {
        fetches += 1;
        if (String(input).endsWith(goodId)) {
          return new Response(new Uint8Array(goodPng), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        // Returns mismatched payload for badId
        return new Response(new Uint8Array(goodPng), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      },
    });

    // Rejects digest mismatch without caching.
    expect(await uploader.resolveAssetUrl(badId)).toBeNull();
    expect(await store.getAsset(badId)).toBeNull();

    // Concurrent calls for goodId deduplicate into a single GET and cache in IDB + memory.
    const [u1, u2] = await Promise.all([
      uploader.resolveAssetUrl(goodId),
      uploader.resolveAssetUrl(goodId),
    ]);
    expect(u1).toBe("blob:get/1");
    expect(u2).toBe("blob:get/1");
    expect(fetches).toBe(2); // 1 for badId, 1 for goodId
    expect((await store.getAsset(goodId))?.uploadState).toBe("uploaded");

    // Subsequent call hits in-memory cache with zero extra fetches.
    expect(await uploader.resolveAssetUrl(goodId)).toBe("blob:get/1");
    expect(fetches).toBe(2);

    uploader.destroy();
    expect(revoked).toEqual(["blob:get/1"]);
    await store.close();
  });
});
