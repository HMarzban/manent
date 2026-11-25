// The Tour's file format, and the checker every Tour file passes.
import { TOUR_FEATURES } from "./features.ts";
import type { TourFeature } from "./features.ts";
import { TOUR_RELEASED } from "./released.ts";

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
  setup: TourWindow & {
    /** Up to two more windows, each opened with its side panel closed. */
    extraWindows: readonly TourWindow[];
    /** A TOUR_PREPARATIONS id, run on the server before the windows open; null for none. */
    prepare: string | null;
    shell: "any" | "desktop";
  };
  /** Two to four; `highlight` is a command's id or a TourTarget. */
  steps: readonly { text: string; highlight: string }[];
  /** The observable proof, in the product's exact words. */
  check: string;
  /** One to four exact strings the product shows, each found in `check`. */
  evidence: readonly string[];
  /** Its test starts from a new seed. */
  fresh: boolean;
  /** Set: not shown, and it has no test. */
  waitsFor: TourFeature | null;
  /** Set: built, but not shown in this run; the reason, one clause. */
  hidden: string | null;
}

export interface TourFile {
  formatVersion: 2;
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
  "bad_evidence",
  "bad_feature",
  "bad_prepare",
  "bad_shell",
  "bad_hidden",
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
const MAX_EXTRA_WINDOWS = 2;
const MAX_EVIDENCE = 4;

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Whether the Tour lists a scenario and its test runs: nothing waits for it and nothing hides it. */
export function isShown(scenario: TourScenario): boolean {
  return scenario.waitsFor === null && scenario.hidden === null;
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

/** No issue when `held`; otherwise the one issue. */
function unless(
  held: boolean,
  path: string,
  code: TourIssueCode,
  message: string,
): TourIssue[] {
  return held ? [] : [issue(path, code, message)];
}

function checkWindow(
  tourWindow: Fields,
  path: string,
  userIds: readonly string[],
): TourIssue[] {
  const { userId, open } = tourWindow;
  return [
    ...unless(
      typeof userId === "string" && userIds.includes(userId),
      `${path}.userId`,
      "unknown_user",
      `the user ${named(userId)} is not one of ${userIds.join(", ")}`,
    ),
    ...unless(
      typeof open === "string" && open.startsWith("/"),
      `${path}.open`,
      "bad_path",
      `an app path must start with "/", not ${named(open)}`,
    ),
  ];
}

/** The ids a scenario's windows and set-up may name. */
interface Known {
  userIds: readonly string[];
  prepareIds: readonly string[];
}

function checkSetup(setup: unknown, path: string, known: Known): TourIssue[] {
  if (!isObject(setup))
    return [issue(path, "bad_setup", "the setup must be an object")];
  const { extraWindows, prepare, shell } = setup;
  const windows =
    Array.isArray(extraWindows) &&
    extraWindows.length <= MAX_EXTRA_WINDOWS &&
    extraWindows.every(isObject)
      ? extraWindows
      : null;
  return [
    ...checkWindow(setup, path, known.userIds),
    ...unless(
      windows !== null,
      `${path}.extraWindows`,
      "bad_window",
      `the extra windows must be a list of 0 to ${MAX_EXTRA_WINDOWS} windows, not ${named(extraWindows)}`,
    ),
    ...(windows ?? []).flatMap((extra, i) =>
      checkWindow(extra, `${path}.extraWindows[${i}]`, known.userIds),
    ),
    ...unless(
      prepare === null ||
        (typeof prepare === "string" && known.prepareIds.includes(prepare)),
      `${path}.prepare`,
      "bad_prepare",
      `a preparation must be null or one of ${known.prepareIds.join(", ")}, not ${named(prepare)}`,
    ),
    ...unless(
      shell === "any" || shell === "desktop",
      `${path}.shell`,
      "bad_shell",
      `a shell must be "any" or "desktop", not ${named(shell)}`,
    ),
  ];
}

/** The evidence, and what keeps a scenario out of the Tour. */
function checkProof(scenario: Fields, path: string): TourIssue[] {
  const { check, evidence, waitsFor, hidden } = scenario;
  const found = (text: unknown): boolean =>
    isFilled(text) && typeof check === "string" && check.includes(text);
  return [
    ...unless(
      Array.isArray(evidence) &&
        evidence.length >= 1 &&
        evidence.length <= MAX_EVIDENCE &&
        evidence.every(found),
      `${path}.evidence`,
      "bad_evidence",
      `the evidence must be 1 to ${MAX_EVIDENCE} strings, each found in the check`,
    ),
    ...unless(
      waitsFor === null ||
        (TOUR_FEATURES.some((f) => f === waitsFor) &&
          !TOUR_RELEASED.some((f) => f === waitsFor)),
      `${path}.waitsFor`,
      "bad_feature",
      `a scenario waits for null or one of the Tour's features not yet released, not ${named(waitsFor)}`,
    ),
    ...unless(
      hidden === null || isFilled(hidden),
      `${path}.hidden`,
      "bad_hidden",
      `the reason a scenario is hidden must be null or a clause, not ${named(hidden)}`,
    ),
  ];
}

function checkSteps(steps: unknown, path: string): TourIssue[] {
  const counted =
    Array.isArray(steps) &&
    steps.length >= MIN_STEPS &&
    steps.length <= MAX_STEPS;
  if (!counted)
    return [
      issue(
        path,
        "bad_steps",
        `a scenario needs ${MIN_STEPS} to ${MAX_STEPS} steps`,
      ),
    ];
  return steps.flatMap((step: unknown, i) => {
    const fields = isObject(step) ? step : {};
    return (["text", "highlight"] as const).flatMap((field) =>
      unless(
        isFilled(fields[field]),
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
  known: Known,
): TourIssue[] {
  if (!isObject(scenario))
    return [issue(path, "bad_scenario", "a scenario must be an object")];
  const { id, group } = scenario;
  const kebab = typeof id === "string" && KEBAB.test(id);
  const reused =
    kebab && earlier.some((other) => isObject(other) && other.id === id);
  return [
    ...unless(
      kebab,
      `${path}.id`,
      "bad_id",
      `an id must be kebab-case, not ${named(id)}`,
    ),
    ...unless(
      !reused,
      `${path}.id`,
      "duplicate_id",
      `the id ${String(id)} is already used`,
    ),
    ...unless(
      TOUR_GROUPS.some((g) => g === group),
      `${path}.group`,
      "bad_group",
      `a group must be one of the ${TOUR_GROUPS.length} Tour groups, not ${named(group)}`,
    ),
    ...(["promise", "check"] as const).flatMap((field) =>
      unless(
        isFilled(scenario[field]),
        `${path}.${field}`,
        "empty_text",
        `the ${field} is empty`,
      ),
    ),
    ...checkProof(scenario, path),
    ...checkSteps(scenario.steps, `${path}.steps`),
    ...checkSetup(scenario.setup, `${path}.setup`, known),
  ];
}

/** Every way `file` falls short of a Tour file naming the people `userIds` and preparations `prepareIds`. Never throws. */
export function validateTour(
  file: unknown,
  userIds: readonly string[],
  prepareIds: readonly string[],
): TourIssue[] {
  if (!isObject(file))
    return [issue("", "not_an_object", "a Tour file must be a JSON object")];
  const { formatVersion, groups, scenarios } = file;
  const list: readonly unknown[] = Array.isArray(scenarios) ? scenarios : [];
  const known = { userIds, prepareIds };
  return [
    ...unless(
      formatVersion === 2,
      "formatVersion",
      "bad_format_version",
      `the format version must be 2, not ${named(formatVersion)}`,
    ),
    ...unless(
      Array.isArray(groups) &&
        groups.length === TOUR_GROUPS.length &&
        groups.every((group, i) => group === TOUR_GROUPS[i]),
      "groups",
      "bad_groups",
      `the groups must be exactly ${TOUR_GROUPS.join(", ")}, in that order`,
    ),
    ...unless(
      Array.isArray(scenarios),
      "scenarios",
      "bad_scenarios",
      "the scenarios must be a list",
    ),
    ...list.flatMap((scenario, i) =>
      checkScenario(scenario, `scenarios[${i}]`, list.slice(0, i), known),
    ),
  ];
}
