import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readBudgets } from "../budgets.ts";
import type { Budget } from "../budgets.ts";
import { runSuite } from "../harness.ts";

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

test("every server scenario is found and has its budget rows", async () => {
  const found = await scenarioIds(join(repoRoot, "bench/server"));
  expect(found).toEqual([
    "server.durability",
    "server.fanout",
    "server.join-storm",
    "server.persistence",
    "server.push-cost",
    "server.rebuild-stall",
    "server.room-memory",
    "server.soak",
  ]);
  const rows = (await budgets()).filter((b) =>
    b.scenario.startsWith("server."),
  );
  // every row has its scenario, and every scenario a row
  expect(new Set(rows.map((b) => b.scenario))).toEqual(new Set(found));
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
