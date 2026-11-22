import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

const NOT_PASSING = "its end-to-end test does not pass yet";
const OFFLINE = TOUR.scenarios.filter((s) => s.group === "Go offline");

test("Go offline shows three scenarios, hides three whose test does not pass yet, and waits for the sign-out guard", () => {
  expect(OFFLINE.map((s) => [s.id, s.waitsFor, s.hidden])).toEqual([
    ["offline-write", null, null],
    ["offline-overlap", null, NOT_PASSING],
    ["offline-recovered", null, NOT_PASSING],
    ["offline-slow", null, null],
    ["offline-server-stopped", null, null],
    ["offline-reorganised", null, NOT_PASSING],
    ["offline-sign-out", "sign_out_guard", null],
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
