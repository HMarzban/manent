import { expect, test } from "bun:test";
import { paginate, profileFor } from "@manent/pagination";
import { engineScenario } from "../client/pagination-engine/scenario.ts";
import { scriptOfPages } from "../client/pagination-engine/script.ts";

test("a script of a given length", () => {
  expect(
    paginate(scriptOfPages(120), profileFor("screenplay")!).pages.length,
  ).toBe(120);
});

test("a scenario measures a cold pass, keystrokes and the page count", async () => {
  const s = engineScenario({
    pages: 30,
    workload: null,
    coldSamples: 2,
    keystrokeSamples: 5,
  });
  const m = await s.run();
  expect([s.id, s.processes, s.workload]).toEqual([
    "pagination-engine-30",
    5,
    null,
  ]);
  expect(m.map((x) => [x.metric, x.unit, x.samples.length])).toEqual([
    ["cold_repagination", "ms", 2],
    ["keystroke_engine", "ms", 15],
    ["pages", "count", 1],
  ]);
  expect(m[2]!.samples).toEqual([30]);
});
