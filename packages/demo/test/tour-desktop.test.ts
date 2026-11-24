import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const NOT_PASSING = "its end-to-end test does not pass yet";
const DESKTOP = TOUR.scenarios.filter((s) => s.group === "Desktop");

test("Desktop hides three scenarios whose test does not pass yet, and waits for two features", () => {
  expect(
    DESKTOP.map((s) => [s.id, s.setup.shell, s.waitsFor, s.hidden]),
  ).toEqual([
    ["desktop-offline", "desktop", null, NOT_PASSING],
    ["desktop-first-script", "desktop", null, NOT_PASSING],
    ["desktop-open-in-browser", "desktop", null, NOT_PASSING],
    ["desktop-files", "desktop", "imports", null],
    ["desktop-prompter-files", "desktop", "prompter_files", null],
  ]);
});

test("the Desktop scenarios are a valid Tour for the demo's people", () => {
  expect(
    validateTour(
      { ...TOUR, scenarios: DESKTOP },
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
