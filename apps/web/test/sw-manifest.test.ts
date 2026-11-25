import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildId, precacheEntries } from "../src/sw/manifest.ts";
import {
  cleanStaleRuntimeCaches,
  runtimeAssetStrategy,
  runtimeAssetsCacheName,
} from "../src/sw/precache.ts";

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
