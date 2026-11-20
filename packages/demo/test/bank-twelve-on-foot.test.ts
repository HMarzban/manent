import { expect, test } from "bun:test";
import type { LineIntent } from "../src/generate/index.ts";
import { TWELVE_ON_FOOT_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const GUIDE = TWELVE_ON_FOOT_GUIDE;
const OTHERS = othersThan(GUIDE);

test("the game's bank holds its counts, in the game script format", () => {
  expect(GUIDE.format).toBe("game");
  expect(GUIDE.action.length).toBe(300);
  expect(GUIDE.dialogue.length).toBe(300);
  expect(GUIDE.tags.length).toBe(40);
  expect(GUIDE.beats.length).toBe(6);
  expect(GUIDE.barks.length).toBe(64);
  expect(GUIDE.stories.length).toBe(0);
});

test("five barks play only once the stowaway is found", () => {
  expect(GUIDE.barks.filter((bark) => bark.gated).length).toBe(5);
});

test("there are as many answers as questions, and a quarter of the lines suit anyone in the scene", () => {
  const count = (intent: LineIntent): number =>
    GUIDE.dialogue.filter((line) => line.intent === intent).length;
  expect(count("answer")).toBeGreaterThanOrEqual(count("ask"));
  const open = GUIDE.dialogue.filter((line) => line.speaker === null).length;
  expect(open * 4).toBeGreaterThanOrEqual(GUIDE.dialogue.length);
});

test("every scene's people and places are in the cast and the place list", () => {
  const cues = new Set(GUIDE.cast.map((member) => member.cue));
  const places = new Set(GUIDE.places);
  const beatCues = GUIDE.beats.flatMap((beat) => beat.cast);
  const beatPlaces = GUIDE.beats.flatMap((beat) => beat.places);
  expect(beatCues.filter((cue) => !cues.has(cue))).toEqual([]);
  expect(beatPlaces.filter((place) => !places.has(place))).toEqual([]);
});

test("every tag the game's lines carry sets a value or plays a sound", () => {
  expect(GUIDE.tags.filter((tag) => !/^#(set|sfx) \S/.test(tag))).toEqual([]);
});

test("every entry keeps to the game's voice, with no name it does not declare", () => {
  expect(checkBank(GUIDE, OTHERS)).toEqual([]);
});
