import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readBudgets } from "../budgets.ts";
import type { Budget } from "../budgets.ts";
import inkCompileScenario from "../client/ink/ink-compile.bench.ts";
import { NotMeasured } from "../env.ts";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";
import searchScenario, {
  waitForHeavySeed,
} from "../server/search/search.bench.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

/** The sorted ids of the default exports of `dir`'s scenario files. */
async function scenarioIds(dir: string): Promise<string[]> {
  const ids: string[] = [];
  for await (const file of new Bun.Glob("**/*.bench.ts").scan({
    cwd: dir,
    absolute: true,
  })) {
    const { default: exported }: { default?: unknown } = await import(file);
    if (
      typeof exported !== "object" ||
      exported === null ||
      !("id" in exported) ||
      typeof exported.id !== "string"
    )
      throw new Error(`${file} exports no scenario id`);
    ids.push(exported.id);
  }
  return ids.toSorted();
}

async function budgets(): Promise<Budget[]> {
  return (await readBudgets(join(repoRoot, "bench"), "D-modest")).budgets;
}

/** Reported server scenarios that carry no budget row in budgets.json. */
const UNBUDGETED = new Set([
  "server.many-rooms",
  "server.presence",
  "server.search",
]);

test("every server scenario is found and has its budget rows", async () => {
  const found = await scenarioIds(join(repoRoot, "bench/server"));
  expect(found).toEqual([
    "history.list.first_page",
    "history.restore.120",
    "history.restore.2000",
    "history.version.2000",
    "prompter.staleness",
    "rundown.w4",
    "rundown.w5",
    "server.durability",
    "server.fanout",
    "server.join-storm",
    "server.many-rooms",
    "server.persistence",
    "server.power-loss",
    "server.presence",
    "server.push-cost",
    "server.rebuild-stall",
    "server.room-memory",
    "server.search",
    "server.soak",
  ]);
  const budgeted = found.filter((id) => !UNBUDGETED.has(id));
  const rows = (await budgets()).filter(
    (b) => b.scenario.startsWith("server.") || budgeted.includes(b.scenario),
  );
  // every row has its scenario, and every budgeted scenario a row
  expect(new Set(rows.map((b) => b.scenario))).toEqual(new Set(budgeted));
});

test("the quick scenarios run and report their metrics", async () => {
  const result = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "server/room-memory",
  });
  expect(result.hardFails).toBe(0);
  const written: unknown = await Bun.file(result.file).json();
  expect(written).toMatchObject({
    scenarios: [
      {
        id: "server.room-memory",
        metrics: [
          { metric: "rooms_after_idle", samples: 1 },
          { metric: "loaded_room_bytes", samples: 1 },
        ],
      },
    ],
  });
}, 120_000);

test("unbudgeted search and ink-compile scenarios declare metadata and report NotMeasured on missing prerequisites", async () => {
  expect([
    [searchScenario.id, searchScenario.workload, searchScenario.processes],
    [
      inkCompileScenario.id,
      inkCompileScenario.workload,
      inkCompileScenario.processes,
    ],
  ]).toEqual([
    ["server.search", null, 5],
    ["ink-compile", null, 5],
  ]);

  let clock = 0;
  await expect(
    waitForHeavySeed({
      url: "http://127.0.0.1:1",
      token: "tok",
      timeoutMs: 100,
      pollMs: 60,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      fetchImpl: Object.assign(
        async () =>
          Response.json({
            workspaces: [
              { id: "heavy", seeding: { done: 3, total: 40, failed: false } },
            ],
          }),
        { preconnect: () => {} },
      ),
    }),
  ).rejects.toThrow(
    "Lanternfield Studios did not finish seeding within 20 minutes",
  );

  await expect(
    waitForHeavySeed({
      url: "http://127.0.0.1:1",
      token: "tok",
      fetchImpl: Object.assign(
        async () =>
          Response.json({
            workspaces: [
              { id: "heavy", seeding: { done: 3, total: 40, failed: true } },
            ],
          }),
        { preconnect: () => {} },
      ),
    }),
  ).rejects.toBeInstanceOf(NotMeasured);

  await expect(
    waitForHeavySeed({
      url: "http://127.0.0.1:1",
      token: "tok",
      fetchImpl: Object.assign(
        async () =>
          Response.json({
            workspaces: [{ id: "heavy", seeding: null }],
          }),
        { preconnect: () => {} },
      ),
    }),
  ).resolves.toBeUndefined();

  const searchRun = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "server/search",
    mode: "quick",
    cannotRun: "prerequisites unavailable",
  });
  const inkRun = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "client/ink",
    mode: "quick",
    cannotRun: "prerequisites unavailable",
  });
  expect([
    searchRun.scenarios,
    searchRun.notMeasured,
    inkRun.scenarios,
    inkRun.notMeasured,
  ]).toEqual([1, 1, 1, 1]);
  const [searchResult, inkResult] = await Promise.all([
    readResultFile(searchRun.file),
    readResultFile(inkRun.file),
  ]);
  expect([
    searchResult.scenarios[0]?.id,
    searchResult.scenarios[0]?.outcome,
    inkResult.scenarios[0]?.id,
    inkResult.scenarios[0]?.outcome,
  ]).toEqual(["server.search", "not_measured", "ink-compile", "not_measured"]);
});
