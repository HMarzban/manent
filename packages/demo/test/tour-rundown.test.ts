import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("every Rundown and prompter scenario is ready", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Rundown and prompter")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["rundown-time", null],
    ["rundown-prompter", null],
    ["rundown-send", null],
    ["rundown-feed-lost", null],
    ["rundown-previous-value", null],
    ["rundown-next-week", null],
    ["rundown-print", null],
    ["rundown-remote-prompter", null],
    ["broadcast-mos-bridge", null],
    ["rundown-show-template", null],
    ["rundown-view-and-history", null],
  ]);
});

test("the Tour with its Rundown and prompter scenarios is valid for the demo's people and preparations", () => {
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
