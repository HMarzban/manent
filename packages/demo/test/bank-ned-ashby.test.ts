import { expect, test } from "bun:test";
import { NED_ASHBY_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(NED_ASHBY_GUIDE);

test("the Ned Ashby bank holds enough lines for the two films", () => {
  expect(NED_ASHBY_GUIDE.cast.length).toBe(8);
  expect(NED_ASHBY_GUIDE.places.length).toBe(17);
  expect(NED_ASHBY_GUIDE.names.length).toBe(3);
  expect(NED_ASHBY_GUIDE.vocabulary.length).toBe(8);
  expect(NED_ASHBY_GUIDE.beats.length).toBe(19);
  expect(NED_ASHBY_GUIDE.action.length).toBe(300);
  expect(NED_ASHBY_GUIDE.dialogue.length).toBe(300);
  expect(NED_ASHBY_GUIDE.tags.length).toBe(40);
  expect(NED_ASHBY_GUIDE.stories.length).toBe(0);
  expect(NED_ASHBY_GUIDE.barks.length).toBe(0);
});

test("the Ned Ashby films are written as screenplays", () => {
  expect(NED_ASHBY_GUIDE.format).toBe("screenplay");
});

test("every question in the Ned Ashby bank can be answered, and a quarter of its lines suit anyone in the scene", () => {
  const { dialogue } = NED_ASHBY_GUIDE;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect(answers).toBeGreaterThanOrEqual(asks);
  expect(anyone * 4).toBeGreaterThanOrEqual(dialogue.length);
});

test("every beat of the Ned Ashby films names only the bank's own people and places", () => {
  const cues = new Set(NED_ASHBY_GUIDE.cast.map((member) => member.cue));
  const places = new Set(NED_ASHBY_GUIDE.places);
  const beats = NED_ASHBY_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((cue) => !cues.has(cue)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((place) => !places.has(place)),
  ).toEqual([]);
});

test("every entry of the Ned Ashby bank keeps to the films' voice", () => {
  expect(checkBank(NED_ASHBY_GUIDE, OTHERS)).toEqual([]);
});
