import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  allBuildEntries,
  buildId,
  precacheEntries,
  warmAssetUrls,
} from "../src/sw/manifest.ts";
import {
  cleanStaleRuntimeCaches,
  createNoHtmlCachePlugin,
  inspectOfflineReadiness,
  runtimeAssetStrategy,
  runtimeAssetsCacheName,
  startPrecache,
  warmOfflineUrls,
} from "../src/sw/precache.ts";
import type { SwOfflineReadinessMessage } from "../src/sw/precache.ts";

const out = (
  path: string,
  text: string,
): { path: string; bytes: Uint8Array } => ({
  path,
  bytes: new TextEncoder().encode(text),
});

const sha256Hex = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

test("every file the build wrote is in the precache list, hashed names unrevisioned", () => {
  const entries = precacheEntries(
    [
      out("dist/index.html", "<html>"),
      out("dist/chunk-abc12345.js", "x"),
      out("dist/courier-prime-latin-400-normal.woff2", "f"),
    ],
    "dist",
  );
  expect(entries).toEqual([
    { url: "/chunk-abc12345.js", revision: null },
    { url: "/courier-prime-latin-400-normal.woff2", revision: sha256Hex("f") },
    { url: "/index.html", revision: sha256Hex("<html>") },
  ]);
  expect(buildId(entries)).toMatch(new RegExp("^[0-9a-f]{16}$"));
});

test("a build written with backslashes is listed under the same URLs", () => {
  expect(
    precacheEntries(
      [
        out("C:\\out\\dist\\index.html", "<html>"),
        out("C:\\out\\dist\\fonts\\courier-abc12345.woff2", "f"),
      ],
      "C:\\out\\dist",
    ),
  ).toEqual([
    { url: "/fonts/courier-abc12345.woff2", revision: null },
    { url: "/index.html", revision: sha256Hex("<html>") },
  ]);
});

test("a source map or legacy PDF-only woff font is never precached", () => {
  expect(
    precacheEntries(
      [
        out("dist/chunk-abc12345.js", "x"),
        out("dist/chunk-abc12345.js.map", "{}"),
        out("dist/courier-prime-latin-400-normal-abc12345.woff", "legacy"),
      ],
      "dist",
    ),
  ).toEqual([{ url: "/chunk-abc12345.js", revision: null }]);
});

test("on-demand assets named in exclude stay out of the eager precache list", () => {
  expect(
    precacheEntries(
      [
        out("dist/index.html", "<html>"),
        out("dist/chunk-abc12345.js", "x"),
        out("dist/ink-compile.worker.js", "w"),
      ],
      "dist",
      { exclude: new Set(["/ink-compile.worker.js"]) },
    ),
  ).toEqual([
    { url: "/chunk-abc12345.js", revision: null },
    { url: "/index.html", revision: sha256Hex("<html>") },
  ]);
});

test("a different build has a different id; the same build the same", () => {
  const first = precacheEntries([out("dist/index.html", "<html>")], "dist");
  const again = precacheEntries([out("dist/index.html", "<html>")], "dist");
  const next = precacheEntries([out("dist/index.html", "<html lang>")], "dist");
  expect(buildId(again)).toBe(buildId(first));
  expect(buildId(next)).not.toBe(buildId(first));
  expect(buildId(first)).toBe(sha256Hex(JSON.stringify(first)).slice(0, 16));
});

test("a file outside the build's folder is refused", () => {
  expect(() =>
    precacheEntries([out("elsewhere/index.html", "<html>")], "dist"),
  ).toThrow(RangeError);
  expect(() =>
    precacheEntries(
      [out("C:\\out\\distant\\index.html", "<html>")],
      "C:\\out\\dist",
    ),
  ).toThrow(RangeError);
});

