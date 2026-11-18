import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { judge, readBudgets } from "../budgets.ts";

const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

test("a value is judged against its budget", () => {
  const budget = {
    scenario: "s",
    metric: "m",
    stat: "p95",
    budget: 50,
    hardFail: 100,
  } as const;
  expect([40, 50, 60, 101].map((v) => judge(v, budget))).toEqual([
    "pass",
    "pass",
    "over_budget",
    "hard_fail",
  ]);
});

test("a budgets file that is not JSON says so, and keeps why", async () => {
  const root = await trees.tree({ "budgets.json": "{" });
  const failure = await readBudgets(root, "host").catch((e: unknown) => e);
  expect((failure as Error).message).toBe(
    `${join(root, "budgets.json")} is not JSON`,
  );
  expect((failure as Error).cause).toBeInstanceOf(SyntaxError);
});
