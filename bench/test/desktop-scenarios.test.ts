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
