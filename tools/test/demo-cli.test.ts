import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cp, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { bindRefusal } from "@manent/demo";
import type { DemoResponse } from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { pickLanAddress } from "../demo/preflight.ts";
import { ensureSeed, resetSeed } from "../demo/seed.ts";
import type { SeedFile } from "../demo/seed.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const RUN = { timeout: 240_000 };

const trees = createTempTrees("manent demo ");
afterAll(() => trees.removeAll(), 30_000);
// each demo builds the web app here, never into apps/web/dist, which an e2e server may be serving
const webDir = await trees.tree({});
// strip FORCE_COLOR from bun test --parallel workers so CLI stderr stays deterministic plain text
const { FORCE_COLOR: _ignoredForceColor, ...baseEnv } = process.env;
const demoEnv = { ...baseEnv, MANENT_WEB_DIR: webDir, NO_COLOR: "1" };
// seeded once for the file and copied into each demo's folder, so that no test seeds more than once
const seeded = await trees.tree({});
// what that first seed of an empty folder answered
let seededAs = "";
beforeAll(async () => {
  seededAs = await ensureSeed(seeded);
}, RUN);

/** A new folder holding a copy of the file's seeded data. */
async function seededCopy(): Promise<string> {
  const dir = await trees.tree({});
  await cp(join(seeded, "data"), join(dir, "data"), { recursive: true });
  return dir;
}

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

const seedPath = (dir: string) => join(dir, "data", "seed.json");
const runPath = (dir: string) => join(dir, "run.json");

async function readSeed(dir: string): Promise<SeedFile> {
  return (await Bun.file(seedPath(dir)).json()) as SeedFile;
}

