import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import type { HealthResponse } from "@manent/sync-protocol";

const repoRoot = join(import.meta.dir, "..", "..");
const HEALTH_POLL_MS = 250;
const PORTS = { port: 4767, controlPort: 4768 };

const trees = createTempTrees("manent ");
const started: Bun.Subprocess[] = [];
afterAll(async () => {
  // a test that ends early leaves no demo running
  for (const demo of started) demo.kill();
  await Promise.allSettled(started.map((demo) => demo.exited));
  await trees.removeAll();
}, 60_000);

interface DemoOptions {
  port: number;
  controlPort: number;
  env?: Record<string, string>;
}

/** The demo command in `dir`, started as a tester would, without opening a browser. */
function startDemo(dir: string, options: DemoOptions): Bun.Subprocess {
  const demo = Bun.spawn(
    [
      process.execPath,
      "tools/demo/cli.ts",
      "demo",
      "--no-open",
      "--port",
      String(options.port),
      "--control-port",
      String(options.controlPort),
    ],
    {
      cwd: dir,
      env: { ...process.env, ...options.env },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
    },
  );
  started.push(demo);
  return demo;
}

/** The health answer of the demo's server once it gives one; null when `demo` exits first or `limitMs` passes. */
async function healthWithin(
  demo: Bun.Subprocess,
  limitMs: number,
): Promise<HealthResponse | null> {
  for (
    let waited = 0;
    waited < limitMs && demo.exitCode === null;
    waited += HEALTH_POLL_MS
  ) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORTS.port}/health`, {
        signal: AbortSignal.timeout(HEALTH_POLL_MS * 4),
      });
      if (response.ok) return (await response.json()) as HealthResponse;
    } catch {
      // nothing answers yet
    }
    await Bun.sleep(HEALTH_POLL_MS);
  }
  return null;
}

/** Runs the stop command in `dir`; it returns once both ports are free. */
async function stopDemo(dir: string): Promise<number> {
  return Bun.spawn([process.execPath, "tools/demo/cli.ts", "stop"], {
    cwd: dir,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  }).exited;
}

test("a fresh clone starts", async () => {
  // a path with spaces
  const dir = join(await trees.tree({}), "fresh clone");
  await Bun.$`git clone --quiet ${repoRoot} ${dir}`;
  const first = startDemo(dir, PORTS);
  expect(await healthWithin(first, 240_000)).toEqual({ ok: true });
  expect(await stopDemo(dir)).toBe(0);
  // nothing to download the second time
  const second = startDemo(dir, {
    ...PORTS,
    env: { BUN_CONFIG_REGISTRY: "http://127.0.0.1:9" },
  });
  expect(await healthWithin(second, 120_000)).toEqual({ ok: true });
  expect(await stopDemo(dir)).toBe(0);
}, 360_000);
