import { expect, test } from "bun:test";
import { WARD_NINE_GUIDE } from "../src/generate/index.ts";
import type { Beat } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(WARD_NINE_GUIDE);

const EPISODES = [
  "401",
  "402",
  "403",
  "404",
  "405",
  "406",
  "407",
  "408",
] as const;

const beatsOf = (episode: string): Beat[] =>
  WARD_NINE_GUIDE.beats.filter((beat) =>
    beat.id.startsWith(`heavy/h24/${episode}#`),
  );

const seasonOf = (beat: Beat): string =>
  beat.id.slice("heavy/h24/".length, "heavy/h24/".length + 1);

test("the bank holds its counts of each list", () => {
  expect(WARD_NINE_GUIDE.cast.length).toBe(9);
  expect(WARD_NINE_GUIDE.places.length).toBe(14);
  expect(WARD_NINE_GUIDE.names.length).toBe(1);
  expect(WARD_NINE_GUIDE.vocabulary.length).toBe(7);
  expect(WARD_NINE_GUIDE.beats.length).toBe(96);
  expect(WARD_NINE_GUIDE.action.length).toBe(300);
  expect(WARD_NINE_GUIDE.dialogue.length).toBe(300);
  expect(WARD_NINE_GUIDE.tags.length).toBe(40);
  expect(WARD_NINE_GUIDE.stories.length).toBe(0);
  expect(WARD_NINE_GUIDE.barks.length).toBe(0);
});

test("Ward Nine is a screenplay", () => {
  expect(WARD_NINE_GUIDE.format).toBe("screenplay");
});

test("the fourth season's eight scripted episodes have twelve beats each", () => {
  const perSeason: Record<string, number> = {};
  for (const beat of WARD_NINE_GUIDE.beats) {
    const season = seasonOf(beat);
    perSeason[season] = (perSeason[season] ?? 0) + 1;
  }
  expect(perSeason).toEqual({ "4": 96 });
  expect(EPISODES.map((episode) => beatsOf(episode).length)).toEqual([
    12, 12, 12, 12, 12, 12, 12, 12,
  ]);
});

test("each episode's beats end on its page count", () => {
  expect(
    Object.fromEntries(
      EPISODES.map((episode) => [episode, beatsOf(episode).at(-1)?.pages[1]]),
    ),
  ).toEqual({
    "401": 57,
    "402": 59,
    "403": 58,
    "404": 60,
    "405": 58,
    "406": 62,
    "407": 59,
    "408": 55,
  });
});

test("an episode's beats are numbered in order and leave no scene or page uncovered", () => {
  const gaps = EPISODES.flatMap((episode) =>
    beatsOf(episode).flatMap((beat, index, beats) => {
      const before = beats[index - 1];
      const ordered =
        beat.id === `heavy/h24/${episode}#${index + 1}` &&
        beat.scenes[0] <= beat.scenes[1] &&
        beat.pages[0] <= beat.pages[1] &&
        (before === undefined
          ? beat.scenes[0] === 1 && beat.pages[0] === 1
          : beat.scenes[0] === before.scenes[1] + 1 &&
            (beat.pages[0] === before.pages[1] ||
              beat.pages[0] === before.pages[1] + 1));
      return ordered ? [] : [beat.id];
    }),
  );
  expect(gaps).toEqual([]);
});

test("every cue and place a beat names is in the cast and the places", () => {
  const cues = new Set(WARD_NINE_GUIDE.cast.map((member) => member.cue));
  const places = new Set(WARD_NINE_GUIDE.places);
  const beats = WARD_NINE_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = WARD_NINE_GUIDE.dialogue;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 80,
    answers: 90,
    anyone: 80,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every entry keeps to the voice of the series", () => {
  expect(checkBank(WARD_NINE_GUIDE, OTHERS)).toEqual([]);
});
