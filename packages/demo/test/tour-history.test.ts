import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the History group holds its scenarios in order, and the one still to come names what it waits for", () => {
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
    ["history-send-draft", "send_draft"],
  ]);
});

test("every History scenario that is built is hidden until its end-to-end test passes", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "History" && s.waitsFor === null)
      .map((s) => [s.id, s.hidden]),
  ).toEqual(
    [
      "history-every-version",
      "history-changes-since",
      "history-changes-prose",
      "history-restore-scene",
      "history-name-draft",
      "history-who-wrote",
      "history-view-version",
      "history-restore-reverse",
    ].map((id) => [id, "its end-to-end test does not pass yet"]),
  );
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
