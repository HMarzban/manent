import { expect, test } from "bun:test";
import { LATE_DESK_GUIDE } from "../src/generate/banks/medium/the-late-desk.ts";
import {
  checkBank,
  othersThan,
  storyDurationMs,
} from "./support/bank-rules.ts";

const OTHERS = othersThan(LATE_DESK_GUIDE);

test("the late show's bank holds its scripts and nothing to generate from", () => {
  expect(LATE_DESK_GUIDE.format).toBe("variety");
  expect(LATE_DESK_GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 25,
    sentenceWords: 20,
    banned: [
      /\b(shocking|amazing|tragic|disgraceful|brilliant|outrageous|stunning|horrific|incredible|terrible|wonderful)\b/i,
    ],
  });
  expect(LATE_DESK_GUIDE.cast.length).toBe(3);
  expect(LATE_DESK_GUIDE.places.length).toBe(0);
  expect(LATE_DESK_GUIDE.names.length).toBe(20);
  expect(LATE_DESK_GUIDE.vocabulary.length).toBe(0);
  expect(LATE_DESK_GUIDE.beats.length).toBe(0);
  expect(LATE_DESK_GUIDE.action.length).toBe(0);
  expect(LATE_DESK_GUIDE.dialogue).toEqual([]);
  expect(LATE_DESK_GUIDE.tags.length).toBe(0);
  expect(LATE_DESK_GUIDE.stories.length).toBe(9);
  expect(LATE_DESK_GUIDE.barks.length).toBe(0);
});

test("the late show's bank keeps its voice and holds no name it does not declare", () => {
  expect(checkBank(LATE_DESK_GUIDE, OTHERS)).toEqual([]);
});

test("each of the late show's scripts belongs to its row of the rundown", () => {
  expect(
    LATE_DESK_GUIDE.stories.map((story) => ({
      slug: story.slug,
      durMs: story.durMs,
    })),
  ).toEqual([
    { slug: "segments/1", durMs: 130_000 },
    { slug: "segments/4", durMs: 260_000 },
    { slug: "segments/5", durMs: 220_000 },
    { slug: "segments/7", durMs: 40_000 },
    { slug: "segments/9", durMs: 245_000 },
    { slug: "segments/10", durMs: 35_000 },
    { slug: "segments/12", durMs: 25_000 },
    { slug: "segments/14", durMs: 20_000 },
    { slug: "segments/16", durMs: 30_000 },
  ]);
});

test("each of the late show's scripts reads within two seconds of its row's time", () => {
  expect(
    LATE_DESK_GUIDE.stories.map((story) => ({
      slug: story.slug,
      onTime: Math.abs(storyDurationMs(story) - story.durMs) <= 2_000,
    })),
  ).toEqual(
    [
      "segments/1",
      "segments/4",
      "segments/5",
      "segments/7",
      "segments/9",
      "segments/10",
      "segments/12",
      "segments/14",
      "segments/16",
    ].map((slug) => ({ slug, onTime: true })),
  );
});
