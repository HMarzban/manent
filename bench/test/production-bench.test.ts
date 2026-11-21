import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readBudgets } from "../budgets.ts";
import { runSuite } from "../harness.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

/** A scenario file running the scenario of `file` in `processes` processes. */
const inProcesses = (file: string, processes: number): string => `
import scenario from ${JSON.stringify(join(repoRoot, "bench/client/production", file))};
export default { ...scenario, processes: ${processes} };
`;

test("the revisions scenario reports its keystroke cost and is judged by its budget", async () => {
  const root = await trees.tree({
    "budgets.json": await Bun.file(join(repoRoot, "bench/budgets.json")).text(),
    "client/issue.bench.ts": inProcesses("issue.bench.ts", 1),
    "client/lock.bench.ts": inProcesses("lock.bench.ts", 1),
    // a timing row is judged over at least five processes
    "client/marks.bench.ts": inProcesses("marks.bench.ts", 5),
  });
  const run = await runSuite({
    root,
    outDir: join(root, "out"),
    filter: "client/",
    tier: "D-modest",
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
            samples: 100,
            max: expect.any(Number),
            verdict: expect.stringMatching(
              /^(pass|over_budget|hard_fail|inconclusive)$/,
            ),
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
