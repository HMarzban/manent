import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrameDecoder, encodeMessage } from "@manent/sync-protocol";
import type {
  Message,
  SignInResponse,
  WsTicketResponse,
} from "@manent/sync-protocol";
import { createServer } from "../src/index.ts";
import type { Connection, ConnectionData } from "../src/index.ts";
import { HTTP, makeConfig } from "./config.ts";

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const peer = { remoteAddress: "127.0.0.1", upgrade: () => false };

test("static caching, ETag 304, HEAD, manifest MIME type, and 404 anti-poisoning", async () => {
  const webDir = await mkdtemp(join(tmpdir(), "manent-static-"));
  made.push(webDir);
  await mkdir(join(webDir, "icons"), { recursive: true });
  await writeFile(
    join(webDir, "index.html"),
    "<!doctype html><title>app</title>",
  );
  await writeFile(join(webDir, "sw.js"), "self.x = 1;");
  await writeFile(join(webDir, "manifest.webmanifest"), '{"name":"Manent"}');
  await writeFile(
    join(webDir, "benchmark-report.html"),
    "<!doctype html><title>Benchmark report</title>",
  );
  await writeFile(join(webDir, "third-party-notices.txt"), "notices");
  await writeFile(join(webDir, "chunk-abc12345.js"), "export const a = 1;");
  await writeFile(join(webDir, "style-abc12345.css"), "body{}");
  await writeFile(join(webDir, "font-0123abcd.woff2"), "font");
  await writeFile(
    join(webDir, "ink-compile-deadbeef.worker.js"),
    "self.ink = 1;",
  );
  await writeFile(join(webDir, "icons", "icon.svg"), "<svg></svg>");

  const web = createServer(makeConfig({ http: { ...HTTP, webDir } }));
  const fetchPath = async (path: string, init?: RequestInit) => {
    const response = await web.fetch(
      new Request(`http://localhost:4747${path}`, init),
      peer,
    );
    if (response === null) throw new TypeError(`${path} was upgraded`);
    return response;
  };

  const cacheControl = async (
    path: string,
  ): Promise<[string, string | null]> => [
    path,
    (await fetchPath(path)).headers.get("cache-control"),
  ];
  expect(
    await Promise.all(
      [
        "/sw.js",
        "/",
        "/index.html",
        "/s/01a1b2c3",
        "/manifest.webmanifest",
        "/benchmark-report.html",
        "/third-party-notices.txt",
        "/chunk-abc12345.js",
        "/style-abc12345.css",
        "/font-0123abcd.woff2",
        "/ink-compile-deadbeef.worker.js",
      ].map(cacheControl),
    ),
  ).toEqual([
    ["/sw.js", "no-cache, max-age=0, must-revalidate"],
    ["/", "no-cache"],
    ["/index.html", "no-cache"],
    ["/s/01a1b2c3", "no-cache"],
    ["/manifest.webmanifest", "no-cache"],
    ["/benchmark-report.html", "no-cache"],
    ["/third-party-notices.txt", "no-cache"],
    ["/chunk-abc12345.js", "public, max-age=31536000, immutable"],
    ["/style-abc12345.css", "public, max-age=31536000, immutable"],
    ["/font-0123abcd.woff2", "public, max-age=31536000, immutable"],
    ["/ink-compile-deadbeef.worker.js", "public, max-age=31536000, immutable"],
  ]);

  const manifest = await fetchPath("/manifest.webmanifest");
  expect(manifest.headers.get("content-type")).toBe(
    "application/manifest+json; charset=utf-8",
  );
  expect(manifest.headers.get("x-content-type-options")).toBe("nosniff");

  // strong ETag + If-None-Match -> 304 and HEAD support
  const sw = await fetchPath("/sw.js");
  const etag = sw.headers.get("etag");
  expect(etag).toMatch(new RegExp('^"[0-9a-f]{32}"$'));
  const notModified = await fetchPath("/sw.js", {
    headers: { "If-None-Match": etag! },
  });
  expect([notModified.status, await notModified.text()]).toEqual([304, ""]);
  const head = await fetchPath("/chunk-abc12345.js", { method: "HEAD" });
  expect([
    head.status,
    head.headers.get("content-length"),
    head.headers.get("etag"),
    await head.text(),
  ]).toEqual([
    200,
    String("export const a = 1;".length),
    expect.stringMatching(new RegExp('^"[0-9a-f]{32}"$')),
    "",
  ]);

  // missing static asset extensions return 404 no-store instead of index.html
  for (const missing of [
    "/missing.js",
    "/missing.css",
    "/missing.woff2",
    "/missing.png",
    "/icons/missing.svg",
    "/missing.webmanifest",
    "/missing.wasm",
  ]) {
    const r = await fetchPath(missing);
    expect([
      missing,
      r.status,
      r.headers.get("content-type"),
      r.headers.get("cache-control"),
      r.headers.get("x-content-type-options"),
    ]).toEqual([
      missing,
      404,
      "text/plain; charset=utf-8",
      "no-store",
      "nosniff",
    ]);
  }
});

