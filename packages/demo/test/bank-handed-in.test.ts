import { expect, test } from "bun:test";
import { HANDED_IN_GUIDE } from "../src/generate/index.ts";
import type { LineIntent } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(HANDED_IN_GUIDE);

const count = (intent: LineIntent): number =>
  HANDED_IN_GUIDE.dialogue.filter((line) => line.intent === intent).length;

test("Handed In is a Variety script whose lines run to thirty words", () => {
  expect(HANDED_IN_GUIDE.format).toBe("variety");
  expect(HANDED_IN_GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 30,
    sentenceWords: 0,
    banned: [],
  });
});

test("the bank holds three hundred lines, forty tags and five parts an episode", () => {
  expect(HANDED_IN_GUIDE.cast.length).toBe(6);
  expect(HANDED_IN_GUIDE.action.length).toBe(0);
  expect(HANDED_IN_GUIDE.dialogue.length).toBe(300);
  expect(HANDED_IN_GUIDE.tags.length).toBe(40);
  expect(HANDED_IN_GUIDE.beats.length).toBe(20);
  expect(HANDED_IN_GUIDE.stories.length).toBe(4);
  expect(HANDED_IN_GUIDE.barks.length).toBe(0);
  expect(HANDED_IN_GUIDE.places.length).toBe(11);
  expect(HANDED_IN_GUIDE.names.length).toBe(4);
  expect(HANDED_IN_GUIDE.vocabulary.length).toBe(14);
});

test("every question has an answer to meet it, and a quarter of the lines suit anyone", () => {
  const open = HANDED_IN_GUIDE.dialogue.filter((line) => line.speaker === null);
  expect(count("answer")).toBeGreaterThanOrEqual(count("ask"));
  expect(open.length * 4).toBeGreaterThanOrEqual(
    HANDED_IN_GUIDE.dialogue.length,
  );
});

test("each episode runs to its time and carries ten cue brackets", () => {
  expect(
    HANDED_IN_GUIDE.stories.map((story) => [
      story.slug,
      story.durMs,
      story.lines.length,
      story.brackets.length,
    ]),
  ).toEqual([
    ["ep1", 1_120_000, 0, 10],
    ["ep2", 1_265_000, 0, 10],
    ["ep3", 1_170_000, 0, 10],
    ["ep4", 850_000, 0, 10],
  ]);
});

test("each episode's five parts follow on from one another, page by page", () => {
  expect(
    HANDED_IN_GUIDE.beats.map((beat) => [beat.id, beat.scenes, beat.pages]),
  ).toEqual([
    ["small/handed-in/ep1#1", [1, 1], [1, 2]],
    ["small/handed-in/ep1#2", [2, 2], [2, 4]],
    ["small/handed-in/ep1#3", [3, 3], [4, 8]],
    ["small/handed-in/ep1#4", [4, 4], [8, 12]],
    ["small/handed-in/ep1#5", [5, 5], [12, 15]],
    ["small/handed-in/ep2#1", [1, 1], [1, 2]],
    ["small/handed-in/ep2#2", [2, 2], [2, 5]],
    ["small/handed-in/ep2#3", [3, 3], [5, 10]],
    ["small/handed-in/ep2#4", [4, 4], [10, 15]],
    ["small/handed-in/ep2#5", [5, 5], [15, 17]],
    ["small/handed-in/ep3#1", [1, 1], [1, 2]],
    ["small/handed-in/ep3#2", [2, 2], [2, 5]],
    ["small/handed-in/ep3#3", [3, 3], [5, 9]],
    ["small/handed-in/ep3#4", [4, 4], [9, 13]],
    ["small/handed-in/ep3#5", [5, 5], [13, 15]],
    ["small/handed-in/ep4#1", [1, 1], [1, 2]],
    ["small/handed-in/ep4#2", [2, 2], [2, 4]],
    ["small/handed-in/ep4#3", [3, 3], [4, 7]],
    ["small/handed-in/ep4#4", [4, 4], [7, 10]],
    ["small/handed-in/ep4#5", [5, 5], [10, 11]],
  ]);
});

test("every part names only the podcast's cast and places", () => {
  const cues = new Set(HANDED_IN_GUIDE.cast.map((member) => member.cue));
  const places = new Set(HANDED_IN_GUIDE.places);
  const beats = HANDED_IN_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast.filter((c) => !cues.has(c))),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places.filter((p) => !places.has(p))),
  ).toEqual([]);
});

test("no entry holds an unlisted name, a repeat or a line too long for the podcast", () => {
  expect(checkBank(HANDED_IN_GUIDE, OTHERS)).toEqual([]);
});
