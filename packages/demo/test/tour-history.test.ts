import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the History group holds its scenarios in order, each ready for its feature", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "History")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["history-every-version", null],
    ["history-changes-since", null],
    ["history-changes-prose", null],
    ["history-restore-scene", null],
    ["history-name-draft", null],
    ["history-who-wrote", null],
    ["history-view-version", null],
    ["history-restore-reverse", null],
    ["history-send-draft", null],
    ["history-version-link", null],
  ]);
});

test("History shows every passing scenario", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "History" && s.waitsFor === null)
      .map((s) => [s.id, s.hidden]),
  ).toEqual([
    ["history-every-version", null],
    ["history-changes-since", null],
    ["history-changes-prose", null],
    ["history-restore-scene", null],
    ["history-name-draft", null],
    ["history-who-wrote", null],
    ["history-view-version", null],
    ["history-restore-reverse", null],
    ["history-send-draft", null],
    ["history-version-link", null],
  ]);
});

test("the Tour with its History scenarios is valid for the demo's people and preparations", () => {
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
