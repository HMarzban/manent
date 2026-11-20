import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { isRecord, readBudgets } from "../budgets.ts";
import type { Budget } from "../budgets.ts";
import { runSuite } from "../harness.ts";
import type { SuiteRun } from "../harness.ts";

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

/** The p99 of the metric `name` of crdt.rebuild-size in the result file the run wrote. */
async function metric(result: SuiteRun, name: string): Promise<number> {
  const written: unknown = await Bun.file(result.file).json();
  const scenarios =
    isRecord(written) && Array.isArray(written.scenarios)
      ? written.scenarios
      : [];
  const scenario: unknown = scenarios.find(
    (s: unknown) => isRecord(s) && s.id === "crdt.rebuild-size",
  );
  const metrics =
    isRecord(scenario) && Array.isArray(scenario.metrics)
      ? scenario.metrics
      : [];
  const found: unknown = metrics.find(
    (m: unknown) => isRecord(m) && m.metric === name,
  );
  if (!isRecord(found) || typeof found.p99 !== "number")
    throw new Error(`the result file has no p99 of ${name}`);
  return found.p99;
}

test("the rebuild scenarios are found, named and budgeted as the table says", async () => {
  expect(
    (await scenarioIds(join(repoRoot, "bench/crdt"))).filter((id) =>
      id.startsWith("crdt.rebuild"),
    ),
  ).toEqual(["crdt.rebuild-size", "crdt.rebuild-time"]);
  expect(
    (await budgets())
      .filter((b) => b.scenario.startsWith("crdt.rebuild"))
      .map((b) => [b.scenario, b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual([
    ["crdt.rebuild-size", "bytes_ratio_after", "p99", 5, 10],
    ["crdt.rebuild-size", "client_ids_after", "p99", 2000, 10000],
    ["crdt.rebuild-time", "replay_ms", "p99", 100, 500],
  ]);
  expect(
    (await scenarioIds(join(repoRoot, "bench/server"))).filter(
      (id) => id === "server.rebuild-stall",
    ),
  ).toEqual(["server.rebuild-stall"]);
  expect(
    (await budgets())
      .filter((b) => b.scenario === "server.rebuild-stall")
      .map((b) => [b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual([
    ["rebuild_stall_ms", "p99", 20, 100],
    ["replay_stall_ms", "p99", 20, 100],
  ]);
});

// building the 12,000-session aged script takes about 13 minutes, so it runs only with MANENT_AGED=1
test.skipIf(process.env.MANENT_AGED !== "1")(
  "an aged document is over the client-id trigger before a rebuild and inside the budget after",
  async () => {
    const result = await runSuite({
      root: join(repoRoot, "bench"),
      outDir: await trees.tree({}),
      filter: "crdt/rebuild-size",
    });
    // 12,000 sessions and the generator's own client id
    expect(await metric(result, "client_ids_before_12k")).toBe(12_001);
    expect(await metric(result, "client_ids_after")).toBe(1);
  },
  1_800_000,
);
