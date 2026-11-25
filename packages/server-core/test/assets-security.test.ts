import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import { PROTOCOL_VERSION, indexDocId } from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";
import { createAssetsService } from "../src/assets/service.ts";
import {
  MAX_ASSET_BYTES,
  sha256Hex,
  sniffImageHeader,
} from "../src/assets/verify.ts";
import {
  PRODUCT_SETTING_RULES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "../src/index.ts";
import type { Clock, Directory, RequestContext } from "../src/index.ts";

const PROJECT = "0b9f3c1e-6d2a-4e8b-9f1a-2c3d4e5f6a7b";
const SCRIPT = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT_INDEX = indexDocId("project", PROJECT);

const PEOPLE: Readonly<Record<string, string>> = {
  owner: "Dana Reyes",
  editor: "Sam Okafor",
  viewer: "Leo Marsh",
  commenter: "Priya Nair",
  draftReader: "Guest Reader",
  outsider: "Outside Person",
};

const USERS: Directory = {
  user: (userId) =>
    Object.hasOwn(PEOPLE, userId) ? { userId, name: PEOPLE[userId]! } : null,
  workspacesOf: () => [{ id: "studio", name: "Studio", seeding: null }],
};

const V: VersionSet = {
  protocol: PROTOCOL_VERSION,
  schema: 3,
  engine: 1,
  table: 0,
};

function pngHeader(
  width: number,
  height: number,
  extraBytes = 0,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(33 + extraBytes);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13, false);
  out.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return out;
}

function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(20);
  const view = new DataView(out.buffer);
  out.set([0xff, 0xd8, 0xff, 0xc0], 0);
  view.setUint16(4, 11, false); // SOF0 segment length
  out[6] = 8; // precision
  view.setUint16(7, height, false);
  view.setUint16(9, width, false);
  out[11] = 3; // components
  out[18] = 0xff;
  out[19] = 0xd9;
  return out;
}

function webpVp8x(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(30);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  out.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  out[24] = w & 0xff;
  out[25] = (w >>> 8) & 0xff;
  out[26] = (w >>> 16) & 0xff;
  out[27] = h & 0xff;
  out[28] = (h >>> 8) & 0xff;
  out[29] = (h >>> 16) & 0xff;
  return out;
}

function webpVp8l(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(26);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  out[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  out[21] = bits & 0xff;
  out[22] = (bits >>> 8) & 0xff;
  out[23] = (bits >>> 16) & 0xff;
  out[24] = (bits >>> 24) & 0xff;
  return out;
}

const PEER: RequestContext = {
  remoteAddress: "127.0.0.1",
  upgrade: () => false,
};

function setupWorld(options?: { maxProjectBytes?: number }) {
  const clock: Clock = {
    now: () => 1_700_000_000_000,
    schedule: () => () => {},
  };
  const storage = createMemoryStorage({ now: clock.now });
  const home = { kind: "project" as const, id: PROJECT };
  storage.directory.place(PROJECT_INDEX, home, "index", "owner");
  storage.directory.place(SCRIPT, home, "script", "owner");
  storage.directory.setRole(PROJECT_INDEX, "owner", "owner", []);
  storage.directory.setRole(PROJECT_INDEX, "editor", "edit", []);
  storage.directory.setRole(PROJECT_INDEX, "viewer", "view", []);
  storage.directory.setRole(PROJECT_INDEX, "commenter", "comment", []);

  const draftReaders = {
    isDraftReader: (userId: string, docId: string) =>
      userId === "draftReader" && docId === SCRIPT,
  };
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: clock.now,
  });
  const assets =
    options?.maxProjectBytes === undefined
      ? undefined
      : createAssetsService({
          storage,
          clock,
          draftReaders,
          maxProjectBytes: options.maxProjectBytes,
        });
  const server = createServer({
    http: {
      allowedHosts: ["localhost:4747"],
      openUrl: "http://localhost:4747",
      webDir: null,
    },
    auth: {
      signIn: {
        describe: () => ({ choices: [] }),
        authenticate: async () => ({ ok: false, reason: "bad_request" }),
      },
      directory: USERS,
      sessions,
    },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: clock.now }),
      versions: { current: V, min: V },
      allowedOrigins: ["http://localhost:4747"],
    },
    sync: {
      storage,
      clock,
      defer: (fn) => fn(),
      ids: () => crypto.randomUUID(),
      registry: PRODUCT_SETTING_RULES,
      draftReaders,
    },
    assets,
  });

  const tokenOf = (userId: string) => sessions.issue(userId);
  const send = async (
    method: "PUT" | "GET" | "HEAD",
    userId: string | null,
    projectId: string,
    assetId: string,
    opts?: { body?: Uint8Array<ArrayBuffer>; headers?: Record<string, string> },
  ): Promise<Response> => {
    const headers: Record<string, string> = { ...opts?.headers };
    if (userId !== null) headers.Authorization = `Bearer ${tokenOf(userId)}`;
    const init: RequestInit = { method, headers };
    if (opts?.body !== undefined) init.body = opts.body;
    const req = new Request(
      `http://localhost:4747/api/projects/${projectId}/assets/${assetId}`,
      init,
    );
    const res = await server.fetch(req, PEER);
    return res!;
  };

  return { server, storage, send };
}

