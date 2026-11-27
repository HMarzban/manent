import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const OFFLINE = TOUR.scenarios.filter((s) => s.group === "Go offline");

test("Go offline shows all six scenarios", () => {
  expect(OFFLINE.map((s) => [s.id, s.waitsFor, s.hidden])).toEqual([
    ["offline-write", null, null],
    ["offline-overlap", null, null],
    ["offline-recovered", null, null],
    ["offline-slow", null, null],
    ["offline-server-stopped", null, null],
    ["offline-sign-out", null, null],
  ]);
});

test("the Go offline scenarios are a valid Tour for the demo's people", () => {
  expect(
    validateTour(
      { ...TOUR, scenarios: OFFLINE },
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
