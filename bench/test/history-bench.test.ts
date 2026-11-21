import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";
import { compareScenario } from "../client/history/compare.bench.ts";
import { sliceScenario } from "../client/history/compare-2000.bench.ts";
import {
  WRITER,
  createHistoryWorld,
  restoreScenario,
} from "../server/history/restore-120.bench.ts";
import { versionScenario } from "../server/history/version-2000.bench.ts";
import { listScenario } from "../server/history/versions.bench.ts";
import { scriptOfPages } from "../server/support.ts";

const repoRoot = join(import.meta.dir, "../..");

test("each history scenario measures what its budget rows name", async () => {
  const scenarios = [
    listScenario({ samples: 2 }),
    restoreScenario({ pages: 120, samples: 2 }),
    compareScenario({ samples: 2 }),
    sliceScenario({ samples: 2 }),
    versionScenario({ samples: 2 }),
    restoreScenario({ pages: 2000, samples: 2 }),
  ];
  const measured: Record<string, string[]> = {};
  const values: number[] = [];
  for (const scenario of scenarios) {
    const measurements = await scenario.run();
    measured[scenario.id] = measurements.map((m) => m.metric);
    for (const m of measurements) values.push(...m.samples);
  }
  const expected = {
    "history.list.first_page": ["list_ms"],
    "history.restore.120": ["restore_ms"],
    "history.compare.120": ["compare_ms"],
    "history.compare.2000": ["compare_ms", "longest_slice_ms"],
    "history.version.2000": ["version_ms"],
    "history.restore.2000": ["restore_ms"],
  };
  expect(measured).toEqual(expected);
  const rows: Record<string, string[]> = {};
  for (const row of (await readBudgets(join(repoRoot, "bench"), "D-modest"))
    .budgets)
    if (row.scenario.startsWith("history."))
      rows[row.scenario] = [...(rows[row.scenario] ?? []), row.metric];
  expect(rows).toEqual(expected);
  expect(values.length).toBe(14);
  expect(values.filter((value) => !Number.isFinite(value))).toEqual([]);
}, 600_000);

test("an edit the room refuses fails the run at once", async () => {
  const world = createHistoryWorld({ script: scriptOfPages(1) });
  const editor = world.join(WRITER, 1001);
  editor.leave();
  // a PUSH after UNSUBSCRIBE is refused as it is received
  await expect(editor.type(world.blockIds.slice(0, 1))).rejects.toThrow(
    "an edit was refused: not_subscribed",
  );
}, 5_000);
