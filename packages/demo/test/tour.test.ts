import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_GROUPS,
  TOUR_ISSUE_CODES,
  validateTour,
} from "../src/index.ts";

const VALID = { formatVersion: 1, groups: [...TOUR_GROUPS], scenarios: [] };
const SCENARIO = {
  id: "two-people-write",
  group: "Work together",
  promise: "Two people can write the same scene at once.",
  setup: {
    userId: "dana",
    open: "/",
    secondWindow: { userId: "sam", open: "/" },
  },
  steps: [
    { text: "Type a line.", highlight: "editor" },
    { text: "Watch the other window.", highlight: "editor" },
  ],
  check: "No scripts yet",
};
const withScenario = (fields: Record<string, unknown>) => ({
  ...VALID,
  scenarios: [{ ...SCENARIO, ...fields }],
});
const steps = (n: number) =>
  Array.from({ length: n }, () => ({ text: "Do it.", highlight: "x" }));

test("the Tour's groups are fixed", () => {
  expect(TOUR_GROUPS).toEqual([
    "Write",
    "Work together",
    "Go offline",
    "History",
    "Production",
    "Long documents",
    "Rundown and prompter",
    "Desktop",
  ]);
});

test("the Tour this build ships is valid for the demo's people", () => {
  expect(TOUR).toEqual({
    formatVersion: 1,
    groups: [...TOUR_GROUPS],
    scenarios: [],
  });
  expect(validateTour(TOUR, DEMO_USER_IDS)).toEqual([]);
});

test("a complete scenario is valid, with one window or two", () => {
  expect(validateTour(withScenario({}), DEMO_USER_IDS)).toEqual([]);
  const single = withScenario({
    setup: { userId: "leo", open: "/choose", secondWindow: null },
  });
  expect(validateTour(single, DEMO_USER_IDS)).toEqual([]);
});

const found = (file: unknown) =>
  validateTour(file, DEMO_USER_IDS).map((i) => [i.path, i.code]);

test("each way a Tour file falls short has a path and a code", () => {
  expect(found([])).toEqual([["", "not_an_object"]]);
  expect(found({ ...VALID, formatVersion: 2, groups: ["Write"] })).toEqual([
    ["formatVersion", "bad_format_version"],
    ["groups", "bad_groups"],
  ]);
  expect(found({ ...VALID, scenarios: {} })).toEqual([
    ["scenarios", "bad_scenarios"],
  ]);
  expect(found({ ...VALID, scenarios: [7] })).toEqual([
    ["scenarios[0]", "bad_scenario"],
  ]);
  expect(
    found(
      withScenario({
        id: "Not Kebab",
        group: "Versions",
        promise: " ",
        check: "",
      }),
    ),
  ).toEqual([
    ["scenarios[0].id", "bad_id"],
    ["scenarios[0].group", "bad_group"],
    ["scenarios[0].promise", "empty_text"],
    ["scenarios[0].check", "empty_text"],
  ]);
  expect(
    found(withScenario({ steps: [{ text: "one", highlight: "a" }] })),
  ).toEqual([["scenarios[0].steps", "bad_steps"]]);
  expect(
    found(
      withScenario({
        setup: { userId: "mallory", open: "library", secondWindow: 7 },
      }),
    ),
  ).toEqual([
    ["scenarios[0].setup.userId", "unknown_user"],
    ["scenarios[0].setup.open", "bad_path"],
    ["scenarios[0].setup.secondWindow", "bad_window"],
  ]);
  expect(found({ ...VALID, scenarios: [SCENARIO, SCENARIO] })).toEqual([
    ["scenarios[1].id", "duplicate_id"],
  ]);
  for (const issue of validateTour([], DEMO_USER_IDS))
    expect(issue.severity).toBe("reject");

  const { groups: _groups, ...noGroups } = VALID;
  const cases: [unknown, string[][]][] = [
    ["not a tour", [["", "not_an_object"]]],
    [null, [["", "not_an_object"]]],
    [{ ...VALID, formatVersion: 2 }, [["formatVersion", "bad_format_version"]]],
    [noGroups, [["groups", "bad_groups"]]],
    [
      { ...VALID, groups: TOUR_GROUPS.toReversed() },
      [["groups", "bad_groups"]],
    ],
    [
      { ...VALID, groups: [...TOUR_GROUPS.slice(0, 7), "Laptop"] },
      [["groups", "bad_groups"]],
    ],
    [{ ...VALID, scenarios: "none" }, [["scenarios", "bad_scenarios"]]],
    [
      { ...VALID, scenarios: ["a scenario"] },
      [["scenarios[0]", "bad_scenario"]],
    ],
    [withScenario({ id: "Two_People" }), [["scenarios[0].id", "bad_id"]]],
    [withScenario({ id: "two--people" }), [["scenarios[0].id", "bad_id"]]],
    [withScenario({ group: "Laptop" }), [["scenarios[0].group", "bad_group"]]],
    [withScenario({ promise: "" }), [["scenarios[0].promise", "empty_text"]]],
    [withScenario({ check: " " }), [["scenarios[0].check", "empty_text"]]],
    [withScenario({ steps: steps(1) }), [["scenarios[0].steps", "bad_steps"]]],
    [withScenario({ steps: steps(5) }), [["scenarios[0].steps", "bad_steps"]]],
    [
      withScenario({
        steps: [{ highlight: "x" }, { text: "Go.", highlight: "y" }],
      }),
      [["scenarios[0].steps[0].text", "empty_text"]],
    ],
    [
      withScenario({
        steps: [{ text: "Go.", highlight: "x" }, { text: "Go." }],
      }),
      [["scenarios[0].steps[1].highlight", "empty_text"]],
    ],
    [
      withScenario({ setup: { userId: "zed", open: "/", secondWindow: null } }),
      [["scenarios[0].setup.userId", "unknown_user"]],
    ],
    [
      withScenario({
        setup: {
          userId: "dana",
          open: "/",
          secondWindow: { userId: "zed", open: "/" },
        },
      }),
      [["scenarios[0].setup.secondWindow.userId", "unknown_user"]],
    ],
    [
      withScenario({
        setup: {
          userId: "dana",
          open: "/",
          secondWindow: { userId: "sam", open: "x" },
        },
      }),
      [["scenarios[0].setup.secondWindow.open", "bad_path"]],
    ],
    [
      withScenario({
        setup: { userId: "dana", open: "choose", secondWindow: null },
      }),
      [["scenarios[0].setup.open", "bad_path"]],
    ],
    [
      withScenario({ setup: { userId: "dana", open: "/" } }),
      [["scenarios[0].setup.secondWindow", "bad_window"]],
    ],
    [withScenario({ setup: null }), [["scenarios[0].setup", "bad_setup"]]],
  ];
  for (const [file, issues] of cases)
    expect([file, found(file)]).toEqual([file, issues]);
});

