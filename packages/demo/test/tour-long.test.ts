import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the Long documents group lists its seven ready scenarios", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Long documents")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["long-type-2000", null],
    ["long-book", null],
    ["long-busy-workspace", null],
    ["long-find", null],
    ["long-go-to", null],
    ["long-search", null],
    ["long-folders-trash", null],
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
