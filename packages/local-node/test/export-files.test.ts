import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSignedSessionStore } from "@manent/server-core";
import { createFakeClock } from "@manent/sync-client/testing";
import { createShellChannel, localRoutes } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const BASE = "http://127.0.0.1:51234";
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "manent-export-files-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // ignore if already removed
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

function setup() {
  const records = createMemoryRecords();
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: () => 1_000,
  });
  records.savePerson({
    userId: "sam",
    name: "Sam Okafor",
    wantsCloud: true,
    cloudToken: null,
    chosenAt: 1,
  });
  const token = sessions.issue("sam");
  const routes = localRoutes({
    records,
    shell: createShellChannel({
      clock: createFakeClock(0).clock,
      heartbeatMs: 30_000,
    }),
    sessions,
    signInToSync: async () => ({ ok: true }),
    onFocus: () => {},
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    setConnection: () => {},
  });
  const post = async (
    body: unknown,
    authToken?: string,
  ): Promise<[number, unknown]> => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (authToken !== undefined)
      headers["authorization"] = `Bearer ${authToken}`;
    const response = await routes(
      new Request(`${BASE}/api/local/export-file`, {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    if (response === null) return [0, null];
    const text = await response.text();
    return [response.status, text === "" ? null : JSON.parse(text)];
  };
  return { token, sessions, post };
}

test("POST /api/local/export-file writes exact decoded bytes atomically and cleans up temp file", async () => {
  const { token, post } = setup();
  const folder = makeTempDir();
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 255, 0, 42]);
  const subfolder = "Manent export 17 Nov 2026";
  const name = "The Long Night.zip";

  const result = await post(
    { folder, subfolder, name, bytes: payload.toBase64() },
    token,
  );
  expect(result).toEqual([204, null]);

  const targetDir = join(folder, subfolder);
  const targetFile = join(targetDir, name);
  expect(existsSync(targetFile)).toBe(true);
  expect(new Uint8Array(readFileSync(targetFile))).toEqual(payload);
  expect(readdirSync(targetDir)).toEqual([name]);
});

test("POST /api/local/export-file rejects missing, forged, or unknown auth tokens", async () => {
  const { sessions, post } = setup();
  const folder = makeTempDir();
  const body = {
    folder,
    subfolder: "Manent export 17 Nov 2026",
    name: "Project.zip",
    bytes: new Uint8Array([1, 2, 3]).toBase64(),
  };

  expect(await post(body)).toEqual([401, { error: "unauthenticated" }]);
  expect(await post(body, "v1.forged")).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  expect(await post(body, sessions.issue("nobody"))).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
});

test("POST /api/local/export-file rejects invalid folders, path traversal, non-zip names, and malformed base64", async () => {
  const { token, post } = setup();
  const folder = makeTempDir();
  const regularFile = join(folder, "not-a-dir.txt");
  writeFileSync(regularFile, "hello");
  const validBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06]).toBase64();

  const badBodies: unknown[] = [
    "not json{",
    null,
    {},
    { folder: "", subfolder: "sub", name: "a.zip", bytes: validBytes },
    {
      folder: "relative/path",
      subfolder: "sub",
      name: "a.zip",
      bytes: validBytes,
    },
    {
      folder: join(folder, "missing-dir"),
      subfolder: "sub",
      name: "a.zip",
      bytes: validBytes,
    },
    { folder: regularFile, subfolder: "sub", name: "a.zip", bytes: validBytes },
    {
      folder: `/${"a".repeat(4100)}`,
      subfolder: "sub",
      name: "a.zip",
      bytes: validBytes,
    },
    { folder, subfolder: "", name: "a.zip", bytes: validBytes },
    { folder, subfolder: ".", name: "a.zip", bytes: validBytes },
    { folder, subfolder: "..", name: "a.zip", bytes: validBytes },
    { folder, subfolder: "../escape", name: "a.zip", bytes: validBytes },
    { folder, subfolder: "a/b", name: "a.zip", bytes: validBytes },
    { folder, subfolder: "a\\b", name: "a.zip", bytes: validBytes },
    { folder, subfolder: "a\0b", name: "a.zip", bytes: validBytes },
    {
      folder,
      subfolder: "s".repeat(121),
      name: "a.zip",
      bytes: validBytes,
    },
    { folder, subfolder: "sub", name: "", bytes: validBytes },
    { folder, subfolder: "sub", name: ".zip", bytes: validBytes },
    { folder, subfolder: "sub", name: "project.txt", bytes: validBytes },
    { folder, subfolder: "sub", name: "../a.zip", bytes: validBytes },
    { folder, subfolder: "sub", name: "a/b.zip", bytes: validBytes },
    { folder, subfolder: "sub", name: "a\\b.zip", bytes: validBytes },
    { folder, subfolder: "sub", name: "a\0b.zip", bytes: validBytes },
    {
      folder,
      subfolder: "sub",
      name: `${"n".repeat(197)}.zip`,
      bytes: validBytes,
    },
    { folder, subfolder: "sub", name: "a.zip", bytes: "not!valid!base64" },
  ];

  for (const body of badBodies) {
    expect(await post(body, token)).toEqual([400, { error: "bad_request" }]);
  }
});

test("POST /api/local/export-file returns 500 and cleans up when target directory cannot be created", async () => {
  const { token, post } = setup();
  const folder = makeTempDir();
  // Block subfolder creation by placing a regular file where the subfolder would go
  writeFileSync(join(folder, "Manent export 17 Nov 2026"), "occupied");

  const [status, body] = await post(
    {
      folder,
      subfolder: "Manent export 17 Nov 2026",
      name: "Project.zip",
      bytes: new Uint8Array([1, 2, 3]).toBase64(),
    },
    token,
  );
  expect(status).toBe(500);
  expect(body).toEqual({ error: "unreachable" });
});

test("POST /api/local/export-file refuses symlinked subfolder", async () => {
  const { token, post } = setup();
  const folder = makeTempDir();
  const outside = makeTempDir();
  symlinkSync(outside, join(folder, "Manent export 17 Nov 2026"));

  const [status, body] = await post(
    {
      folder,
      subfolder: "Manent export 17 Nov 2026",
      name: "Project.zip",
      bytes: new Uint8Array([1, 2, 3]).toBase64(),
    },
    token,
  );
  expect(status).toBe(500);
  expect(body).toEqual({ error: "unreachable" });
  expect(readdirSync(outside)).toEqual([]);
});
