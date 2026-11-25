import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const NOT_PASSING = "its end-to-end test does not pass yet";
const DESKTOP = TOUR.scenarios.filter((s) => s.group === "Desktop");

test("Desktop shows three scenarios in the desktop app and hides two whose test does not pass yet", () => {
  expect(
    DESKTOP.map((s) => [s.id, s.setup.shell, s.waitsFor, s.hidden]),
  ).toEqual([
    ["desktop-offline", "desktop", null, null],
    ["desktop-first-script", "desktop", null, NOT_PASSING],
    ["desktop-open-in-browser", "desktop", null, NOT_PASSING],
    ["desktop-files", "desktop", null, null],
    ["desktop-prompter-files", "desktop", null, null],
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
