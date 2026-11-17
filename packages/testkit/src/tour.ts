// The Tour: short scenarios the demo walks a visitor through, one group at a time.

export const TOUR_GROUPS = [
  "Write",
  "Work together",
  "Go offline",
  "Versions",
  "Production",
  "Long documents",
  "Rundown and prompter",
  "Desktop",
] as const;

export type TourGroup = (typeof TOUR_GROUPS)[number];

/** A window the scenario opens: a person's id and an app path starting "/". */
export interface TourWindow {
  person: string;
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
  groups: TourGroup[];
  scenarios: TourScenario[];
}

export interface TourProblem {
  /** The scenario's id, or null for the file itself. */
  scenario: string | null;
  problem: string;
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

/** Every way `file` falls short of a Tour file; empty when it is a valid one. */
export function validateTour(
  file: unknown,
  people: readonly string[],
): TourProblem[] {
  if (!isObject(file))
    return [{ scenario: null, problem: "The file is not a JSON object." }];

  const problems: TourProblem[] = [];
  const fileProblem = (problem: string) =>
    problems.push({ scenario: null, problem });

  if (file.formatVersion !== 1) fileProblem("formatVersion must be 1.");

  const groups = file.groups;
  if (
    !Array.isArray(groups) ||
    groups.length !== TOUR_GROUPS.length ||
    groups.some((group, i) => group !== TOUR_GROUPS[i])
  )
    fileProblem(
      `groups must be exactly ${TOUR_GROUPS.join(", ")}, in that order.`,
    );

  if (!Array.isArray(file.scenarios)) {
    fileProblem("scenarios must be a list.");
    return problems;
  }

  const seen = new Set<string>();
  file.scenarios.forEach((scenario: unknown, index) => {
    if (!isObject(scenario)) {
      fileProblem(`scenarios[${index}] is not an object.`);
      return;
    }
    const id = typeof scenario.id === "string" ? scenario.id : null;
    const report = (problem: string) =>
      problems.push({ scenario: id, problem });

    if (id === null || !KEBAB.test(id))
      report(
        "id must be kebab-case: lower-case letters and digits joined by single hyphens.",
      );
    else if (seen.has(id))
      report(`id ${id} is used by more than one scenario.`);
    if (id !== null) seen.add(id);

    if (!TOUR_GROUPS.includes(scenario.group as TourGroup))
      report("group must be one of the eight Tour groups.");
    if (!isFilled(scenario.promise)) report("promise must not be empty.");
    if (!isFilled(scenario.check)) report("check must not be empty.");

    const steps = scenario.steps;
    if (
      !Array.isArray(steps) ||
      steps.length < MIN_STEPS ||
      steps.length > MAX_STEPS
    ) {
      report(`steps must hold ${MIN_STEPS} to ${MAX_STEPS} steps.`);
    } else {
      steps.forEach((step: unknown, i) => {
        const fields = isObject(step) ? step : {};
        if (!isFilled(fields.text))
          report(`steps[${i}].text must not be empty.`);
        if (!isFilled(fields.highlight))
          report(`steps[${i}].highlight must not be empty.`);
      });
    }

    const setup = scenario.setup;
    if (!isObject(setup)) {
      report("setup must be an object.");
      return;
    }
    checkWindow(setup, "setup", people, report);
    if (setup.secondWindow === null) return;
    if (!isObject(setup.secondWindow))
      report("setup.secondWindow must be a window or null.");
    else checkWindow(setup.secondWindow, "setup.secondWindow", people, report);
  });

  return problems;
}

function checkWindow(
  tourWindow: Fields,
  path: string,
  people: readonly string[],
  report: (problem: string) => void,
): void {
  if (
    typeof tourWindow.person !== "string" ||
    !people.includes(tourWindow.person)
  )
    report(`${path}.person must be one of: ${people.join(", ")}.`);
  if (typeof tourWindow.open !== "string" || !tourWindow.open.startsWith("/"))
    report(`${path}.open must be an app path starting with "/".`);
}
