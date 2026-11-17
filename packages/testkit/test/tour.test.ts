import { expect, test } from "bun:test";
import { TOUR_GROUPS, validateTour } from "../src/index.ts";
import type { TourProblem } from "../src/index.ts";

const PEOPLE = ["dana", "sam", "priya", "leo", "ana", "you"];
const empty = { formatVersion: 1, groups: [...TOUR_GROUPS], scenarios: [] };

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    id: "two-people-write",
    group: "Work together",
    promise: "Two people can write the same scene at once.",
    setup: {
      person: "dana",
      open: "/",
      secondWindow: { person: "sam", open: "/" },
    },
    steps: [
      { text: "Type a line.", highlight: "editor" },
      { text: "Watch the other window.", highlight: "editor" },
    ],
    check: "No scripts yet",
    ...overrides,
  };
}

function steps(n: number) {
  return Array.from({ length: n }, () => ({ text: "Do it.", highlight: "x" }));
}

function withScenarios(...scenarios: unknown[]) {
  return { ...empty, scenarios };
}

function expectOne(
  problems: TourProblem[],
  scenarioId: string | null,
  field: string,
) {
  expect(problems).toHaveLength(1);
  expect(problems[0]?.scenario).toBe(scenarioId);
  expect(problems[0]?.problem).toContain(field);
}

test("an empty Tour with the eight groups is valid", () => {
  expect(validateTour(empty, PEOPLE)).toEqual([]);
});

test("a complete scenario is valid", () => {
  expect(validateTour(withScenarios(scenario()), PEOPLE)).toEqual([]);
  const single = scenario({
    setup: { person: "leo", open: "/choose", secondWindow: null },
  });
  expect(validateTour(withScenarios(single), PEOPLE)).toEqual([]);
});

test("each kind of damage is one named problem", () => {
  const id = "two-people-write";
  expectOne(validateTour("not a tour", PEOPLE), null, "file");
  expectOne(validateTour(null, PEOPLE), null, "file");
  expectOne(validateTour([], PEOPLE), null, "file");
  expectOne(
    validateTour({ ...empty, formatVersion: 2 }, PEOPLE),
    null,
    "formatVersion",
  );

  const { groups: _groups, ...noGroups } = empty;
  expectOne(validateTour(noGroups, PEOPLE), null, "groups");
  expectOne(
    validateTour({ ...empty, groups: TOUR_GROUPS.toReversed() }, PEOPLE),
    null,
    "groups",
  );
  expectOne(
    validateTour(
      { ...empty, groups: [...TOUR_GROUPS.slice(0, 7), "Laptop"] },
      PEOPLE,
    ),
    null,
    "groups",
  );
  expectOne(
    validateTour({ ...empty, scenarios: "none" }, PEOPLE),
    null,
    "scenarios",
  );

  expectOne(
    validateTour(withScenarios(scenario(), scenario()), PEOPLE),
    id,
    "id",
  );
  expectOne(
    validateTour(withScenarios(scenario({ id: "Two_People" })), PEOPLE),
    "Two_People",
    "id",
  );
  expectOne(
    validateTour(withScenarios(scenario({ id: "two--people" })), PEOPLE),
    "two--people",
    "id",
  );
  expectOne(
    validateTour(withScenarios(scenario({ group: "Laptop" })), PEOPLE),
    id,
    "group",
  );
  expectOne(
    validateTour(withScenarios(scenario({ promise: "" })), PEOPLE),
    id,
    "promise",
  );
  expectOne(
    validateTour(withScenarios(scenario({ check: " " })), PEOPLE),
    id,
    "check",
  );
  expectOne(
    validateTour(withScenarios(scenario({ steps: steps(1) })), PEOPLE),
    id,
    "steps",
  );
  expectOne(
    validateTour(withScenarios(scenario({ steps: steps(5) })), PEOPLE),
    id,
    "steps",
  );
  expectOne(
    validateTour(
      withScenarios(
        scenario({
          steps: [{ highlight: "x" }, { text: "Go.", highlight: "y" }],
        }),
      ),
      PEOPLE,
    ),
    id,
    "steps[0].text",
  );
  expectOne(
    validateTour(
      withScenarios(
        scenario({ steps: [{ text: "Go.", highlight: "x" }, { text: "Go." }] }),
      ),
      PEOPLE,
    ),
    id,
    "steps[1].highlight",
  );
  expectOne(
    validateTour(
      withScenarios(
        scenario({
          setup: { person: "zed", open: "/", secondWindow: null },
        }),
      ),
      PEOPLE,
    ),
    id,
    "setup.person",
  );
  expectOne(
    validateTour(
      withScenarios(
        scenario({
          setup: {
            person: "dana",
            open: "/",
            secondWindow: { person: "zed", open: "/" },
          },
        }),
      ),
      PEOPLE,
    ),
    id,
    "setup.secondWindow.person",
  );
  expectOne(
    validateTour(
      withScenarios(
        scenario({
          setup: { person: "dana", open: "choose", secondWindow: null },
        }),
      ),
      PEOPLE,
    ),
    id,
    "setup.open",
  );
  expectOne(
    validateTour(
      withScenarios(scenario({ setup: { person: "dana", open: "/" } })),
      PEOPLE,
    ),
    id,
    "setup.secondWindow",
  );
  expectOne(
    validateTour(withScenarios("a scenario"), PEOPLE),
    null,
    "scenarios[0]",
  );
});