test("security headers, HTML CSP, API X-Manent-Build-Id, and WELCOME webBuildId come from build-meta.json", async () => {
  const webDir = await mkdtemp(join(tmpdir(), "manent-meta-"));
  made.push(webDir);
  await writeFile(
    join(webDir, "index.html"),
    "<!doctype html><title>app</title>",
  );
  await writeFile(
    join(webDir, "build-meta.json"),
    JSON.stringify({
      buildId: "1111222233334444",
      bootScriptHash: "sha256-BOOT1",
    }),
  );

  const web = createServer(makeConfig({ http: { ...HTTP, webDir } }));
  const fetchAt = async (path: string, init?: RequestInit) => {
    const response = await web.fetch(
      new Request(`http://127.0.0.1:4747${path}`, init),
      peer,
    );
    if (response === null) throw new TypeError(`${path} was upgraded`);
    return response;
  };

  const html = await fetchAt("/");
  expect([
    html.headers.get("x-content-type-options"),
    html.headers.get("x-frame-options"),
    html.headers.get("referrer-policy"),
    html.headers.get("permissions-policy"),
    html.headers.get("content-security-policy"),
  ]).toEqual([
    "nosniff",
    "DENY",
    "no-referrer",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "default-src 'none'; script-src 'self' 'sha256-BOOT1'; worker-src 'self'; child-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss: http://127.0.0.1:4748; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  ]);

  const api = await fetchAt("/api/sign-in");
  expect([
    api.headers.get("cache-control"),
    api.headers.get("x-manent-build-id"),
    api.headers.get("x-content-type-options"),
    api.headers.get("x-frame-options"),
  ]).toEqual(["no-store", "1111222233334444", "nosniff", "DENY"]);

  // WebSocket WELCOME emits webBuildId from build-meta.json
  const signIn = (await (
    await fetchAt("/api/sign-in", {
      method: "POST",
      body: JSON.stringify({ userId: "leo" }),
    })
  ).json()) as SignInResponse;
  const ticket = (
    (await (
      await fetchAt("/api/ws-ticket", {
        method: "POST",
        headers: { Authorization: `Bearer ${signIn.token}` },
      })
    ).json()) as WsTicketResponse
  ).ticket;
  let upgraded: ConnectionData | null = null;
  await web.fetch(
    new Request(`http://127.0.0.1:4747/ws?ticket=${ticket}`, {
      headers: { Origin: "http://127.0.0.1:4747" },
    }),
    {
      remoteAddress: "127.0.0.1",
      upgrade(data) {
        upgraded = data;
        return true;
      },
    },
  );
  const sent: Uint8Array[] = [];
  const conn: Connection = {
    data: upgraded!,
    bufferedBytes: 0,
    send(frame) {
      sent.push(frame);
      return "sent";
    },
    close() {},
  };
  web.connections.open(conn);
  web.connections.message(
    conn,
    encodeMessage({
      type: "HELLO",
      versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
      build: "test",
      deviceId: "dev-1",
    }),
  );
  const decoder = createFrameDecoder({ from: "server" });
  const welcomed = sent
    .flatMap((frame) => {
      const res = decoder.push(frame);
      return res.kind === "message" ? [res.message] : [];
    })
    .find(
      (m): m is Extract<Message, { type: "WELCOME" }> => m.type === "WELCOME",
    );
  expect(welcomed?.webBuildId).toBe("1111222233334444");

  // Rewriting build-meta.json refreshes the cached metadata automatically
  await writeFile(
    join(webDir, "build-meta.json"),
    JSON.stringify({
      buildId: "5555666677778888",
      bootScriptHash: "sha256-BOOT2",
    }),
  );
  const nextApi = await fetchAt("/api/sign-in");
  const nextHtml = await fetchAt("/");
  expect(nextApi.headers.get("x-manent-build-id")).toBe("5555666677778888");
  expect(nextHtml.headers.get("content-security-policy")).toContain(
    "'sha256-BOOT2'",
  );
});
