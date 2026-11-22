import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { runSuite } from "../harness.ts";

const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

const fixedNow = () => 1_794_909_600_000; // 2026-11-17T10:00:00Z
const measureModule = JSON.stringify(join(import.meta.dir, "../measure.ts"));

function scenarioFile(id: string, body: string): string {
  return `
import { measurement, sampleMs } from ${measureModule};
export default {
  id: ${JSON.stringify(id)},
  workload: null,
  processes: 5,
  async run() {
    ${body}
  },
};
`;
}

const budgets = (rows: readonly (readonly [string, string])[]): string =>
  JSON.stringify({
    formatVersion: 1,
    tier: "D-modest",
    budgets: rows.map(([scenario, metric]) => ({
      scenario,
      metric,
      stat: "p95",
      budget: 5,
      hardFail: 10,
    })),
  });

test("a timing row whose samples bypass the measuring path cannot be proved", async () => {
  const root = await trees.tree({
    "client/good.bench.ts": scenarioFile(
      "good",
      `const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await sampleMs(() => {}));
    return [measurement("t", "ms", samples)];`,
    ),
    "client/bad.bench.ts": scenarioFile(
      "bad",
      `return [measurement("t", "ms", [1, 2, 3])];`,
    ),
    "budgets.json": budgets([
      ["good", "t"],
      ["bad", "t"],
    ]),
  });
  const outDir = join(root, "out");
  const r = await runSuite({ root, outDir, now: fixedNow, prove: true });
  expect(r.unproved).toEqual(["bad t"]);
});

test("a proof leaves sizes, counts and product marks to their own tests", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": scenarioFile(
      "a",
      `return [measurement("size", "bytes", [1]), measurement("ui.open.palette", "ms", [1])];`,
    ),
    "client/unbudgeted.bench.ts": scenarioFile(
      "unbudgeted",
      `return [measurement("t", "ms", [1])];`,
    ),
    "budgets.json": budgets([
      ["a", "size"],
      ["a", "ui.open.palette"],
    ]),
  });
  const outDir = join(root, "out");
  const r = await runSuite({ root, outDir, now: fixedNow, prove: true });
  expect([r.scenarios, r.unproved]).toEqual([1, []]);
});
