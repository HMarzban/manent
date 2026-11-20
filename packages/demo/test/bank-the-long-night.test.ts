import { expect, test } from "bun:test";
import { LONG_NIGHT_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(LONG_NIGHT_GUIDE);

test("the bank holds its counts of each list", () => {
  expect(LONG_NIGHT_GUIDE.cast.length).toBe(10);
  expect(LONG_NIGHT_GUIDE.places.length).toBe(18);
  expect(LONG_NIGHT_GUIDE.names.length).toBe(2);
  expect(LONG_NIGHT_GUIDE.vocabulary.length).toBe(7);
  expect(LONG_NIGHT_GUIDE.beats.length).toBe(11);
  expect(LONG_NIGHT_GUIDE.action.length).toBe(300);
  expect(LONG_NIGHT_GUIDE.dialogue.length).toBe(380);
  expect(LONG_NIGHT_GUIDE.tags.length).toBe(40);
  expect(LONG_NIGHT_GUIDE.stories.length).toBe(0);
  expect(LONG_NIGHT_GUIDE.barks.length).toBe(0);
});

test("The Long Night is a screenplay with short action lines", () => {
  expect(LONG_NIGHT_GUIDE.format).toBe("screenplay");
  expect(LONG_NIGHT_GUIDE.style).toEqual({
    actionWords: 20,
    dialogueWords: 30,
    sentenceWords: 20,
    banned: [],
  });
});

test("the eleven beats run from scene 7 on page 5 to scene 96 on page 112", () => {
  const beats = LONG_NIGHT_GUIDE.beats;
  expect(beats.map((beat) => beat.id)).toEqual([
    "medium/the-long-night/script#1",
    "medium/the-long-night/script#2",
    "medium/the-long-night/script#3",
    "medium/the-long-night/script#4",
    "medium/the-long-night/script#5",
    "medium/the-long-night/script#6",
    "medium/the-long-night/script#7",
    "medium/the-long-night/script#8",
    "medium/the-long-night/script#9",
    "medium/the-long-night/script#10",
    "medium/the-long-night/script#11",
  ]);
  expect(beats.map((beat) => beat.scenes)).toEqual([
    [7, 12],
    [13, 20],
    [21, 24],
    [25, 29],
    [30, 41],
    [42, 52],
    [53, 64],
    [65, 74],
    [75, 84],
    [85, 92],
    [93, 96],
  ]);
  expect(beats.map((beat) => beat.pages)).toEqual([
    [5, 9],
    [9, 14],
    [14, 17],
    [17, 22],
    [23, 36],
    [36, 48],
    [48, 64],
    [64, 78],
    [78, 92],
    [92, 106],
    [106, 112],
  ]);
});

test("every cue and place a beat names is in the cast and the places", () => {
  const cues = new Set(LONG_NIGHT_GUIDE.cast.map((member) => member.cue));
  const places = new Set(LONG_NIGHT_GUIDE.places);
  const beats = LONG_NIGHT_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((cue) => !cues.has(cue)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((place) => !places.has(place)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = LONG_NIGHT_GUIDE.dialogue;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 81,
    answers: 98,
    anyone: 110,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every entry keeps to the voice of the film", () => {
  expect(checkBank(LONG_NIGHT_GUIDE, OTHERS)).toEqual([]);
});
