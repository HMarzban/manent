import { expect, test } from "bun:test";
import { EMBER_FLEET_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(EMBER_FLEET_GUIDE);

test("the Ember Fleet bank holds enough lines for the two films and the game", () => {
  expect(EMBER_FLEET_GUIDE.cast.length).toBe(9);
  expect(EMBER_FLEET_GUIDE.places.length).toBe(16);
  expect(EMBER_FLEET_GUIDE.names.length).toBe(1);
  expect(EMBER_FLEET_GUIDE.vocabulary.length).toBe(8);
  expect(EMBER_FLEET_GUIDE.beats.length).toBe(25);
  expect(EMBER_FLEET_GUIDE.action.length).toBe(300);
  expect(EMBER_FLEET_GUIDE.dialogue.length).toBe(300);
  expect(EMBER_FLEET_GUIDE.tags.length).toBe(40);
  expect(EMBER_FLEET_GUIDE.stories.length).toBe(0);
  expect(EMBER_FLEET_GUIDE.barks.length).toBe(0);
});

test("the Ember Fleet bank is written as a screenplay", () => {
  expect(EMBER_FLEET_GUIDE.format).toBe("screenplay");
});

test("every question in the Ember Fleet bank can be answered, and a quarter of its lines suit anyone in the scene", () => {
  const { dialogue } = EMBER_FLEET_GUIDE;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 78,
    answers: 89,
    anyone: 80,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every beat of the Ember Fleet films and game names only the bank's own people and places", () => {
  const cues = new Set(EMBER_FLEET_GUIDE.cast.map((member) => member.cue));
  const places = new Set(EMBER_FLEET_GUIDE.places);
  const beats = EMBER_FLEET_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((cue) => !cues.has(cue)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((place) => !places.has(place)),
  ).toEqual([]);
});

test("every entry of the Ember Fleet bank keeps to the voice of the films", () => {
  expect(checkBank(EMBER_FLEET_GUIDE, OTHERS)).toEqual([]);
});