const PARTS = [
  "id",
  "group",
  "promise",
  "check",
  "steps",
  "userId",
  "open",
  "secondWindow",
] as const;
type Part = (typeof PARTS)[number];

const VALID_PARTS: Record<Part, readonly unknown[]> = {
  id: ["two-people-write", "write-1"],
  group: ["Write", "History"],
  promise: ["One sentence."],
  check: ["What the screen says"],
  steps: [steps(2), steps(4)],
  userId: ["leo", "you"],
  open: ["/", "/choose"],
  secondWindow: [null, { userId: "sam", open: "/" }],
};
const INVALID_PARTS: Record<Part, readonly unknown[]> = {
  id: ["Not Kebab", 7],
  group: ["Versions", null],
  promise: [" ", 3],
  check: ["", undefined],
  steps: [steps(1), "steps"],
  userId: ["mallory", 1],
  open: ["library", null],
  secondWindow: [7, "window"],
};
const PART_PATHS: Record<Part, string> = {
  id: "scenarios[0].id",
  group: "scenarios[0].group",
  promise: "scenarios[0].promise",
  check: "scenarios[0].check",
  steps: "scenarios[0].steps",
  userId: "scenarios[0].setup.userId",
  open: "scenarios[0].setup.open",
  secondWindow: "scenarios[0].setup.secondWindow",
};

const part = (key: Part) =>
  fc.oneof(
    fc
      .constantFrom(...VALID_PARTS[key])
      .map((value) => ({ value, valid: true })),
    fc
      .constantFrom(...INVALID_PARTS[key])
      .map((value) => ({ value, valid: false })),
  );

test("a scenario made of valid parts is accepted, and each part that is not is named by its path", () => {
  const scenario = fc.record({
    id: part("id"),
    group: part("group"),
    promise: part("promise"),
    check: part("check"),
    steps: part("steps"),
    userId: part("userId"),
    open: part("open"),
    secondWindow: part("secondWindow"),
  });
  fc.assert(
    fc.property(scenario, (parts) => {
      const file = withScenario({
        id: parts.id.value,
        group: parts.group.value,
        promise: parts.promise.value,
        check: parts.check.value,
        steps: parts.steps.value,
        setup: {
          userId: parts.userId.value,
          open: parts.open.value,
          secondWindow: parts.secondWindow.value,
        },
      });
      expect(validateTour(file, DEMO_USER_IDS).map((i) => i.path)).toEqual(
        PARTS.filter((key) => !parts[key].valid).map((key) => PART_PATHS[key]),
      );
    }),
    { numRuns: 500 },
  );
});

test("any input ends in a list of declared issues, never a throw", () => {
  fc.assert(
    fc.property(fc.anything({ withNullPrototype: true }), (file) => {
      for (const issue of validateTour(file, DEMO_USER_IDS)) {
        expect(TOUR_ISSUE_CODES).toContain(issue.code);
        expect(issue.severity).toBe("reject");
      }
    }),
    { numRuns: 1000 },
  );
});
