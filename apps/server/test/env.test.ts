import { afterAll, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SignInResponse } from "@manent/sync-protocol";
import { readServerEnv } from "../src/env.ts";
import { buildServerConfig, startServer } from "../src/main.ts";

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

test("the defaults are loopback and port 4747", () => {
  expect(readServerEnv({ MANENT_DEMO: "1" })).toEqual({
    port: 4747,
    lanHost: null,
    dataDir: ".manent-demo",
    webDir: "apps/web/dist",
    control: null,
  });
});

test("every setting is read from its variable", () => {
  expect(
    readServerEnv({
      MANENT_DEMO: "1",
      MANENT_PORT: "4800",
      MANENT_DATA_DIR: "/tmp/d",
      MANENT_WEB_DIR: "/tmp/w",
      MANENT_CONTROL_URL: "http://127.0.0.1:4748",
      MANENT_CONTROL_TOKEN: "abc",
    }),
  ).toEqual({
    port: 4800,
    lanHost: null,
    dataDir: "/tmp/d",
    webDir: "/tmp/w",
    control: { url: "http://127.0.0.1:4748", token: "abc" },
  });
});

test("without demo mode the server does not start", () => {
  for (const env of [{}, { MANENT_DEMO: "0" }, { MANENT_DEMO: "true" }]) {
    expect(() => readServerEnv(env)).toThrow(
      "This build has only the demo sign-in. Start it with `make demo`.",
    );
  }
});

test("only a private address may be added", () => {
  expect(
    readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: "192.168.1.20" })
      .lanHost,
  ).toBe("192.168.1.20");
  expect(
    readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: "[fd12::1]" }).lanHost,
  ).toBe("fd12::1");
  for (const h of ["0.0.0.0", "8.8.8.8", "example.com"]) {
    expect(() =>
      readServerEnv({ MANENT_DEMO: "1", MANENT_LAN_HOST: h }),
    ).toThrow(/only starts on this machine or a private network/);
  }
});

test("a bad port or half a control pair is refused in one sentence", () => {
  for (const port of [
    "0",
    "70000",
    "abc",
    "47.5",
    "-1",
    "",
    " 4747",
    "4747abc",
  ]) {
    expect(() =>
      readServerEnv({ MANENT_DEMO: "1", MANENT_PORT: port }),
    ).toThrow("MANENT_PORT must be a port number.");
  }
  expect(() =>
    readServerEnv({
      MANENT_DEMO: "1",
      MANENT_CONTROL_URL: "http://127.0.0.1:4748",
    }),
  ).toThrow(
    "MANENT_CONTROL_URL and MANENT_CONTROL_TOKEN must be set together.",
  );
  expect(() =>
    readServerEnv({ MANENT_DEMO: "1", MANENT_CONTROL_TOKEN: "abc" }),
  ).toThrow(
    "MANENT_CONTROL_URL and MANENT_CONTROL_TOKEN must be set together.",
  );
});

test("the configuration names the server's own hosts", () => {
  const c = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), lanHost: "192.168.1.20" },
    new Uint8Array(32),
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
  );
  expect(local.http.allowedHosts).toEqual(["localhost:4747", "127.0.0.1:4747"]);
  expect(local.http.openUrl).toBe("http://localhost:4747");

  const v6 = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), lanHost: "FD12:0::1" },
    new Uint8Array(32),
  );
  expect(v6.http.allowedHosts.at(-1)).toBe("[fd12::1]:4747");
  expect(v6.http.openUrl).toBe("http://[fd12::1]:4747");
});

test("the seed's id is read from the data directory on each call", async () => {
  const dataDir = await tempDir();
  const c = buildServerConfig(
    { ...readServerEnv({ MANENT_DEMO: "1" }), dataDir },
    new Uint8Array(32),
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

test("the server listens on loopback and keeps its session key across restarts", async () => {
  const dataDir = await tempDir();
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port!;
  await probe.stop(true);
  const env = {
    ...readServerEnv({ MANENT_DEMO: "1" }),
    port,
    dataDir,
    webDir: join(dataDir, "web"),
  };

  const first = await startServer(env);
  expect(first.urls).toEqual([`http://127.0.0.1:${port}`]);
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  expect(await health.json()).toEqual({ ok: true });
  const signIn = await fetch(`http://127.0.0.1:${port}/api/sign-in`, {
    method: "POST",
    body: JSON.stringify({ userId: "sam" }),
  });
  const { token } = (await signIn.json()) as SignInResponse;
  const key = await readFile(join(dataDir, "session.key"));
  expect(key.length).toBe(32);
  expect((await stat(join(dataDir, "session.key"))).mode & 0o777).toBe(0o600);
  await first.stop();

  const second = await startServer(env);
  const me = await fetch(`http://127.0.0.1:${port}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(((await me.json()) as { userId: string }).userId).toBe("sam");
  expect(await readFile(join(dataDir, "session.key"))).toEqual(key);

  await expect(startServer(env)).rejects.toThrow(
    `Manent could not listen on port ${port}.`,
  );
  await second.stop();
});
