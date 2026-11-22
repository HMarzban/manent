import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the Work together group lists its scenarios, each waiting one with the feature it waits for", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Work together")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["together-cursors", null],
    ["together-two-tabs", null],
    ["together-add-writers", null],
    ["together-roles", null],
    ["together-settings", null],
    ["together-follow", "follow"],
    ["together-comments", "comments"],
    ["together-reader", "reader_drafts"],
    ["together-suggest", "suggesting"],
    ["together-present", "present"],
    ["together-private", "private_writing"],
    ["together-note", "rounds"],
  ]);
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
