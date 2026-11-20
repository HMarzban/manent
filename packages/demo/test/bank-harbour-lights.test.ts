import { expect, test } from "bun:test";
import { HARBOUR_LIGHTS_GUIDE } from "../src/generate/index.ts";
import type { Beat } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(HARBOUR_LIGHTS_GUIDE);

const EPISODES = ["201", "202", "203", "204", "205"] as const;

const beatsOf = (episode: string): Beat[] =>
  HARBOUR_LIGHTS_GUIDE.beats.filter((beat) =>
    beat.id.startsWith(`medium/harbour-lights/${episode}#`),
  );

test("the bank holds its counts of each list", () => {
  expect(HARBOUR_LIGHTS_GUIDE.cast.length).toBe(9);
  expect(HARBOUR_LIGHTS_GUIDE.places.length).toBe(16);
  expect(HARBOUR_LIGHTS_GUIDE.names.length).toBe(9);
  expect(HARBOUR_LIGHTS_GUIDE.vocabulary.length).toBe(14);
  expect(HARBOUR_LIGHTS_GUIDE.beats.length).toBe(110);
  expect(HARBOUR_LIGHTS_GUIDE.action.length).toBe(300);
  expect(HARBOUR_LIGHTS_GUIDE.dialogue.length).toBe(300);
  expect(HARBOUR_LIGHTS_GUIDE.tags.length).toBe(40);
  expect(HARBOUR_LIGHTS_GUIDE.stories.length).toBe(0);
  expect(HARBOUR_LIGHTS_GUIDE.barks.length).toBe(0);
});

test("Harbour Lights is a screenplay", () => {
  expect(HARBOUR_LIGHTS_GUIDE.format).toBe("screenplay");
});

test("each of the five written episodes has twenty-two beats", () => {
  expect(EPISODES.map((episode) => beatsOf(episode).length)).toEqual([
    22, 22, 22, 22, 22,
  ]);
});

test("each episode's beats end on its page count", () => {
  expect(
    Object.fromEntries(
      EPISODES.map((episode) => [episode, beatsOf(episode).at(-1)?.pages[1]]),
    ),
  ).toEqual({ "201": 58, "202": 56, "203": 61, "204": 52, "205": 31 });
});

test("an episode's beats are numbered in order and leave no scene or page uncovered", () => {
  const gaps = EPISODES.flatMap((episode) =>
    beatsOf(episode).flatMap((beat, index, beats) => {
      const before = beats[index - 1];
      const ordered =
        beat.id === `medium/harbour-lights/${episode}#${index + 1}` &&
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
  const cues = new Set(HARBOUR_LIGHTS_GUIDE.cast.map((member) => member.cue));
  const places = new Set(HARBOUR_LIGHTS_GUIDE.places);
  const beats = HARBOUR_LIGHTS_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = HARBOUR_LIGHTS_GUIDE.dialogue;
  const count = (intent: string): number =>
    dialogue.filter((line) => line.intent === intent).length;
  expect(count("answer")).toBeGreaterThanOrEqual(count("ask"));
  expect(
    dialogue.filter((line) => line.speaker === null).length * 4,
  ).toBeGreaterThanOrEqual(dialogue.length);
});

test("every entry keeps to the voice of the series", () => {
  expect(checkBank(HARBOUR_LIGHTS_GUIDE, OTHERS)).toEqual([]);
});
