import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";
import { pasteScenario, typingScenario } from "../client/typing/scenario.ts";
import type { Scenario } from "../harness.ts";

const benchRoot = join(import.meta.dir, "..");

test("the typing scenarios are these, with their budgets", async () => {
  const rows = (await readBudgets(benchRoot, "D-modest")).budgets.filter((b) =>
    ["typing-120", "typing-2000", "paste-50"].includes(b.scenario),
  );
  expect(
    rows.map((b) => [b.scenario, b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual([
    ["typing-120", "keystroke_paint", "p50", 16, 33],
    ["typing-120", "keystroke_paint", "p95", 33, 50],
    ["typing-120", "keystroke_paint", "p99", 50, 100],
    ["typing-120", "remote_extra", "p50", 8, 16],
    ["typing-120", "position_spread", "p50", 20, 50],
    ["typing-120", "dispatch", "p95", 4, 8],
    ["typing-2000", "keystroke_paint", "p50", 16, 33],
    ["typing-2000", "keystroke_paint", "p95", 33, 50],
    ["typing-2000", "keystroke_paint", "p99", 50, 100],
    ["typing-2000", "remote_extra", "p50", 8, 16],
    ["typing-2000", "position_spread", "p50", 20, 50],
    ["typing-2000", "dispatch", "p95", 4, 8],
    ["paste-50", "paste_paint", "p95", 300, 1000],
  ]);
  expect([
    typingScenario({ pages: 120 }).id,
    typingScenario({ pages: 2000 }).workload,
    pasteScenario().processes,
  ]).toEqual(["typing-120", "W7", 5]);
});

test("the ids, workloads and processes are these", async () => {
  const glob = new Bun.Glob("client/typing/*.bench.ts");
  const found: unknown[] = [];
  for (const file of [...glob.scanSync({ cwd: benchRoot })].toSorted()) {
    const { default: s }: { default: Scenario } = await import(
      join(benchRoot, file)
    );
    found.push([s.id, s.workload, s.processes]);
  }
  expect(found).toEqual([
    ["paste-50", null, 5],
    ["typing-1000", null, 5],
    ["typing-120", "W1", 5],
    ["typing-2000", "W7", 5],
    ["typing-30", null, 5],
    ["typing-300", null, 5],
    ["typing-book-1000", "W7", 5],
    ["typing-book-2000", "W7", 5],
    ["typing-boundary-2000", "W7", 5],
    ["typing-flat-1000", "W6", 5],
  ]);
});

test("a short run measures every metric", async () => {
  const m = await typingScenario({ pages: 120, keystrokes: 5 }).run();
  expect(m.map((x) => [x.metric, x.unit])).toEqual([
    ["keystroke_paint", "ms"],
    ["keystroke_paint_remote", "ms"],
    ["remote_extra", "ms"],
    ["position_spread", "percent"],
    ["dispatch", "ms"],
    ["input_blocks", "count"],
  ]);
}, 240_000);
