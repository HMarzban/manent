import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the Long documents group shows three scenarios and keeps three waiting for their features", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Long documents")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["long-type-2000", null],
    ["long-book", null],
    ["long-busy-workspace", null],
    ["long-find", "find_bar"],
    ["long-go-to", "go_to_page"],
    ["long-search", "search"],
  ]);
});

test("the Tour with its Long documents scenarios is valid for the demo's people and preparations", () => {
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
