import { expect, test } from "bun:test";
import {
  DEMO_USER_IDS,
  TOUR,
  TOUR_PREPARATIONS,
  validateTour,
} from "../src/index.ts";

test("the Write group lists its scenarios, each waiting one with the feature it waits for", () => {
  expect(
    TOUR.scenarios
      .filter((s) => s.group === "Write")
      .map((s) => [s.id, s.waitsFor]),
  ).toEqual([
    ["write-first-run", null],
    ["write-true-pages", null],
    ["write-more-contd", null],
    ["write-format-switch", null],
    ["write-manuscript", null],
    ["write-stage-play", null],
    ["write-game-script", null],
    ["write-ruler", null],
    ["write-export", null],
    ["write-names", null],
    ["write-podcast-timing", null],
    ["write-outline", null],
    ["write-alternates", null],
    ["write-game-lines", null],
    ["write-ink-play", null],
    ["write-ink-problem", null],
    ["write-adapt", null],
    ["write-board", null],
    ["write-header-footer", null],
    ["write-rename-character", null],
    ["write-read-aloud", null],
    ["write-goal", null],
    ["write-focus", null],
    ["write-numbers", null],
    ["write-layout-engine", null],
  ]);
  expect(
    validateTour(
      TOUR,
      DEMO_USER_IDS,
      TOUR_PREPARATIONS.map((p) => p.id),
    ),
  ).toEqual([]);
});