test("runtime caching serves hashed assets cache-first, the unhashed Ink worker network-first, and skips sw and api", () => {
  expect([
    runtimeAssetsCacheName("0123456789abcdef"),
    runtimeAssetsCacheName(undefined),
    runtimeAssetsCacheName(""),
    runtimeAssetStrategy(true, "/chunk-abcd1234.js"),
    runtimeAssetStrategy(true, "/font-01234567.woff2"),
    runtimeAssetStrategy(true, "/courier-prime-abcd1234.woff"),
    runtimeAssetStrategy(true, "/ink-compile.worker.js"),
    runtimeAssetStrategy(true, "/plain-worker.js"),
    runtimeAssetStrategy(true, "/sw.js"),
    runtimeAssetStrategy(true, "/api/script-abcd1234.js"),
    runtimeAssetStrategy(false, "/chunk-abcd1234.js"),
    runtimeAssetStrategy(false, "/ink-compile.worker.js"),
  ]).toEqual([
    "manent-runtime-assets-0123456789abcdef",
    "manent-runtime-assets-dev",
    "manent-runtime-assets-dev",
    "cache_first",
    "cache_first",
    "cache_first",
    "network_first",
    null,
    null,
    null,
    null,
    null,
  ]);
});

test("activating a new worker deletes older versioned runtime asset caches only", async () => {
  const kept = new Set([
    "manent-runtime-assets-old1",
    "manent-runtime-assets-v1",
    "manent-runtime-assets-cur2",
    "serwist-precache-v2",
  ]);
  const deleted: string[] = [];
  const fakeCaches = {
    keys: async () => [...kept],
    delete: async (name: string) => {
      deleted.push(name);
      return kept.delete(name);
    },
  } as unknown as CacheStorage;
  await cleanStaleRuntimeCaches(fakeCaches, "manent-runtime-assets-cur2");
  expect([deleted.toSorted(), [...kept].toSorted()]).toEqual([
    ["manent-runtime-assets-old1", "manent-runtime-assets-v1"],
    ["manent-runtime-assets-cur2", "serwist-precache-v2"],
  ]);
});

test("manifest.webmanifest and /icons/*.{svg,png} are precached with SHA-256 revisions", () => {
  const entries = precacheEntries(
    [
      out("dist/manifest.webmanifest", '{"name":"Manent"}'),
      out("dist/icons/icon.svg", "<svg/>"),
      out("dist/icons/icon-192.png", "png192"),
      out("dist/icons/icon-maskable-512.png", "pngmask"),
      out("dist/other/logo.png", "ignored"),
    ],
    "dist",
  );
  expect(entries).toEqual([
    { url: "/icons/icon-192.png", revision: sha256Hex("png192") },
    { url: "/icons/icon-maskable-512.png", revision: sha256Hex("pngmask") },
    { url: "/icons/icon.svg", revision: sha256Hex("<svg/>") },
    {
      url: "/manifest.webmanifest",
      revision: sha256Hex('{"name":"Manent"}'),
    },
  ]);
});

test("buildId over allBuildEntries rotates on any runtime asset change and warmAssetUrls collects warm targets", () => {
  const base = [
    out("dist/index.html", "<html>"),
    out("dist/chunk-abc12345.js", "shell"),
    out("dist/chunk-heavy999.js", "pdfjs"),
    out("dist/ink-compile-deadbeef.worker.js", "ink"),
    out("dist/courier-abc12345.woff", "font"),
    out("dist/chunk-abc12345.js.map", "{}"),
  ];
  const exclude = new Set([
    "/chunk-heavy999.js",
    "/ink-compile-deadbeef.worker.js",
  ]);
  expect(warmAssetUrls(base, "dist", exclude)).toEqual([
    "/chunk-heavy999.js",
    "/courier-abc12345.woff",
    "/ink-compile-deadbeef.worker.js",
  ]);
  const id0 = buildId(allBuildEntries(base, "dist"));
  const changedInk = buildId(
    allBuildEntries(
      base.map((item) =>
        item.path.endsWith(".worker.js")
          ? out("dist/ink-compile-cafebabe.worker.js", "ink-v2")
          : item,
      ),
      "dist",
    ),
  );
  const changedWoff = buildId(
    allBuildEntries(
      base.map((item) =>
        item.path.endsWith(".woff")
          ? out("dist/courier-abc12345.woff", "font-v2")
          : item,
      ),
      "dist",
    ),
  );
  const changedMapOnly = buildId(
    allBuildEntries(
      base.map((item) =>
        item.path.endsWith(".map")
          ? out("dist/chunk-abc12345.js.map", '{"v":2}')
          : item,
      ),
      "dist",
    ),
  );
  expect(changedInk).not.toBe(id0);
  expect(changedWoff).not.toBe(id0);
  expect(changedMapOnly).toBe(id0);
});

