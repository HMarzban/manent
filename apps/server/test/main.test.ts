import { afterAll, afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeResponse, SignInResponse } from "@manent/sync-protocol";
import { readServerEnv } from "../src/env.ts";
import type { ServerEnv } from "../src/env.ts";
import { buildServerConfig, startServer } from "../src/main.ts";
import type { RunningServer } from "../src/main.ts";

const made: string[] = [];
afterAll(async () => {
  await Promise.all(
    made.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-server-"));
  made.push(dir);
  return dir;
}

const running: RunningServer[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()));
});

async function start(env: ServerEnv): Promise<RunningServer> {
  const server = await startServer(env);
  running.push(server);
  return server;
}

const envIn = (dataDir: string): ServerEnv => ({
  ...readServerEnv({ MANENT_DEMO: "1" }),
  port: 0,
  dataDir,
  webDir: join(dataDir, "web"),
});

test("the server reports the port it bound, and keeps its session key across restarts", async () => {
  const dataDir = await tempDir();
  const env = envIn(dataDir);
  const first = await start(env);
  expect(first.port).toBeGreaterThan(0);
  expect(first.urls).toEqual([`http://127.0.0.1:${first.port}`]);
  expect(await (await fetch(`${first.urls[0]}/health`)).json()).toEqual({
    ok: true,
  });
  const { token } = (await (
    await fetch(`${first.urls[0]}/api/sign-in`, {
      method: "POST",
      body: JSON.stringify({ userId: "sam" }),
    })
  ).json()) as SignInResponse;
  const key = await readFile(join(dataDir, "session.key"));
  expect(key.length).toBe(32);
  expect((await stat(join(dataDir, "session.key"))).mode & 0o777).toBe(0o600);
  await first.stop();
  const second = await start({ ...env, port: first.port });
  expect(
    (
      (await (
        await fetch(`${second.urls[0]}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()) as MeResponse
    ).userId,
  ).toBe("sam");
  expect(await readFile(join(dataDir, "session.key"))).toEqual(key);
});

test("a port that is taken is said in one sentence, with its cause", async () => {
  const env = envIn(await tempDir());
  const taken = await start({ ...env, port: 0 });
  const failure = await startServer({ ...env, port: taken.port }).catch(
    (e: unknown) => e,
  );
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(
    `Manent could not listen on 127.0.0.1:${taken.port}.`,
  );
  expect((failure as Error).cause).toBeDefined();
  expect((failure as Error).cause).toMatchObject({ code: "EADDRINUSE" });
});

test("a session key that cannot be read stops the server instead of signing everyone out", async () => {
  const dataDir = await tempDir();
  await mkdir(join(dataDir, "session.key"));
  await expect(startServer(envIn(dataDir))).rejects.toMatchObject({
    code: "EISDIR",
  });
  expect((await stat(join(dataDir, "session.key"))).isDirectory()).toBe(true);

  const writeOnly = await tempDir();
  const key = new Uint8Array(32).fill(5);
  await writeFile(join(writeOnly, "session.key"), key, { mode: 0o200 });
  await expect(startServer(envIn(writeOnly))).rejects.toMatchObject({
    code: "EACCES",
  });
  await chmod(join(writeOnly, "session.key"), 0o600);
  expect(
    new Uint8Array(await readFile(join(writeOnly, "session.key"))),
  ).toEqual(key);
});

test("the configuration names the server's own hosts", () => {
  const c = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), lanHost: "192.168.1.20" },
    new Uint8Array(32),
    4747,
  );
  expect(c.http.allowedHosts).toEqual([
    "localhost:4747",
    "127.0.0.1:4747",
    "192.168.1.20:4747",
  ]);
  expect(c.http.openUrl).toBe("http://192.168.1.20:4747");

  const local = buildServerConfig(
    readServerEnv({ MANENT_DEMO: "1" }),
    new Uint8Array(32),
    4747,
  );
  expect(local.http.allowedHosts).toEqual(["localhost:4747", "127.0.0.1:4747"]);
  expect(local.http.openUrl).toBe("http://localhost:4747");

  const v6 = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), lanHost: "FD12:0::1" },
    new Uint8Array(32),
    4747,
  );
  expect(v6.http.allowedHosts.at(-1)).toBe("[fd12::1]:4747");
  expect(v6.http.openUrl).toBe("http://[fd12::1]:4747");
});

test("the seed's id is read from the data directory on each call", async () => {
  const dataDir = await tempDir();
  const c = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), dataDir },
    new Uint8Array(32),
    4747,
  );
  expect(c.demo?.seedId()).toBeNull();
  await mkdir(join(dataDir, "data"));
  await writeFile(join(dataDir, "data", "seed.json"), "{broken");
  expect(c.demo?.seedId()).toBeNull();
  await writeFile(
    join(dataDir, "data", "seed.json"),
    JSON.stringify({ seedId: "seed-1", fingerprint: "f", manifest: {} }),
  );
  expect(c.demo?.seedId()).toBe("seed-1");
  await writeFile(
    join(dataDir, "data", "seed.json"),
    JSON.stringify({ seedId: 4 }),
  );
  expect(c.demo?.seedId()).toBeNull();
});
