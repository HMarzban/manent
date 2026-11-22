import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_GROUPS,
  TOUR_ISSUE_CODES,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const PREPARE_IDS = ["p1"];
const VALID = { formatVersion: 2, groups: [...TOUR_GROUPS], scenarios: [] };
const SETUP = {
  userId: "dana",
  open: "/",
  extraWindows: [{ userId: "sam", open: "/" }],
  prepare: null,
  shell: "any",
};
const SCENARIO = {
  id: "two-people-write",
  group: "Work together",
  promise: "Two people can write the same scene at once.",
  setup: SETUP,
  steps: [
    { text: "Type a line.", highlight: "editor" },
    { text: "Watch the other window.", highlight: "editor" },
  ],
  check: "No scripts yet",
  evidence: ["No scripts yet"],
  fresh: false,
  waitsFor: null,
  hidden: null,
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
  expect([TOUR.formatVersion, TOUR.groups]).toEqual([2, [...TOUR_GROUPS]]);
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});

test("a complete scenario is valid, with one window or two", () => {
  expect(validateTour(withScenario({}), DEMO_USER_IDS, PREPARE_IDS)).toEqual(
    [],
  );
  const single = withScenario({
    setup: { ...SETUP, userId: "leo", open: "/choose", extraWindows: [] },
  });
  expect(validateTour(single, DEMO_USER_IDS, PREPARE_IDS)).toEqual([]);
});

const found = (file: unknown) =>
  validateTour(file, DEMO_USER_IDS, PREPARE_IDS).map((i) => [i.path, i.code]);

test("each way a Tour file falls short has a path and a code", () => {
  expect(found([])).toEqual([["", "not_an_object"]]);
  expect(found({ ...VALID, formatVersion: 3, groups: ["Write"] })).toEqual([
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
    ["scenarios[0].evidence", "bad_evidence"],
  ]);
  expect(
    found(withScenario({ steps: [{ text: "one", highlight: "a" }] })),
  ).toEqual([["scenarios[0].steps", "bad_steps"]]);
  expect(
    found(
      withScenario({
        setup: {
          ...SETUP,
          userId: "mallory",
          open: "library",
          extraWindows: 7,
        },
      }),
    ),
  ).toEqual([
    ["scenarios[0].setup.userId", "unknown_user"],
    ["scenarios[0].setup.open", "bad_path"],
    ["scenarios[0].setup.extraWindows", "bad_window"],
  ]);
  expect(found({ ...VALID, scenarios: [SCENARIO, SCENARIO] })).toEqual([
    ["scenarios[1].id", "duplicate_id"],
  ]);
  for (const issue of validateTour([], DEMO_USER_IDS, PREPARE_IDS))
    expect(issue.severity).toBe("reject");

  const { groups: _groups, ...noGroups } = VALID;
  const cases: [unknown, string[][]][] = [
    ["not a tour", [["", "not_an_object"]]],
    [null, [["", "not_an_object"]]],
    [{ ...VALID, formatVersion: 1 }, [["formatVersion", "bad_format_version"]]],
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
    [
      withScenario({ check: " " }),
      [
        ["scenarios[0].check", "empty_text"],
        ["scenarios[0].evidence", "bad_evidence"],
      ],
    ],
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
      withScenario({ setup: { ...SETUP, userId: "zed", extraWindows: [] } }),
      [["scenarios[0].setup.userId", "unknown_user"]],
    ],
    [
      withScenario({
        setup: { ...SETUP, extraWindows: [{ userId: "zed", open: "/" }] },
      }),
      [["scenarios[0].setup.extraWindows[0].userId", "unknown_user"]],
    ],
    [
      withScenario({
        setup: { ...SETUP, extraWindows: [{ userId: "sam", open: "x" }] },
      }),
      [["scenarios[0].setup.extraWindows[0].open", "bad_path"]],
    ],
    [
      withScenario({
        setup: { ...SETUP, open: "choose", extraWindows: [] },
      }),
      [["scenarios[0].setup.open", "bad_path"]],
    ],
    [
      withScenario({
        setup: { userId: "dana", open: "/", prepare: null, shell: "any" },
      }),
      [["scenarios[0].setup.extraWindows", "bad_window"]],
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
  "extraWindows",
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
  extraWindows: [[], [{ userId: "sam", open: "/" }]],
};
const INVALID_PARTS: Record<Part, readonly unknown[]> = {
  id: ["Not Kebab", 7],
  group: ["Versions", null],
  promise: [" ", 3],
  check: ["", undefined],
  steps: [steps(1), "steps"],
  userId: ["mallory", 1],
  open: ["library", null],
  extraWindows: [7, "window"],
};
const PART_PATHS: Record<Part, string> = {
  id: "scenarios[0].id",
  group: "scenarios[0].group",
  promise: "scenarios[0].promise",
  check: "scenarios[0].check",
  steps: "scenarios[0].steps",
  userId: "scenarios[0].setup.userId",
  open: "scenarios[0].setup.open",
  extraWindows: "scenarios[0].setup.extraWindows",
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
    extraWindows: part("extraWindows"),
  });
  fc.assert(
    fc.property(scenario, (parts) => {
      const file = withScenario({
        id: parts.id.value,
        group: parts.group.value,
        promise: parts.promise.value,
        check: parts.check.value,
        evidence: [parts.check.value],
        steps: parts.steps.value,
        setup: {
          ...SETUP,
          userId: parts.userId.value,
          open: parts.open.value,
          extraWindows: parts.extraWindows.value,
        },
      });
      expect(found(file).map(([path]) => path)).toEqual(
        // evidence is the check's own text, so a check that is not valid holds no evidence either
        PARTS.filter((key) => !parts[key].valid).flatMap((key) =>
          key === "check"
            ? [PART_PATHS.check, "scenarios[0].evidence"]
            : [PART_PATHS[key]],
        ),
      );
    }),
    { numRuns: 500 },
  );
});

test("any input ends in a list of declared issues, never a throw", () => {
  fc.assert(
    fc.property(fc.anything({ withNullPrototype: true }), (file) => {
      for (const issue of validateTour(file, DEMO_USER_IDS, PREPARE_IDS)) {
        expect(TOUR_ISSUE_CODES).toContain(issue.code);
        expect(issue.severity).toBe("reject");
      }
    }),
    { numRuns: 1000 },
  );
});
