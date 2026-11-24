import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as CONTENT from "../src/content/index.ts";
import {
  SEED_DOCS,
  SEED_PROJECTS,
  TOUR,
  TOUR_FEATURES,
  TOUR_RELEASED,
  docPath,
  draftLinkPath,
  seedDoc,
  seedProject,
} from "../src/index.ts";
import type { SeedWorkspaceId, TourScenario } from "../src/index.ts";

const DOC_AT = new Map(SEED_DOCS.map((d) => [docPath(d.key), d]));
const DRAFT_LINK_AT = new Map([
  [
    draftLinkPath("medium/the-long-night/script", "Blue"),
    seedDoc("medium/the-long-night/script"),
  ],
]);
const PROJECT_BOARDS = new Map(
  SEED_PROJECTS.map((p) => [`/p/${p.projectId}/board`, p]),
);

const STEPS_DIR = join(import.meta.dir, "../src/seed/steps");

// The fixed passages the Tour reads on the page, each with the evidence string it holds.
const READ_BY_THE_TOUR: Readonly<Record<string, string>> = {
  EKBO_SCENE_14_FIRST: "No. Play me a C. The top one.",
  JUMPOX_CHAPTER_1: "On Tuesdays the bin lorry came down Mallow Street",
  DOWN_THE_BACK_HEADINGS: "Mrs. Lomax's Spectacles",
  DOWN_THE_BACK_SCENES_1_2: "Scene 1: Mallow Street",
  FERRY_SCENE_8_WORKING: "The pencil marks stop at Thursday.",
  NEWS_STORY_01: "thirty-one votes to eight",
};

const HIDDEN_REASONS = {
  any: ["its end-to-end test does not pass yet"],
  desktop: [
    "its end-to-end test does not pass yet",
    "the desktop shell is deferred",
  ],
} as const;

function windowsOf(scenario: TourScenario) {
  return [scenario.setup, ...scenario.setup.extraWindows];
}

/** The workspace a window opens: the Library counts only for Your desk, opened as you. */
function workspaceOpened(userId: string, open: string): SeedWorkspaceId | null {
  if (open === "/") return userId === "you" ? "you" : null;
  const board = PROJECT_BOARDS.get(open);
  if (board !== undefined) return board.workspaceId;
  const doc = DOC_AT.get(open) ?? DRAFT_LINK_AT.get(open);
  return doc === undefined ? null : seedProject(doc.projectKey).workspaceId;
}

test("every scenario opens a seeded document, draft link, project board, or the Library", () => {
  expect(
    TOUR.scenarios.flatMap((s) =>
      windowsOf(s)
        .filter(
          (w) =>
            w.open !== "/" &&
            !DOC_AT.has(w.open) &&
            !DRAFT_LINK_AT.has(w.open) &&
            !PROJECT_BOARDS.has(w.open),
        )
        .map((w) => `${s.id}: ${w.open}`),
    ),
  ).toEqual([]);
});

test("every seeded workspace has a scenario that opens it", () => {
  const reached = new Set(
    TOUR.scenarios
      .filter((s) => s.waitsFor === null)
      .flatMap((s) => windowsOf(s))
      .map((w) => workspaceOpened(w.userId, w.open))
      .filter((id) => id !== null),
  );
  expect([...reached].toSorted()).toEqual(["heavy", "medium", "small", "you"]);
});

test("every fixed passage is read by a scenario or a seed check", () => {
  const named = new Set(
    readdirSync(STEPS_DIR).flatMap(
      (file) => readFileSync(join(STEPS_DIR, file), "utf8").match(/\w+/g) ?? [],
    ),
  );
  expect(Object.keys(CONTENT).filter((name) => !named.has(name))).toEqual([]);
  const evidence = TOUR.scenarios.flatMap((s) => s.evidence);
  const passages: Readonly<Record<string, string>> = CONTENT;
  expect(
    Object.entries(READ_BY_THE_TOUR)
      .filter(
        ([name, read]) =>
          !evidence.some((item) => item.includes(read)) ||
          !(passages[name] ?? "").includes(read),
      )
      .map(([name]) => name),
  ).toEqual([]);
});

test("every feature the Tour waits for has a waiting scenario", () => {
  const awaited = new Set(TOUR.scenarios.map((s) => s.waitsFor));
  expect(
    TOUR_FEATURES.filter((f) => !awaited.has(f) && !TOUR_RELEASED.includes(f)),
  ).toEqual([]);
});

test("a scenario is hidden only for a stated reason", () => {
  expect(
    TOUR.scenarios
      .filter(
        (s) =>
          s.hidden !== null &&
          !HIDDEN_REASONS[s.setup.shell].some((r) => r === s.hidden),
      )
      .map((s) => `${s.id}: ${s.hidden}`),
  ).toEqual([]);
});
