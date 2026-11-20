import { expect, test } from "bun:test";
import { KEEPER_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(KEEPER_GUIDE);

test("the bank holds its counts of each list", () => {
  expect(KEEPER_GUIDE.action.length).toBe(300);
  expect(KEEPER_GUIDE.dialogue.length).toBe(300);
  expect(KEEPER_GUIDE.tags.length).toBe(40);
  expect(KEEPER_GUIDE.beats.length).toBe(29);
  expect(KEEPER_GUIDE.stories.length).toBe(0);
  expect(KEEPER_GUIDE.barks.length).toBe(0);
  expect(KEEPER_GUIDE.cast.length).toBe(7);
  expect(KEEPER_GUIDE.places.length).toBe(20);
  expect(KEEPER_GUIDE.names.length).toBe(2);
  expect(KEEPER_GUIDE.vocabulary.length).toBe(9);
});

test("the Keeper films are screenplays", () => {
  expect(KEEPER_GUIDE.format).toBe("screenplay");
});

test("every cue and place a beat names is in the cast and the places", () => {
  const cues = new Set(KEEPER_GUIDE.cast.map((member) => member.cue));
  const places = new Set(KEEPER_GUIDE.places);
  const beats = KEEPER_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = KEEPER_GUIDE.dialogue;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 80,
    answers: 85,
    anyone: 86,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every entry keeps to the voice of the films", () => {
  expect(checkBank(KEEPER_GUIDE, OTHERS)).toEqual([]);
});
