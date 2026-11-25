import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the Production group lists its scenarios, each waiting one with the feature it waits for", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Production")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["production-lock", null],
    ["production-locked-page", null],
    ["production-issue-blue", null],
    ["production-recall", null],
    ["production-issue-next", null],
    ["production-omit", null],
    ["production-lock-copy", null],
    ["production-sides", null],
    ["production-nightly", null],
  ]);
});

test("the Tour with its Production scenarios is valid for the demo's people and preparations", () => {
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