test("hashed Ink workers use cache-first while the unhashed worker stays network-first", () => {
  expect([
    runtimeAssetStrategy(true, "/ink-compile-a1b2c3d4.worker.js"),
    runtimeAssetStrategy(true, "/ink-compile.worker.js"),
    runtimeAssetStrategy(false, "/ink-compile-a1b2c3d4.worker.js"),
  ]).toEqual(["cache_first", "network_first", null]);
});

test("the runtime cache plugin refuses text/html responses to prevent cache poisoning", async () => {
  const plugin = createNoHtmlCachePlugin();
  const js = new Response("console.log(1)", {
    status: 200,
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
  const html = new Response("<!doctype html><html></html>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  const fakeArg = {
    request: new Request("https://manent.test/chunk-abcd1234.js"),
    event: {} as ExtendableEvent,
    state: {},
  };
  expect(await plugin.cacheWillUpdate?.({ ...fakeArg, response: js })).toBe(js);
  expect(
    await plugin.cacheWillUpdate?.({ ...fakeArg, response: html }),
  ).toBeNull();
});

function createFakeCacheStorage(
  initial: Record<string, Record<string, Response>> = {},
): CacheStorage & { store: Map<string, Map<string, Response>> } {
  const store = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(initial))
    store.set(name, new Map(Object.entries(entries)));
  const open = async (name: string): Promise<Cache> => {
    let bucket = store.get(name);
    if (bucket === undefined) {
      bucket = new Map();
      store.set(name, bucket);
    }
    const map = bucket;
    return {
      match: async (req: RequestInfo | URL) =>
        map.get(typeof req === "string" ? req : String(req)),
      put: async (req: RequestInfo | URL, res: Response) => {
        map.set(typeof req === "string" ? req : String(req), res);
      },
    } as unknown as Cache;
  };
  const match = async (
    req: RequestInfo | URL,
    opts?: MultiCacheQueryOptions,
  ): Promise<Response | undefined> => {
    const raw = typeof req === "string" ? req : String(req);
    const key = opts?.ignoreSearch ? raw.split("?")[0]! : raw;
    for (const bucket of store.values()) {
      for (const [entryKey, value] of bucket) {
        const cmp = opts?.ignoreSearch ? entryKey.split("?")[0]! : entryKey;
        if (cmp === key) return value;
      }
    }
    return undefined;
  };
  return {
    store,
    open,
    match,
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  } as unknown as CacheStorage & { store: Map<string, Map<string, Response>> };
}

test("warmOfflineUrls warms sequentially, reports progress, rejects HTML, and aborts cleanly offline", async () => {
  const caches = createFakeCacheStorage({
    "serwist-precache": {
      "/index.html?__WB_REVISION__=abc": new Response("<html>"),
    },
  });
  const cacheName = runtimeAssetsCacheName("build42");
  const progress: SwOfflineReadinessMessage[] = [];
  const fetched: string[] = [];
  const result = await warmOfflineUrls({
    caches,
    cacheName,
    warmUrls: ["/chunk-11111111.js", "/chunk-22222222.js"],
    fetchFn: async (input) => {
      fetched.push(String(input));
      return new Response("export {};", {
        status: 200,
        headers: { "Content-Type": "application/javascript" },
      });
    },
    onProgress: (state) => progress.push(state),
  });
  expect(fetched).toEqual(["/chunk-11111111.js", "/chunk-22222222.js"]);
  expect(progress).toEqual([
    { type: "OFFLINE_READINESS_STATE", status: "warming", cached: 0, total: 2 },
    { type: "OFFLINE_READINESS_STATE", status: "warming", cached: 1, total: 2 },
    { type: "OFFLINE_READINESS_STATE", status: "ready", cached: 2, total: 2 },
  ]);
  expect(result).toEqual({
    type: "OFFLINE_READINESS_STATE",
    status: "ready",
    cached: 2,
    total: 2,
  });
  expect(
    await inspectOfflineReadiness(caches, cacheName, [
      "/chunk-11111111.js",
      "/chunk-22222222.js",
    ]),
  ).toEqual({
    type: "OFFLINE_READINESS_STATE",
    status: "ready",
    cached: 2,
    total: 2,
  });

  // HTML fallback or network drop aborts cleanly without writing corrupt entries.
  const caches2 = createFakeCacheStorage({
    "serwist-precache": { "/index.html": new Response("<html>") },
  });
  const progress2: SwOfflineReadinessMessage[] = [];
  await warmOfflineUrls({
    caches: caches2,
    cacheName,
    warmUrls: ["/chunk-aaaaaaaa.js", "/chunk-bbbbbbbb.js"],
    fetchFn: async (input) => {
      if (String(input) === "/chunk-aaaaaaaa.js") {
        return new Response("<html>spa fallback</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      throw new TypeError("offline");
    },
    onProgress: (state) => progress2.push(state),
  });
  expect(caches2.store.get(cacheName)?.size ?? 0).toBe(0);
  expect(progress2.at(-1)).toEqual({
    type: "OFFLINE_READINESS_STATE",
    status: "shell_only",
    cached: 0,
    total: 2,
  });
});

test("startPrecache handles SKIP_WAITING and OFFLINE_READINESS messages on scope", async () => {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  let skipped = 0;
  const caches = createFakeCacheStorage({
    "serwist-precache": { "/index.html": new Response("<html>") },
  });
  const scope = {
    caches,
    location: new URL("https://manent.test/sw.js"),
    addEventListener(type: string, fn: (event: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    skipWaiting: async () => {
      skipped += 1;
    },
    fetch: async () =>
      new Response("export {};", {
        status: 200,
        headers: { "Content-Type": "application/javascript" },
      }),
  } as unknown as ServiceWorkerGlobalScope;

  const prevLocation = Reflect.get(globalThis, "location");
  const prevSelf = Reflect.get(globalThis, "self");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://manent.test/sw.js"),
  });
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: scope,
  });
  try {
    startPrecache({
      entries: [{ url: "/index.html", revision: "1" }],
      buildId: "b1",
      warmUrls: ["/chunk-12345678.js"],
      scope,
    });

    const messageHandlers = listeners.get("message") ?? [];
    const posted: unknown[] = [];
    const waitPromises: Promise<unknown>[] = [];
    const dispatch = (data: unknown): void => {
      for (const fn of messageHandlers) {
        fn({
          data,
          source: { postMessage: (msg: unknown) => posted.push(msg) },
          waitUntil: (p: Promise<unknown>) => waitPromises.push(p),
        });
      }
    };

    dispatch({ type: "SKIP_WAITING" });
    expect(skipped).toBeGreaterThanOrEqual(1);

    dispatch({ type: "OFFLINE_READINESS" });
    await Promise.all(waitPromises.splice(0));
    expect(posted).toEqual([
      {
        type: "OFFLINE_READINESS_STATE",
        status: "shell_only",
        cached: 0,
        total: 1,
      },
    ]);

    posted.length = 0;
    dispatch({ type: "WARM_OFFLINE_TOOLS" });
    await Promise.all(waitPromises.splice(0));
    expect(posted).toEqual([
      {
        type: "OFFLINE_READINESS_STATE",
        status: "warming",
        cached: 0,
        total: 1,
      },
      { type: "OFFLINE_READINESS_STATE", status: "ready", cached: 1, total: 1 },
    ]);
  } finally {
    if (prevLocation === undefined)
      Reflect.deleteProperty(globalThis, "location");
    else
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: prevLocation,
      });
    if (prevSelf === undefined) Reflect.deleteProperty(globalThis, "self");
    else
      Object.defineProperty(globalThis, "self", {
        configurable: true,
        value: prevSelf,
      });
  }
});
