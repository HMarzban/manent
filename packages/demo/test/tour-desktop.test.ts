import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const DESKTOP = TOUR.scenarios.filter((s) => s.group === "Desktop");

test("Desktop shows all five scenarios in the desktop app", () => {
  expect(
    DESKTOP.map((s) => [s.id, s.setup.shell, s.waitsFor, s.hidden]),
  ).toEqual([
    ["desktop-offline", "desktop", null, null],
    ["desktop-first-script", "desktop", null, null],
    ["desktop-open-in-browser", "desktop", null, null],
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