async function writeSeed(dir: string, file: SeedFile): Promise<void> {
  await Bun.write(seedPath(dir), JSON.stringify(file, null, 2) + "\n");
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
  limitMs = 5000,
): Promise<void> {
  for (let waited = 0; waited < limitMs; waited += 50) {
    if (await predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error(`the condition did not hold within ${limitMs} ms`);
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

interface Finished {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function cli(
  args: string[],
  env: Record<string, string> = {},
): Promise<Finished> {
  const child = Bun.spawn([process.execPath, "tools/demo/cli.ts", ...args], {
    cwd: repoRoot,
    env: { ...demoEnv, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

interface Place {
  dir: string;
  port: number;
  controlPort: number;
}

/** A folder holding a copy of the file's seeded data, and two free ports. */
async function place(): Promise<Place> {
  return {
    dir: await seededCopy(),
    port: freePort(),
    controlPort: freePort(),
  };
}

const demoArgs = (at: Place, extra: string[] = []) => [
  "demo",
  "--no-open",
  "--port",
  String(at.port),
  "--control-port",
  String(at.controlPort),
  "--data-dir",
  at.dir,
  ...extra,
];

interface Demo {
  child: Bun.Subprocess<"ignore", "pipe", "pipe">;
  output(): string;
}

const demos: { demo: Demo; at: Place }[] = [];
afterEach(async () => {
  for (const { demo, at } of demos.splice(0)) {
    if (isAlive(demo.child.pid)) await cli(["stop", "--data-dir", at.dir]);
    demo.child.kill("SIGKILL");
    await demo.child.exited;
  }
}, 30_000);

/** Starts `demo` in the background; resolves once it says it is running, or once it exits. */
async function startDemo(
  at: Place,
  extra: string[] = [],
  env: Record<string, string> = {},
): Promise<Demo> {
  const child = Bun.spawn(
    [process.execPath, "tools/demo/cli.ts", ...demoArgs(at, extra)],
    {
      cwd: repoRoot,
      env: { ...demoEnv, ...env },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let text = "";
  void (async () => {
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream()))
      text += chunk;
  })();
  const demo = { child, output: () => text };
  demos.push({ demo, at });
  let exited = false;
  void child.exited.then(() => {
    exited = true;
  });
  await until(() => exited || text.includes("Press Ctrl+C"), 210_000);
  return demo;
}

async function readRun(
  dir: string,
): Promise<{ pid: number; serverPid: number }> {
  return (await Bun.file(runPath(dir)).json()) as {
    pid: number;
    serverPid: number;
  };
}

async function demoInfo(port: number): Promise<DemoResponse> {
  return (await (
    await fetch(`http://127.0.0.1:${port}/api/demo`)
  ).json()) as DemoResponse;
}

test(
  "seeding creates the data once; a reset keeps the content and changes the id",
  async () => {
    expect(seededAs).toBe("created");
    const dir = await seededCopy();
    const first = await readSeed(dir);
    expect(await ensureSeed(dir)).toBe("present");
    const second = await resetSeed(dir);
    expect(second.manifest).toEqual(first.manifest);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.seedId).not.toBe(first.seedId);
    expect(await readSeed(dir)).toEqual(second);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  },
  RUN,
);

test(
  "a seed.json with another fingerprint is reported stale",
  async () => {
    const dir = await trees.tree({});
    await ensureSeed(dir);
    await writeSeed(dir, {
      ...(await readSeed(dir)),
      fingerprint: "0".repeat(64),
    });
    expect(await ensureSeed(dir)).toBe("stale");
    await Bun.write(seedPath(dir), '{"seedId":');
    expect(await ensureSeed(dir)).toBe("stale");
  },
  RUN,
);

test(
  "/api/demo carries a seedId that changes on reset",
  async () => {
    const at = await place();
    await startDemo(at);
    const before = (await demoInfo(at.port)).seedId;
    expect(before).toMatch(/^[0-9a-f-]{36}$/);
    expect(await cli(["reset", "--data-dir", at.dir])).toEqual({
      exitCode: 0,
      stdout: "The demo data was seeded again.\n",
      stderr: "",
    });
    const after = (await demoInfo(at.port)).seedId;
    expect(after).toMatch(/^[0-9a-f-]{36}$/);
    expect(after).not.toBe(before);
  },
  RUN,
);

const staticImports = async (file: string) =>
  new Bun.Transpiler({ loader: "ts" })
    .scanImports(await Bun.file(join(repoRoot, file)).text())
    .filter((i) => i.kind === "import-statement")
    .map((i) => i.path);

test("the command can start before anything is installed", async () => {
  expect(await staticImports("tools/demo/cli.ts")).toEqual(["./preflight.ts"]);
  for (const path of await staticImports("tools/demo/preflight.ts"))
    expect(path.startsWith("node:")).toBe(true);
});

test(
  "LAN mode is off when LAN is empty",
  async () => {
    const at = await place();
    const demo = await startDemo(at, [], { LAN: "" });
    expect(demo.output()).toContain(
      `Manent is running at http://localhost:${at.port}\n`,
    );
    expect(demo.output()).not.toContain("On your network:");
    expect((await demoInfo(at.port)).demo).toBe(true);
    const lan = pickLanAddress(networkInterfaces());
    if (lan !== null)
      expect(await reachable(`http://${lan}:${at.port}/health`)).toBe(false);

    const elsewhere = await place();
    const refused = await cli(
      demoArgs(elsewhere, ["--lan-host", "192.168.255.254"]),
      { LAN: "1" },
    );
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("The server could not start.\n");
    expect(refused.stderr).not.toContain("    at ");
  },
  RUN,
);

test(
  "demo refuses a public address in one sentence",
  async () => {
    const refused = await cli(
      demoArgs(await place(), ["--lan-host", "8.8.8.8"]),
    );
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toBe(`${bindRefusal("8.8.8.8", "public")}\n`);
    expect(refused.stderr).not.toContain("    at ");
  },
  RUN,
);

test(
  "demo says when its port is taken",
  async () => {
    const at = await place();
    const holder = Bun.serve({
      hostname: "127.0.0.1",
      port: at.port,
      fetch: () => new Response(),
    });
    try {
      expect(await cli(demoArgs(at))).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: `Port ${at.port} is in use. Stop what is using it, or run make stop if that is Manent.\n`,
      });
    } finally {
      await holder.stop(true);
    }
  },
  RUN,
);

test(
  "a second demo joins the first and leaves its files alone",
  async () => {
    const at = await place();
    await startDemo(at);
    const run = await readRun(at.dir);
    const built = (await stat(join(webDir, "index.html"))).mtimeMs;
    expect(await cli(demoArgs(at))).toEqual({
      exitCode: 0,
      stdout: `Manent is already running at http://localhost:${at.port}\n`,
      stderr: "",
    });
    expect(await readRun(at.dir)).toEqual(run);
    expect(isAlive(run.serverPid)).toBe(true);
    expect((await stat(join(webDir, "index.html"))).mtimeMs).toBe(built);
  },
  RUN,
);

test(
  "SIGINT and SIGHUP exit 0, leaving no server and no run.json",
  async () => {
    for (const signal of ["SIGINT", "SIGHUP"] as const) {
      const at = await place();
      const demo = await startDemo(at);
      const { serverPid } = await readRun(at.dir);
      if (process.platform === "win32")
        await cli(["stop", "--data-dir", at.dir]);
      else demo.child.kill(signal);
      expect(await demo.child.exited).toBe(0);
      expect(await Bun.file(runPath(at.dir)).exists()).toBe(false);
      expect(isAlive(serverPid)).toBe(false);
      expect(await reachable(`http://127.0.0.1:${at.port}/health`)).toBe(false);
    }
  },
  RUN,
);

test(
  "a killed demo leaves a stale run.json that the next command clears",
  async () => {
    const at = await place();
    const demo = await startDemo(at);
    demo.child.kill("SIGKILL");
    await demo.child.exited;
    expect(await Bun.file(runPath(at.dir)).exists()).toBe(true);
    expect(await cli(["stop", "--data-dir", at.dir])).toEqual({
      exitCode: 0,
      stdout: "Stopped.\n",
      stderr: "",
    });
    expect(await Bun.file(runPath(at.dir)).exists()).toBe(false);
    expect(await reachable(`http://127.0.0.1:${at.port}/health`)).toBe(false);
    const next = await startDemo(at);
    expect(next.output()).toContain(
      `Manent is running at http://localhost:${at.port}\n`,
    );
    expect(await reachable(`http://127.0.0.1:${at.port}/health`)).toBe(true);
  },
  RUN,
);

test(
  "a stale run.json whose server is still alive has that server stopped",
  async () => {
    const at = await place();
    const server = Bun.spawn([process.execPath, "apps/server/src/main.ts"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        MANENT_DEMO: "1",
        MANENT_PORT: String(at.port),
        MANENT_DATA_DIR: at.dir,
      },
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      await until(
        () => reachable(`http://127.0.0.1:${at.port}/health`),
        20_000,
      );
      await Bun.write(
        runPath(at.dir),
        JSON.stringify({
          pid: server.pid,
          serverPid: server.pid,
          appUrl: `http://localhost:${at.port}`,
          controlUrl: `http://127.0.0.1:${at.controlPort}`,
          token: "stale-token",
        }),
      );
      expect(await cli(["stop", "--data-dir", at.dir])).toEqual({
        exitCode: 0,
        stdout: "Stopped.\n",
        stderr: "",
      });
      await server.exited;
      // Windows ends a process without a signal, so none is reported
      if (process.platform !== "win32")
        expect(server.signalCode).toBe("SIGKILL");
      expect(await reachable(`http://127.0.0.1:${at.port}/health`)).toBe(false);
      expect(await Bun.file(runPath(at.dir)).exists()).toBe(false);
    } finally {
      server.kill("SIGKILL");
    }
  },
  RUN,
);

test(
  "stop returns only when the next demo can start",
  async () => {
    const at = await place();
    await startDemo(at);
    expect(await cli(["stop", "--data-dir", at.dir])).toEqual({
      exitCode: 0,
      stdout: "Stopped.\n",
      stderr: "",
    });
    expect(await Bun.file(runPath(at.dir)).exists()).toBe(false);
    const next = await startDemo(at);
    expect(next.output()).toContain(
      `Manent is running at http://localhost:${at.port}\n`,
    );
    expect(
      await (await fetch(`http://127.0.0.1:${at.port}/health`)).json(),
    ).toEqual({ ok: true });
  },
  RUN,
);

test("stop says so when nothing is running", async () => {
  expect(await cli(["stop", "--data-dir", await trees.tree({})])).toEqual({
    exitCode: 0,
    stdout: "Nothing is running.\n",
    stderr: "",
  });
});

test(
  "reset says what it did",
  async () => {
    const dir = await trees.tree({});
    expect(await cli(["reset", "--data-dir", dir])).toEqual({
      exitCode: 0,
      stdout: "The demo data was seeded again.\n",
      stderr: "",
    });
    expect(await ensureSeed(dir)).toBe("present");
  },
  RUN,
);

/** A control listener that answers `/status` as running and `path` with `reply`; run.json in `dir` points at it. */
async function standIn(
  dir: string,
  path: string,
  reply: () => Response,
): Promise<Bun.Server<undefined>> {
  const listener = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const asked = new URL(request.url).pathname;
      if (asked === "/status") return Response.json({ server: "running" });
      return asked === path ? reply() : new Response(null, { status: 404 });
    },
  });
  await Bun.write(
    runPath(dir),
    JSON.stringify({
      pid: process.pid,
      serverPid: process.pid,
      // its /health is a 404, so a stale reading never kills serverPid
      appUrl: `http://localhost:${listener.port}`,
      controlUrl: `http://127.0.0.1:${listener.port}`,
      token: "stand-in-token",
    }),
  );
  return listener;
}

const notRunning: [string, () => Response][] = [
  ["failed", () => Response.json({ server: "failed" })],
  ["stopped", () => Response.json({ server: "stopped" })],
  ["a 500", () => new Response("<h1>500</h1>", { status: 500 })],
  ["no state", () => Response.json({ server: "broken" })],
];

test("reset says the server could not start when the demo does not come back", async () => {
  for (const [answer, reply] of notRunning) {
    const dir = await trees.tree({});
    const listener = await standIn(dir, "/reset", reply);
    try {
      expect({ answer, ...(await cli(["reset", "--data-dir", dir])) }).toEqual({
        answer,
        exitCode: 1,
        stdout: "",
        stderr: "The server could not start.\n",
      });
    } finally {
      await listener.stop(true);
    }
  }
});

test("a second demo whose server cannot start is not said to be running", async () => {
  for (const [answer, reply] of notRunning) {
    const at = await place();
    const listener = await standIn(at.dir, "/start-server", reply);
    try {
      expect({ answer, ...(await cli(demoArgs(at))) }).toEqual({
        answer,
        exitCode: 1,
        stdout: "",
        stderr: "The server could not start.\n",
      });
    } finally {
      await listener.stop(true);
    }
  }
});

test("desktop needs a running demo and says so", async () => {
  const dataDir = await trees.tree({});
  expect(await cli(["desktop", "--data-dir", dataDir])).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Manent is not running. Run make demo first, then make desktop.\n",
  });
});
