import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildId, precacheEntries } from "../src/sw/manifest.ts";

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

test("a source map is never precached", () => {
  expect(
    precacheEntries(
      [
        out("dist/chunk-abc12345.js", "x"),
        out("dist/chunk-abc12345.js.map", "{}"),
      ],
      "dist",
    ),
  ).toEqual([{ url: "/chunk-abc12345.js", revision: null }]);
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
});
