import { expect, test } from "bun:test";
import { EKBO_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(EKBO_GUIDE);

test("every list of the film's bank holds the number written for it", () => {
  expect(EKBO_GUIDE.cast.length).toBe(16);
  expect(EKBO_GUIDE.places.length).toBe(17);
  expect(EKBO_GUIDE.names.length).toBe(3);
  expect(EKBO_GUIDE.vocabulary.length).toBe(12);
  expect(EKBO_GUIDE.beats.length).toBe(52);
  expect(EKBO_GUIDE.action.length).toBe(300);
  expect(EKBO_GUIDE.dialogue.length).toBe(340);
  expect(EKBO_GUIDE.tags.length).toBe(40);
  expect(EKBO_GUIDE.stories.length).toBe(0);
  expect(EKBO_GUIDE.barks.length).toBe(0);
});

test("the film is a screenplay held to its voice's limits", () => {
  expect(EKBO_GUIDE.format).toBe("screenplay");
  expect(EKBO_GUIDE.style).toEqual({
    actionWords: 25,
    dialogueWords: 30,
    sentenceWords: 25,
    banned: [],
  });
});

test("no fewer lines answer than ask, and a quarter belong to anyone in the scene", () => {
  const lines = EKBO_GUIDE.dialogue;
  const ask = lines.filter((line) => line.intent === "ask").length;
  const answer = lines.filter((line) => line.intent === "answer").length;
  const anyone = lines.filter((line) => line.speaker === null).length;
  expect({ ask, answer, anyone }).toEqual({
    ask: 100,
    answer: 110,
    anyone: 96,
  });
  expect(answer >= ask).toBe(true);
  expect(anyone * 4 >= lines.length).toBe(true);
});

test("every beat's people are in the cast and its places in the places", () => {
  const cues = new Set(EKBO_GUIDE.cast.map((member) => member.cue));
  const places = new Set(EKBO_GUIDE.places);
  const beats = EKBO_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("the beats are the script's 52 scenes, over 99 pages with none left out", () => {
  const beats = EKBO_GUIDE.beats;
  expect(beats.map((beat) => beat.id)).toEqual(
    Array.from(
      { length: 52 },
      (_, i) => `small/every-key-but-one/script#${i + 1}`,
    ),
  );
  expect(beats.map((beat) => beat.scenes)).toEqual(
    Array.from({ length: 52 }, (_, i) => [i + 1, i + 1]),
  );
  expect(beats[0]?.pages[0]).toBe(1);
  expect(beats.at(-1)?.pages[1]).toBe(99);
  const broken = beats.filter((beat, i) => {
    const [first, last] = beat.pages;
    const before = beats[i - 1]?.pages[1] ?? 1;
    return last < first || (first !== before && first !== before + 1);
  });
  expect(broken.map((beat) => beat.id)).toEqual([]);
});

test("no entry of the film's bank breaks a bank rule", () => {
  expect(checkBank(EKBO_GUIDE, OTHERS)).toEqual([]);
});