test("sniffs PNG, JPEG, WebP VP8L and WebP VP8X dimensions purely from binary headers", () => {
  expect(sniffImageHeader(pngHeader(1280, 720))).toEqual({
    ok: true,
    mime: "image/png",
    width: 1280,
    height: 720,
  });
  expect(sniffImageHeader(jpegHeader(640, 480))).toEqual({
    ok: true,
    mime: "image/jpeg",
    width: 640,
    height: 480,
  });
  expect(sniffImageHeader(webpVp8x(1920, 1080))).toEqual({
    ok: true,
    mime: "image/webp",
    width: 1920,
    height: 1080,
  });
  expect(sniffImageHeader(webpVp8l(800, 600))).toEqual({
    ok: true,
    mime: "image/webp",
    width: 800,
    height: 600,
  });
});

test("enforces PUT/GET/HEAD project-home roles, draft-reader access, ETag and strict security headers", async () => {
  const { send } = setupWorld();
  const png = pngHeader(640, 360);
  const id = sha256Hex(png);

  // Unauthenticated -> 401
  expect((await send("PUT", null, PROJECT, id, { body: png })).status).toBe(
    401,
  );
  expect((await send("GET", null, PROJECT, id)).status).toBe(401);

  // Can view, Can comment, Draft reader, Outsider -> PUT 403
  for (const who of ["viewer", "commenter", "draftReader", "outsider"]) {
    expect((await send("PUT", who, PROJECT, id, { body: png })).status).toBe(
      403,
    );
  }

  // Editor uploads PNG -> 201, repeat -> 200 (idempotent)
  const first = await send("PUT", "editor", PROJECT, id, { body: png });
  expect(first.status).toBe(201);
  expect(first.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await first.json()).toEqual({
    assetId: id,
    mime: "image/png",
    byteLength: png.byteLength,
    width: 640,
    height: 360,
    createdByUserId: "editor",
    createdAt: 1_700_000_000_000,
  });
  expect((await send("PUT", "owner", PROJECT, id, { body: png })).status).toBe(
    200,
  );

  // Owner, editor, viewer, commenter, draftReader can GET & HEAD with strict security headers
  for (const who of ["owner", "editor", "viewer", "commenter", "draftReader"]) {
    const head = await send("HEAD", who, PROJECT, id);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("image/png");
    expect(head.headers.get("content-length")).toBe(String(png.byteLength));
    expect(head.headers.get("etag")).toBe(`"${id}"`);
    expect(head.headers.get("x-content-type-options")).toBe("nosniff");
    expect(head.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(head.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );

    const get = await send("GET", who, PROJECT, id);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(png);
  }

  // Conditional GET returns 304 Not Modified
  const notModified = await send("GET", "viewer", PROJECT, id, {
    headers: { "If-None-Match": `"${id}"` },
  });
  expect(notModified.status).toBe(304);

  // Non-member GET & HEAD -> 403
  expect((await send("GET", "outsider", PROJECT, id)).status).toBe(403);
  expect((await send("HEAD", "outsider", PROJECT, id)).status).toBe(403);

  // Member requesting non-existent asset -> 404
  expect((await send("GET", "owner", PROJECT, "f".repeat(64))).status).toBe(
    404,
  );
});

test("rejects SHA-256 mismatch (400), SVG/HTML polyglot (415), >4096px (422), >5 MiB (413) and >200 MiB project quota (413)", async () => {
  const { send } = setupWorld();
  const png = pngHeader(100, 100);

  // SHA-256 mismatch -> 400
  expect(
    (await send("PUT", "owner", PROJECT, "0".repeat(64), { body: png })).status,
  ).toBe(400);

  // SVG -> 415
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  expect(
    (
      await send("PUT", "owner", PROJECT, sha256Hex(svg), {
        body: svg,
        headers: { "Content-Type": "image/png" },
      })
    ).status,
  ).toBe(415);

  // HTML -> 415
  const html = new TextEncoder().encode(
    "<!DOCTYPE html><html><body>x</body></html>",
  );
  expect(
    (await send("PUT", "owner", PROJECT, sha256Hex(html), { body: html }))
      .status,
  ).toBe(415);

  // Dimensions > 4096 -> 422 (PNG, JPEG, WebP)
  for (const oversized of [
    pngHeader(4097, 10),
    jpegHeader(10, 4097),
    webpVp8x(4097, 4097),
  ]) {
    expect(
      (
        await send("PUT", "owner", PROJECT, sha256Hex(oversized), {
          body: oversized,
        })
      ).status,
    ).toBe(422);
  }

  // Body > 5 MiB -> 413
  const tooBig = pngHeader(10, 10, MAX_ASSET_BYTES);
  expect(
    (
      await send("PUT", "owner", PROJECT, sha256Hex(tooBig), {
        body: tooBig,
      })
    ).status,
  ).toBe(413);

  // Project quota exceeded -> 413 and nothing stored
  const capped = setupWorld({ maxProjectBytes: 60 });
  const imgA = pngHeader(10, 10); // 33 bytes
  const imgB = pngHeader(20, 20); // 33 bytes -> total 66 > 60
  expect(
    (
      await capped.send("PUT", "owner", PROJECT, sha256Hex(imgA), {
        body: imgA,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await capped.send("PUT", "owner", PROJECT, sha256Hex(imgB), {
        body: imgB,
      })
    ).status,
  ).toBe(413);
  expect(
    (await capped.send("HEAD", "owner", PROJECT, sha256Hex(imgB))).status,
  ).toBe(404);
});
