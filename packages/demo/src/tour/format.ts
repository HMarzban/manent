// The Tour's file format, and the checker every Tour file passes.

export const TOUR_GROUPS = [
  "Write",
  "Work together",
  "Go offline",
  "History",
  "Production",
  "Long documents",
  "Rundown and prompter",
  "Desktop",
] as const;

export type TourGroup = (typeof TOUR_GROUPS)[number];

/** A window the scenario opens: a user's ID and an app path starting "/". */
export interface TourWindow {
  userId: string;
  open: string;
}

export interface TourScenario {
  /** Kebab-case; the scenario's test is e2e/tour/<id>.e2e.ts. */
  id: string;
  group: TourGroup;
  /** One sentence. */
  promise: string;
  setup: TourWindow & { secondWindow: TourWindow | null };
  /** Two to four; `highlight` is the control's data-tour value. */
  steps: { text: string; highlight: string }[];
  /** The observable proof, in the product's exact words. */
  check: string;
}

export interface TourFile {
  formatVersion: 1;
  groups: readonly TourGroup[];
  scenarios: readonly TourScenario[];
}

export const TOUR_ISSUE_CODES = [
  "not_an_object",
  "bad_format_version",
  "bad_groups",
  "bad_scenarios",
  "bad_scenario",
  "bad_id",
  "duplicate_id",
  "bad_group",
  "empty_text",
  "bad_steps",
  "bad_setup",
  "bad_window",
  "unknown_user",
  "bad_path",
] as const;

export type TourIssueCode = (typeof TOUR_ISSUE_CODES)[number];

/** One thing wrong with a Tour file, in the shape every validator's finding has. `message` is English for logs. */
export interface TourIssue {
  path: string;
  code: TourIssueCode;
  severity: "reject";
  message: string;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_STEPS = 2;
const MAX_STEPS = 4;

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isTourGroup(value: unknown): value is TourGroup {
  return TOUR_GROUPS.some((group) => group === value);
}

/** A value as a message names it: a string in quotes, a number, boolean or null as written, anything else by its kind. */
function named(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return String(value);
  return Array.isArray(value) ? "a list" : typeof value;
}

function issue(path: string, code: TourIssueCode, message: string): TourIssue {
  return { path, code, severity: "reject", message };
}

function checkWindow(
  tourWindow: Fields,
  path: string,
  userIds: readonly string[],
): TourIssue[] {
  const issues: TourIssue[] = [];
  const { userId, open } = tourWindow;
  if (typeof userId !== "string" || !userIds.includes(userId))
    issues.push(
      issue(
        `${path}.userId`,
        "unknown_user",
        `the user ${named(userId)} is not one of ${userIds.join(", ")}`,
      ),
    );
  if (typeof open !== "string" || !open.startsWith("/"))
    issues.push(
      issue(
        `${path}.open`,
        "bad_path",
        `an app path must start with "/", not ${named(open)}`,
      ),
    );
  return issues;
}

function checkSetup(
  setup: unknown,
  path: string,
  userIds: readonly string[],
): TourIssue[] {
  if (!isObject(setup))
    return [issue(path, "bad_setup", "the setup must be an object")];
  const issues = checkWindow(setup, path, userIds);
  const { secondWindow } = setup;
  if (secondWindow === null) return issues;
  if (!isObject(secondWindow))
    return [
      ...issues,
      issue(
        `${path}.secondWindow`,
        "bad_window",
        `a second window must be a window or null, not ${named(secondWindow)}`,
      ),
    ];
  return [
    ...issues,
    ...checkWindow(secondWindow, `${path}.secondWindow`, userIds),
  ];
}

function checkSteps(steps: unknown, path: string): TourIssue[] {
  if (
    !Array.isArray(steps) ||
    steps.length < MIN_STEPS ||
    steps.length > MAX_STEPS
  )
    return [
      issue(
        path,
        "bad_steps",
        `a scenario needs ${MIN_STEPS} to ${MAX_STEPS} steps`,
      ),
    ];
  return steps.flatMap((step: unknown, i) => {
    const fields = isObject(step) ? step : {};
    return (["text", "highlight"] as const)
      .filter((field) => !isFilled(fields[field]))
      .map((field) =>
        issue(
          `${path}[${i}].${field}`,
          "empty_text",
          `the step's ${field} is empty`,
        ),
      );
  });
}

/** The issues of one scenario; `earlier` are the scenarios before it, whose ids it may not reuse. */
function checkScenario(
  scenario: unknown,
  path: string,
  earlier: readonly unknown[],
  userIds: readonly string[],
): TourIssue[] {
  if (!isObject(scenario))
    return [issue(path, "bad_scenario", "a scenario must be an object")];
  const issues: TourIssue[] = [];
  const { id, group, promise, check } = scenario;
  if (typeof id !== "string" || !KEBAB.test(id))
    issues.push(
      issue(
        `${path}.id`,
        "bad_id",
        `an id must be kebab-case, not ${named(id)}`,
      ),
    );
  else if (earlier.some((other) => isObject(other) && other.id === id))
    issues.push(
      issue(`${path}.id`, "duplicate_id", `the id ${id} is already used`),
    );
  if (!isTourGroup(group))
    issues.push(
      issue(
        `${path}.group`,
        "bad_group",
        `a group must be one of the ${TOUR_GROUPS.length} Tour groups, not ${named(group)}`,
      ),
    );
  for (const [field, value] of [
    ["promise", promise],
    ["check", check],
  ] as const)
    if (!isFilled(value))
      issues.push(
        issue(`${path}.${field}`, "empty_text", `the ${field} is empty`),
      );
  return [
    ...issues,
    ...checkSteps(scenario.steps, `${path}.steps`),
    ...checkSetup(scenario.setup, `${path}.setup`, userIds),
  ];
}

/** Every way `file` falls short of a Tour file whose windows name `userIds`; empty when it is a valid one. Never throws. */
export function validateTour(
  file: unknown,
  userIds: readonly string[],
): TourIssue[] {
  if (!isObject(file))
    return [issue("", "not_an_object", "a Tour file must be a JSON object")];
  const issues: TourIssue[] = [];
  const { formatVersion, groups, scenarios } = file;

  if (formatVersion !== 1)
    issues.push(
      issue(
        "formatVersion",
        "bad_format_version",
        `the format version must be 1, not ${named(formatVersion)}`,
      ),
    );
  if (
    !Array.isArray(groups) ||
    groups.length !== TOUR_GROUPS.length ||
    groups.some((group, i) => group !== TOUR_GROUPS[i])
  )
    issues.push(
      issue(
        "groups",
        "bad_groups",
        `the groups must be exactly ${TOUR_GROUPS.join(", ")}, in that order`,
      ),
    );
  if (!Array.isArray(scenarios))
    return [
      ...issues,
      issue("scenarios", "bad_scenarios", "the scenarios must be a list"),
    ];

  return [
    ...issues,
    ...scenarios.flatMap((scenario: unknown, i) =>
      checkScenario(
        scenario,
        `scenarios[${i}]`,
        scenarios.slice(0, i),
        userIds,
      ),
    ),
  ];
}
