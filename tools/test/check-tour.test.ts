import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { TOUR, TOUR_GROUPS } from "@manent/demo";
import { createTempTrees } from "@manent/testkit";
import { checkTour } from "../check-tour.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent tour ");
afterAll(trees.removeAll);

const EMPTY = { formatVersion: 2, groups: [...TOUR_GROUPS], scenarios: [] };
const SETUP = {
  userId: "dana",
  open: "/",
  extraWindows: [],
  prepare: null,
  shell: "any",
};
const SCENARIO = {
  group: "Go offline",
  promise: "Writing goes on without the server.",
  setup: SETUP,
  steps: [
    { text: "Stop the server.", highlight: "demo:server" },
    { text: "Type a line.", highlight: "page" },
  ],
  check: "Saved on this device",
  evidence: ["Saved on this device"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
const withScenario = (id: string, fields: Record<string, unknown> = {}) => ({
  ...EMPTY,
  scenarios: [{ ...SCENARIO, id, ...fields }],
});

/** A root whose e2e/tour/ holds `tests` (file name → text) beside the folder's placeholder. */
const rootWith = (tests: Record<string, string>) =>
  trees.tree(
    Object.fromEntries([
      ["e2e/tour/.gitkeep", ""],
      ...Object.entries(tests).map(([name, text]) => [
        `e2e/tour/${name}`,
        text,
      ]),
    ]),
  );

test("an empty Tour passes", async () => {
  expect(await checkTour(await rootWith({}), EMPTY)).toEqual([]);
});

test("a scenario without its test is a violation, and so is a test without its scenario", async () => {
  expect(
    await checkTour(await rootWith({}), withScenario("write-offline")),
  ).toEqual([
    {
      file: "e2e/tour/write-offline.e2e.ts",
      line: 0,
      rule: "no-test",
      message: "scenario write-offline has no test",
    },
  ]);
  expect(
    await checkTour(await rootWith({ "ghost.e2e.ts": "" }), EMPTY),
  ).toEqual([
    {
      file: "e2e/tour/ghost.e2e.ts",
      line: 0,
      rule: "no-scenario",
      message: "test has no scenario in the Tour",
    },
  ]);
  const notCalled = await rootWith({
    "write-offline.e2e.ts":
      'tourScenario("write-offline-twice", async () => {});\n',
  });
  expect(await checkTour(notCalled, withScenario("write-offline"))).toEqual([
    {
      file: "e2e/tour/write-offline.e2e.ts",
      line: 0,
      rule: "no-call",
      message: 'test does not call tourScenario("write-offline")',
    },
  ]);
  const called = await rootWith({
    "write-offline.e2e.ts":
      'tourScenario(\n  "write-offline",\n  async () => {},\n);\n',
  });
  expect(await checkTour(called, withScenario("write-offline"))).toEqual([]);
});

test("a damaged Tour is reported through validateTour", async () => {
  const damaged = withScenario("write-offline", {
    setup: { ...SETUP, userId: "mallory" },
  });
  expect(await checkTour(await rootWith({}), damaged)).toEqual([
    {
      file: "packages/demo/src/tour/content.ts",
      line: 0,
      rule: "unknown_user",
      message:
        'scenarios[0].setup.userId: the user "mallory" is not one of dana, sam, priya, leo, ana, you',
    },
  ]);
});

test("this repository's Tour passes", async () => {
  expect(await checkTour(repoRoot, TOUR)).toEqual([]);
});
