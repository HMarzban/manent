// The Tour is the test plan: every scenario has its end-to-end test, and every Tour test has its scenario.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { COMMANDS } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  TOUR_TARGETS,
  isShown,
  validateTour,
} from "@manent/demo";
import type { TourFile, TourIssueCode, TourScenario } from "@manent/demo";
import { COLOUR_NAMES, COLOUR_ORDERS } from "@manent/revisions";

export type TourRule =
  | TourIssueCode
  | "no-test"
  | "no-scenario"
  | "no-call"
  | "unknown-target"
  | "waiting-has-test"
  | "step-label";

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

// Every revision a label that names one may name: the standard colour order, as the production state names it.
const REVISION_NAMES = COLOUR_ORDERS.standard.map((c) => COLOUR_NAMES[c]);

/** A locked script on a document, whose label for a revision names `name` as both the active one and the one to recall. */
const naming = (name: string): CommandContext => ({
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: true,
  signedIn: true,
  panelOpen: { left: false, side: false },
  historyPresent: true,
  format: "screenplay",
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  docKind: null,
  projectKind: null,
  outlineStart: false,
  writing: null,
  material: null,
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: false,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
  production: {
    locked: true,
    canLock: true,
    canIssue: true,
    recallOpen: true,
    waiting: 0,
    activeName: name,
    recallName: name,
    selection: null,
    mode: "collated",
    tint: false,
  },
});

// a switch is either way round
const SWITCH_READS = [true, false].map((on) => ({ get: () => on }));

/** Every way a command's label may read: each revision it may name, each way a switch is, and the part after "{submenu}: ". */
function labelsOf(command: CommandDefinition): string[] {
  const { label } = command;
  const labels =
    typeof label === "string"
      ? [label]
      : REVISION_NAMES.flatMap((name) =>
          SWITCH_READS.map((read) => label(naming(name), read)),
        );
  return labels.flatMap((text) => {
    const at = text.indexOf(": ");
    return at === -1 ? [text] : [text, text.slice(at + 2)];
  });
}

/** The highlight and label findings of one scenario's steps. */
function stepViolations(
  { id, steps }: TourScenario,
  file: string,
): TourViolation[] {
  return steps.flatMap(({ text, highlight }, i): TourViolation[] => {
    const step = `scenario ${id}: step ${i + 1}`;
    const command = COMMANDS.find((c) => c.id === highlight);
    if (command === undefined)
      return TOUR_TARGETS.some((target) => target === highlight)
        ? []
        : [
            {
              file,
              line: 0,
              rule: "unknown-target",
              message: `${step} highlights ${highlight}`,
            },
          ];
    const labels = labelsOf(command);
    return labels.some((label) => text.includes(label))
      ? []
      : [
          {
            file,
            line: 0,
            rule: "step-label",
            message: `${step} does not say ${labels[0]}`,
          },
        ];
  });
}

/** The findings for `tour` checked against the Tour tests under `root`; empty when the Tour is the test plan. Throws when `root` has no e2e/tour/ folder. */
export async function checkTour(
  root: string,
  tour: unknown,
): Promise<TourViolation[]> {
  const issues = validateTour(
    tour,
    DEMO_USER_IDS,
    TOUR_PREPARATIONS.map((p) => p.id),
  );
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
  const violations = scenarios.flatMap((scenario) =>
    stepViolations(scenario, CONTENT_FILE),
  );
  for (const scenario of scenarios) {
    const { id } = scenario;
    const name = testName(id);
    const file = `${TEST_DIR}/${name}`;
    if (scenario.waitsFor !== null) {
      if (tests.includes(name))
        violations.push({
          file,
          line: 0,
          rule: "waiting-has-test",
          message: `scenario ${id} waits for ${scenario.waitsFor} and has a test`,
        });
      continue;
    }
    // a hidden scenario may keep its test, which registers none
    if (!isShown(scenario)) continue;
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
