// The Tour is the test plan: every scenario has its end-to-end test, and every Tour test has its scenario.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DEMO_USER_IDS, TOUR, validateTour } from "@manent/demo";
import type { TourFile, TourIssueCode } from "@manent/demo";

export type TourRule = TourIssueCode | "no-test" | "no-scenario" | "no-call";

/** One finding, in the shape of a boundary violation. `line` is 0: the finding is about a file as a whole. */
export interface TourViolation {
  file: string;
  line: number;
  rule: TourRule;
  message: string;
}

const CONTENT_FILE = "packages/demo/src/tour/content.ts";
const TEST_DIR = "e2e/tour";
const TEST_SUFFIX = ".e2e.ts";

const testName = (id: string): string => `${id}${TEST_SUFFIX}`;

/** Whether `text` calls tourScenario with `id` as its first argument; a valid id is kebab-case, so it needs no escaping. */
const callsScenario = (text: string, id: string): boolean =>
  new RegExp(`\\btourScenario\\(\\s*"${id}"\\s*,`).test(text);

/** The findings for `tour` checked against the Tour tests under `root`; empty when the Tour is the test plan. Throws when `root` has no e2e/tour/ folder. */
export async function checkTour(
  root: string,
  tour: unknown,
): Promise<TourViolation[]> {
  const issues = validateTour(tour, DEMO_USER_IDS);
  if (issues.length > 0)
    return issues.map((issue) => ({
      file: CONTENT_FILE,
      line: 0,
      rule: issue.code,
      message: `${issue.path}: ${issue.message}`,
    }));
  // validateTour found nothing wrong, so `tour` is a Tour file
  const { scenarios } = tour as TourFile;
  const tests = (await readdir(join(root, TEST_DIR))).filter((name) =>
    name.endsWith(TEST_SUFFIX),
  );
  const violations: TourViolation[] = [];
  for (const { id } of scenarios) {
    const name = testName(id);
    const file = `${TEST_DIR}/${name}`;
    if (!tests.includes(name))
      violations.push({
        file,
        line: 0,
        rule: "no-test",
        message: `scenario ${id} has no test`,
      });
    else if (!callsScenario(await Bun.file(join(root, file)).text(), id))
      violations.push({
        file,
        line: 0,
        rule: "no-call",
        message: `test does not call tourScenario("${id}")`,
      });
  }
  const scenarioTests = new Set(scenarios.map(({ id }) => testName(id)));
  for (const name of tests.toSorted())
    if (!scenarioTests.has(name))
      violations.push({
        file: `${TEST_DIR}/${name}`,
        line: 0,
        rule: "no-scenario",
        message: "test has no scenario in the Tour",
      });
  return violations;
}

if (import.meta.main) {
  const violations = await checkTour(process.cwd(), TOUR);
  for (const v of violations)
    console.log(`${v.file}:${v.line} ${v.rule} ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log(`tour: ${TOUR.scenarios.length} scenarios, each with its test`);
}
