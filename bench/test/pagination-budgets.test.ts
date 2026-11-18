import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";

const benchRoot = join(import.meta.dir, "..");

test("the engine has a cold and a keystroke budget at each script size", async () => {
  const rows = (await readBudgets(benchRoot, "D-modest")).budgets.filter((b) =>
    b.scenario.startsWith("pagination-engine-"),
  );
  expect(
    rows.map((b) => [b.scenario, b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual([
    ["pagination-engine-120", "cold_repagination", "p95", 10, 30],
    ["pagination-engine-120", "keystroke_engine", "p95", 0.5, 2],
    ["pagination-engine-400", "cold_repagination", "p95", 30, 80],
    ["pagination-engine-400", "keystroke_engine", "p95", 0.5, 2],
    ["pagination-engine-2000", "cold_repagination", "p95", 150, 400],
    ["pagination-engine-2000", "keystroke_engine", "p95", 0.5, 2],
  ]);
});
