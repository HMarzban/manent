import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import type {
  ControlStatusResponse,
  MeResponse,
  SignInResponse,
} from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { startSupervisor } from "../demo/supervisor.ts";
import type { Supervisor, SupervisorOptions } from "../demo/supervisor.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const TOKEN = "launch-token";
const SLOW = { timeout: 20_000 };

const trees = createTempTrees("manent supervisor ");
afterAll(() => trees.removeAll());

function freePort(): number {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port!;
  void probe.stop(true);
  return port;
}

let options: SupervisorOptions;
let appUrl: string;
let healthUrl: string;
let shutdowns: number;
let resets: { serverDown: boolean }[];
const started: Supervisor[] = [];
let s: Supervisor;

beforeEach(async () => {
  const port = freePort();
  appUrl = `http://127.0.0.1:${port}`;
  healthUrl = `${appUrl}/health`;
  shutdowns = 0;
  resets = [];
  options = {
    command: [process.execPath, "--no-orphans", "apps/server/src/main.ts"],
    env: {
      ...process.env,
      MANENT_DEMO: "1",
      MANENT_PORT: String(port),
      MANENT_DATA_DIR: await trees.tree({}),
    },
    cwd: repoRoot,
    healthUrl,
    controlPort: freePort(),
    token: TOKEN,
    allowedOrigins: [`http://localhost:${port}`],
    onReset: async () => {
      resets.push({ serverDown: !(await reachable(healthUrl)) });
    },
    onShutdown: () => {
      shutdowns += 1;
    },
  };
});

afterEach(async () => {
  await Promise.all(
    started.splice(0).map((supervisor) => supervisor.shutdown()),
  );
});

async function launch(
  overrides: Partial<SupervisorOptions> = {},
): Promise<Supervisor> {
  s = await startSupervisor({ ...options, ...overrides });
  started.push(s);
  return s;
}

function send(
  method: string,
  path: string,
  headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` },
): Promise<Response> {
  return fetch(s.controlUrl + path, { method, headers });
}

async function control(
  method: string,
  path: string,
): Promise<ControlStatusResponse> {
  return (await (await send(method, path)).json()) as ControlStatusResponse;
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    // refused or timed out: nothing answers there
    return false;
  }
}

async function until(
  predicate: () => boolean | Promise<boolean>,
): Promise<void> {
  for (let waited = 0; waited < 5000; waited += 50) {
    if (await predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error("the condition did not hold within 5 s");
}

async function signIn(userId: string): Promise<SignInResponse> {
  const response = await fetch(`${appUrl}/api/sign-in`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  return (await response.json()) as SignInResponse;
}

async function me(token: string): Promise<MeResponse> {
  const response = await fetch(`${appUrl}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await response.json()) as MeResponse;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH: no process has that id
    return false;
  }
}

const exitsAtOnce = [process.execPath, "-e", "process.exit(3)"];

test(
  "the supervisor starts the server and reports it",
  async () => {
    await (await launch()).startServer();
    const health = await fetch(healthUrl);
    expect(health.status).toBe(200);
    expect(await control("GET", "/status")).toEqual({ server: "running" });
  },
  SLOW,
);

test(
  "Stop the server kills it; Start the server brings it back",
  async () => {
    await (await launch()).startServer();
    await control("POST", "/stop-server");
    expect(await reachable(healthUrl)).toBe(false);
    expect(await control("GET", "/status")).toEqual({ server: "stopped" });
    await control("POST", "/start-server");
    expect(await reachable(healthUrl)).toBe(true);
  },
  SLOW,
);

test(
  "a session issued before a restart still resolves",
  async () => {
    await (await launch()).startServer();
    const { token } = await signIn("leo");
    await control("POST", "/stop-server");
    await control("POST", "/start-server");
    expect(await me(token)).toMatchObject({ userId: "leo", name: "Leo Marsh" });
  },
  SLOW,
);

test(
  "a server stopped on request is never said to have stopped by itself",
  async () => {
    const stderr = spyOn(console, "error").mockImplementation(() => {});
    try {
      await (await launch()).startServer();
      expect(await control("POST", "/stop-server")).toEqual({
        server: "stopped",
      });
      expect(stderr.mock.calls).toEqual([]);
    } finally {
      stderr.mockRestore();
    }
  },
  SLOW,
);

test(
  "startServer rejects in one sentence when the server exits first",
  async () => {
    await launch({ command: exitsAtOnce });
    await expect(s.startServer()).rejects.toThrow(
      "The server could not start.",
    );
    expect(s.serverState()).toBe("failed");
  },
  SLOW,
);

