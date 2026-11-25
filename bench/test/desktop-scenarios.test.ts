import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

test("the desktop node's save is measured through its own client", async () => {
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "desktop/saved-fsync",
    mode: "quick",
  });
  const result = await readResultFile(run.file);
  expect(result.scenarios.length).toBe(1);
  const [scenario] = result.scenarios;
  if (scenario?.outcome !== "measured")
    throw new Error(
      `desktop.saved-fsync did not measure: ${JSON.stringify(scenario)}`,
    );
  expect(scenario.id).toBe("desktop.saved-fsync");
  expect(scenario.metrics.map((m) => [m.metric, m.unit, m.samples])).toEqual([
    ["keystroke_saved", "ms", 3],
    ["input_blocks", "count", 1],
  ]);
  expect(scenario.metrics.find((m) => m.metric === "input_blocks")?.p50).toBe(
    1,
  );
}, 120_000);

test("desktop wake measures reconnect_ms after an abrupt upstream socket drop", async () => {
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "desktop/wake",
    mode: "quick",
  });
  const result = await readResultFile(run.file);
  expect(result.scenarios.length).toBe(1);
  const [scenario] = result.scenarios;
  if (scenario?.outcome !== "measured")
    throw new Error(
      `desktop.wake did not measure: ${JSON.stringify(scenario)}`,
    );
  expect(scenario.id).toBe("desktop.wake");
  expect(scenario.metrics.map((m) => [m.metric, m.unit, m.samples])).toEqual([
    ["reconnect_ms", "ms", 2],
  ]);
}, 120_000);

test("desktop update reports not_measured when local build prerequisites are absent", async () => {
  const keys = [
    "MANENT_BENCH_DESKTOP_APP",
    "MANENT_BENCH_UPDATE_DIR",
    "MANENT_BENCH_DESKTOP_SMOKE",
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  try {
    const run = await runSuite({
      root: join(repoRoot, "bench"),
      outDir: await trees.tree({}),
      filter: "desktop/update",
      mode: "quick",
    });
    expect(run.failed).toBe(0);
    expect(run.notMeasured).toBe(1);
    const result = await readResultFile(run.file);
    expect(result.scenarios.length).toBe(1);
    const [scenario] = result.scenarios;
    expect(scenario?.id).toBe("desktop.update");
    expect(scenario?.outcome).toBe("not_measured");
    if (scenario?.outcome === "not_measured")
      expect(scenario.reason.length).toBeGreaterThan(0);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}, 30_000);

test("desktop update reads updateMs from a local smoke file and rejects null updateMs", async () => {
  const dir = await trees.tree({
    "ok.json": JSON.stringify({ updateMs: 1420 }),
    "missing.json": JSON.stringify({ updateMs: null }),
  });
  const saved = process.env.MANENT_BENCH_DESKTOP_SMOKE;
  try {
    process.env.MANENT_BENCH_DESKTOP_SMOKE = join(dir, "ok.json");
    const okRun = await runSuite({
      root: join(repoRoot, "bench"),
      outDir: await trees.tree({}),
      filter: "desktop/update",
      mode: "quick",
    });
    const okResult = await readResultFile(okRun.file);
    const [okScenario] = okResult.scenarios;
    if (process.platform === "darwin") {
      if (okScenario?.outcome !== "measured")
        throw new Error(
          `desktop.update did not measure from smoke file: ${JSON.stringify(okScenario)}`,
        );
      expect(
        okScenario.metrics.map((m) => [m.metric, m.unit, m.samples]),
      ).toEqual([["update_ms", "ms", 1]]);
      expect(okScenario.metrics[0]?.p50).toBe(1420);
    } else {
      expect(okScenario?.outcome).toBe("not_measured");
    }

    process.env.MANENT_BENCH_DESKTOP_SMOKE = join(dir, "missing.json");
    const nullRun = await runSuite({
      root: join(repoRoot, "bench"),
      outDir: await trees.tree({}),
      filter: "desktop/update",
      mode: "quick",
    });
    expect(nullRun.failed).toBe(0);
    expect(nullRun.notMeasured).toBe(1);
  } finally {
    if (saved === undefined) delete process.env.MANENT_BENCH_DESKTOP_SMOKE;
    else process.env.MANENT_BENCH_DESKTOP_SMOKE = saved;
  }
}, 30_000);
