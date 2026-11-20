import { expect, test } from "bun:test";
import { MOSS_AND_PEBBLE_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(MOSS_AND_PEBBLE_GUIDE);

test("the bank holds its counts of each list", () => {
  expect(MOSS_AND_PEBBLE_GUIDE.action.length).toBe(300);
  expect(MOSS_AND_PEBBLE_GUIDE.dialogue.length).toBe(300);
  expect(MOSS_AND_PEBBLE_GUIDE.tags.length).toBe(40);
  expect(MOSS_AND_PEBBLE_GUIDE.beats.length).toBe(26);
  expect(MOSS_AND_PEBBLE_GUIDE.stories.length).toBe(0);
  expect(MOSS_AND_PEBBLE_GUIDE.barks.length).toBe(0);
  expect(MOSS_AND_PEBBLE_GUIDE.cast.length).toBe(6);
  expect(MOSS_AND_PEBBLE_GUIDE.places.length).toBe(4);
  expect(MOSS_AND_PEBBLE_GUIDE.names.length).toBe(0);
  expect(MOSS_AND_PEBBLE_GUIDE.vocabulary.length).toBe(5);
});

test("Moss & Pebble is written for animation", () => {
  expect(MOSS_AND_PEBBLE_GUIDE.format).toBe("animation");
});

test("each season's episodes are its beats: 26 in season 2", () => {
  const seasons: Record<string, number> = {};
  for (const beat of MOSS_AND_PEBBLE_GUIDE.beats) {
    const season = /^heavy\/h26\/(\d)\d\d#1$/.exec(beat.id)?.[1] ?? beat.id;
    seasons[season] = (seasons[season] ?? 0) + 1;
  }
  expect(seasons).toEqual({ "2": 26 });
});

test("every cue and place a beat names is in the cast and the places", () => {
  const cues = new Set(MOSS_AND_PEBBLE_GUIDE.cast.map((member) => member.cue));
  const places = new Set(MOSS_AND_PEBBLE_GUIDE.places);
  const beats = MOSS_AND_PEBBLE_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = MOSS_AND_PEBBLE_GUIDE.dialogue;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 73,
    answers: 76,
    anyone: 80,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every entry keeps to the voice of the series", () => {
  expect(checkBank(MOSS_AND_PEBBLE_GUIDE, OTHERS)).toEqual([]);
});
