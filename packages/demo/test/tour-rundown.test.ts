import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("every Rundown and prompter scenario waits for the rundowns or the prompter", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Rundown and prompter")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["rundown-time", "rundowns"],
    ["rundown-prompter", "prompter"],
    ["rundown-send", "prompter"],
    ["rundown-feed-lost", "prompter"],
    ["rundown-previous-value", "rundowns"],
    ["rundown-next-week", "rundowns"],
    ["rundown-print", "rundowns"],
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
