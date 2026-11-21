import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readBudgets } from "../budgets.ts";
import { RUN_TIER, runSuite } from "../harness.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

/** A scenario file running the scenario of `file` once, in one process, so each metric pools its 20 iterations alone. */
const once = (file: string): string => `
import scenario from ${JSON.stringify(join(repoRoot, "bench/client/production", file))};
export default { ...scenario, processes: 1 };
`;

test("the revisions scenario reports its keystroke cost and is judged by its budget", async () => {
  const root = await trees.tree({
    // the real rows, judging this run as a run on their tier
    "budgets.json": (
      await Bun.file(join(repoRoot, "bench/budgets.json")).text()
    ).replace(`"tier": "D-modest"`, `"tier": "${RUN_TIER}"`),
    "client/issue.bench.ts": once("issue.bench.ts"),
    "client/lock.bench.ts": once("lock.bench.ts"),
    "client/marks.bench.ts": once("marks.bench.ts"),
  });
  const run = await runSuite({
    root,
    outDir: join(root, "out"),
    filter: "client/",
  });
  const written: unknown = await Bun.file(run.file).json();
  expect(written).toMatchObject({
    scenarios: [
      {
        id: "production.issue",
        workload: "W1",
        metrics: [
          { metric: "issue_ms", unit: "ms", samples: 20, verdict: "no_budget" },
        ],
      },
      {
        id: "production.lock",
        workload: "W1",
        metrics: [
          { metric: "lock_ms", unit: "ms", samples: 20, verdict: "no_budget" },
        ],
      },
      {
        id: "production.marks",
        workload: "W1",
        metrics: [
          {
            metric: "marks_ms",
            unit: "ms",
            samples: 20,
            max: expect.any(Number),
            verdict: expect.stringMatching(/^(pass|over_budget|hard_fail)$/),
          },
        ],
      },
    ],
  });
  const rows = (
    await readBudgets(join(repoRoot, "bench"), "D-modest")
  ).budgets.filter((b) => b.scenario.startsWith("production."));
  expect(rows).toEqual([
    {
      scenario: "production.marks",
      metric: "marks_ms",
      stat: "p95",
      budget: 0.5,
      hardFail: 2,
    },
  ]);
}, 300_000);