test(
  "the control API listens on loopback, needs the launch token and answers only the app's origin",
  async () => {
    await launch();
    const appOrigin = options.allowedOrigins[0]!;
    expect(s.controlUrl.startsWith("http://127.0.0.1:")).toBe(true);
    const missing = await send("GET", "/status", {});
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "unauthenticated" });
    const wrong = await send("GET", "/status", {
      Authorization: "Bearer not-the-token",
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "unauthenticated" });
    const unknown = await send("GET", "/nope");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });
    const foreign = await send("GET", "/status", {
      Authorization: `Bearer ${TOKEN}`,
      Origin: "http://evil.example",
    });
    expect(await foreign.json()).toEqual({ server: "stopped" });
    for (const name of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "Vary",
    ])
      expect(foreign.headers.get(name)).toBeNull();
    const preflight = await send("OPTIONS", "/status", { Origin: appOrigin });
    expect(preflight.status).toBe(204);
    expect({
      origin: preflight.headers.get("Access-Control-Allow-Origin"),
      methods: preflight.headers.get("Access-Control-Allow-Methods"),
      headers: preflight.headers.get("Access-Control-Allow-Headers"),
      vary: preflight.headers.get("Vary"),
    }).toEqual({
      origin: appOrigin,
      methods: "GET, POST",
      headers: "Authorization",
      vary: "Origin",
    });
    const allowed = await send("GET", "/status", {
      Authorization: `Bearer ${TOKEN}`,
      Origin: appOrigin,
    });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(appOrigin);
  },
  SLOW,
);

test(
  "a request for the state it is already in is a no-op",
  async () => {
    await (await launch()).startServer();
    const pid = s.serverPid();
    expect(await control("POST", "/start-server")).toEqual({
      server: "running",
    });
    expect(s.serverPid()).toBe(pid);
    await control("POST", "/stop-server");
    expect(await control("POST", "/stop-server")).toEqual({
      server: "stopped",
    });
  },
  SLOW,
);

test(
  "a start that does not work is answered, not thrown",
  async () => {
    await launch({ command: exitsAtOnce });
    const response = await send("POST", "/start-server");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ server: "failed" });
  },
  SLOW,
);

test(
  "/shutdown answers, then tells its owner once",
  async () => {
    await (await launch()).startServer();
    expect(await control("POST", "/shutdown")).toEqual({ server: "stopped" });
    await until(() => shutdowns === 1);
    expect(await reachable(healthUrl)).toBe(false);
    expect(await reachable(s.controlUrl + "/status")).toBe(false);
    expect(shutdowns).toBe(1);
  },
  SLOW,
);

test(
  "a server that dies by itself is started again",
  async () => {
    const stderr = spyOn(console, "error").mockImplementation(() => {});
    try {
      await (await launch()).startServer();
      const pid = s.serverPid()!;
      process.kill(pid, "SIGKILL");
      await until(
        async () =>
          s.serverState() === "running" && (await reachable(healthUrl)),
      );
      expect(s.serverPid()).not.toBe(pid);
      expect(stderr.mock.calls).toEqual([
        ["The server stopped by itself. Starting it again."],
      ]);
    } finally {
      stderr.mockRestore();
    }
  },
  SLOW,
);

test(
  "a server that keeps dying is given up after three restarts in ten seconds",
  async () => {
    const stderr = spyOn(console, "error").mockImplementation(() => {});
    try {
      await (await launch()).startServer();
      for (let restarts = 0; restarts < 3; restarts += 1) {
        const pid = s.serverPid()!;
        process.kill(pid, "SIGKILL");
        await until(
          () => s.serverState() === "running" && s.serverPid() !== pid,
        );
      }
      process.kill(s.serverPid()!, "SIGKILL");
      await until(() => s.serverState() === "failed");
      expect(s.serverPid()).toBeNull();
      expect(stderr.mock.calls).toEqual(
        Array.from({ length: 3 }, () => [
          "The server stopped by itself. Starting it again.",
        ]),
      );
    } finally {
      stderr.mockRestore();
    }
  },
  SLOW,
);

test(
  "a server that exits during shutdown is not started again",
  async () => {
    await (await launch()).startServer();
    process.kill(s.serverPid()!, "SIGKILL");
    await s.shutdown();
    await Bun.sleep(1000);
    expect(await reachable(healthUrl)).toBe(false);
  },
  SLOW,
);

test(
  "reset re-seeds while the server is down, then starts it",
  async () => {
    await (await launch()).startServer();
    expect(await control("POST", "/reset")).toEqual({ server: "running" });
    expect(resets).toEqual([{ serverDown: true }]);
    expect(await reachable(healthUrl)).toBe(true);
  },
  SLOW,
);

test(
  "a re-seed that does not work is answered, and the server is left down",
  async () => {
    const stderr = spyOn(console, "error").mockImplementation(() => {});
    try {
      await (
        await launch({
          onReset: () => Promise.reject(new Error("the disk is full")),
        })
      ).startServer();
      const response = await send("POST", "/reset");
      expect({
        status: response.status,
        type: response.headers.get("Content-Type"),
        body: await response.json(),
      }).toEqual({
        status: 200,
        type: "application/json;charset=utf-8",
        body: { server: "failed" },
      });
      expect(await reachable(healthUrl)).toBe(false);
      expect(s.serverPid()).toBeNull();
      expect(stderr.mock.calls).toEqual([]);
    } finally {
      stderr.mockRestore();
    }
  },
  SLOW,
);

test(
  "shutdown() leaves no server process, closes the control listener and does not call onShutdown",
  async () => {
    await (await launch()).startServer();
    const pid = s.serverPid()!;
    await s.shutdown();
    expect(isAlive(pid)).toBe(false);
    expect(s.serverPid()).toBeNull();
    expect(await reachable(s.controlUrl + "/status")).toBe(false);
    expect(shutdowns).toBe(0);
  },
  SLOW,
);
