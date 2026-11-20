import { expect, test } from "bun:test";
import { DOWN_THE_TOLLE_GUIDE } from "../src/generate/index.ts";
import type { LineIntent } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const GUIDE = DOWN_THE_TOLLE_GUIDE;
const OTHERS = othersThan(GUIDE);
const HOST = "ANIL";
/** About how many dialogue lines a generated page uses; no line is used twice in one episode. */
const DIALOGUE_LINES_PER_PAGE = 3.5;

const count = (intent: LineIntent): number =>
  GUIDE.dialogue.filter((line) => line.intent === intent).length;

const voicesAt = (place: string): string[] =>
  GUIDE.beats
    .filter((beat) => beat.places.includes(place))
    .flatMap((beat) => beat.cast.filter((cue) => cue !== HOST));

test("Down the Tolle is a Variety script whose lines run to thirty words", () => {
  expect(GUIDE.format).toBe("variety");
  expect(GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 30,
    sentenceWords: 0,
    banned: [],
  });
});

test("the bank holds sixty episodes, four hundred and fifty lines and forty tags", () => {
  expect(GUIDE.cast.length).toBe(61);
  expect(GUIDE.places.length).toBe(60);
  expect(GUIDE.names.length).toBe(1);
  expect(GUIDE.vocabulary.length).toBe(20);
  expect(GUIDE.beats.length).toBe(60);
  expect(GUIDE.action.length).toBe(0);
  expect(GUIDE.dialogue.length).toBe(450);
  expect(GUIDE.tags.length).toBe(40);
  expect(GUIDE.stories.length).toBe(59);
  expect(GUIDE.barks.length).toBe(0);
});

test("every question has an answer to meet it, and a quarter of the lines suit anyone", () => {
  const open = GUIDE.dialogue.filter((line) => line.speaker === null);
  expect(count("answer")).toBeGreaterThanOrEqual(count("ask"));
  expect(open.length * 4).toBeGreaterThanOrEqual(GUIDE.dialogue.length);
});

test("every episode has lines enough for its pages, each question with an answer", () => {
  const short = GUIDE.beats.filter((beat) => {
    const lines = GUIDE.dialogue.filter(
      (line) => line.speaker === null || beat.cast.includes(line.speaker),
    );
    const asks = lines.filter((line) => line.intent === "ask").length;
    const answers = lines.filter((line) => line.intent === "answer").length;
    const states = lines.filter((line) => line.intent === "state").length;
    // a question is used only with an answer, and an answer only after a question
    return (
      2 * Math.min(asks, answers) + states <
      DIALOGUE_LINES_PER_PAGE * beat.pages[1]
    );
  });
  expect(short.map((beat) => beat.id)).toEqual([]);
});

test("each of the sixty places has five lines in the voice from that place", () => {
  expect(
    GUIDE.places.map((place) => {
      const voices = voicesAt(place);
      return GUIDE.dialogue.filter(
        (line) => line.speaker !== null && voices.includes(line.speaker),
      ).length;
    }),
  ).toEqual(Array.from({ length: 60 }, () => 5));
  expect(
    GUIDE.cast
      .filter((member) => member.cue !== HOST)
      .map(
        (member) =>
          GUIDE.beats.filter((beat) => beat.cast.includes(member.cue)).length,
      ),
  ).toEqual(Array.from({ length: 60 }, () => 1));
});

test("every episode names only the podcast's cast and places", () => {
  const cues = new Set(GUIDE.cast.map((member) => member.cue));
  const places = new Set(GUIDE.places);
  expect(
    GUIDE.beats.flatMap((beat) => beat.cast.filter((cue) => !cues.has(cue))),
  ).toEqual([]);
  expect(
    GUIDE.beats.flatMap((beat) =>
      beat.places.filter((place) => !places.has(place)),
    ),
  ).toEqual([]);
});

test("each episode is one part, its pages set by its running time", () => {
  expect(GUIDE.beats.map((beat) => [beat.id, beat.scenes])).toEqual(
    Array.from({ length: 60 }, (_, index) => [
      `heavy/h32/ep${index + 1}#1`,
      [1, 1],
    ]),
  );
  expect(GUIDE.beats.map((beat) => beat.pages)).toEqual(
    [
      25, 22, 23, 20, 27, 23, 24, 21, 26, 20, 24, 28, 20, 27, 23, 24, 26, 22,
      27, 29, 26, 24, 29, 26, 31, 24, 22, 33, 23, 25, 27, 30, 23, 26, 21, 29,
      24, 23, 27, 23, 24, 22, 28, 25, 29, 24, 32, 27, 29, 26, 22, 25, 28, 22,
      25, 24, 26, 25, 18, 1,
    ].map((last) => [1, last]),
  );
});

test("each timed episode runs to its time and carries one cue bracket", () => {
  expect(
    GUIDE.stories.map((story) => [
      story.slug,
      story.durMs,
      story.lines.length,
      story.brackets.length,
    ]),
  ).toEqual([
    ["ep1", 1_880_000, 0, 1],
    ["ep2", 1_665_000, 0, 1],
    ["ep3", 1_750_000, 0, 1],
    ["ep4", 1_535_000, 0, 1],
    ["ep5", 2_030_000, 0, 1],
    ["ep6", 1_705_000, 0, 1],
    ["ep7", 1_805_000, 0, 1],
    ["ep8", 1_600_000, 0, 1],
    ["ep9", 1_935_000, 0, 1],
    ["ep10", 1_490_000, 0, 1],
    ["ep11", 1_770_000, 0, 1],
    ["ep12", 2_115_000, 0, 1],
    ["ep13", 1_505_000, 0, 1],
    ["ep14", 2_020_000, 0, 1],
    ["ep15", 1_735_000, 0, 1],
    ["ep16", 1_820_000, 0, 1],
    ["ep17", 1_915_000, 0, 1],
    ["ep18", 1_650_000, 0, 1],
    ["ep19", 2_045_000, 0, 1],
    ["ep20", 2_180_000, 0, 1],
    ["ep21", 1_985_000, 0, 1],
    ["ep22", 1_790_000, 0, 1],
    ["ep23", 2_200_000, 0, 1],
    ["ep24", 1_940_000, 0, 1],
    ["ep25", 2_295_000, 0, 1],
    ["ep26", 1_830_000, 0, 1],
    ["ep27", 1_675_000, 0, 1],
    ["ep28", 2_460_000, 0, 1],
    ["ep29", 1_720_000, 0, 1],
    ["ep30", 1_885_000, 0, 1],
    ["ep31", 2_050_000, 0, 1],
    ["ep32", 2_255_000, 0, 1],
    ["ep33", 1_755_000, 0, 1],
    ["ep34", 1_970_000, 0, 1],
    ["ep35", 1_595_000, 0, 1],
    ["ep36", 2_145_000, 0, 1],
    ["ep37", 1_805_000, 0, 1],
    ["ep38", 1_700_000, 0, 1],
    ["ep39", 2_015_000, 0, 1],
    ["ep40", 1_740_000, 0, 1],
    ["ep41", 1_815_000, 0, 1],
    ["ep42", 1_630_000, 0, 1],
    ["ep43", 2_065_000, 0, 1],
    ["ep44", 1_900_000, 0, 1],
    ["ep45", 2_155_000, 0, 1],
    ["ep46", 1_775_000, 0, 1],
    ["ep47", 2_410_000, 0, 1],
    ["ep48", 2_000_000, 0, 1],
    ["ep49", 2_165_000, 0, 1],
    ["ep50", 1_965_000, 0, 1],
    ["ep51", 1_680_000, 0, 1],
    ["ep52", 1_850_000, 0, 1],
    ["ep53", 2_070_000, 0, 1],
    ["ep54", 1_645_000, 0, 1],
    ["ep55", 1_875_000, 0, 1],
    ["ep56", 1_780_000, 0, 1],
    ["ep57", 1_980_000, 0, 1],
    ["ep58", 1_890_000, 0, 1],
    ["ep59", 1_330_000, 0, 1],
  ]);
});

test("no entry holds an unlisted name, a repeat or a line too long for the podcast", () => {
  expect(checkBank(GUIDE, OTHERS)).toEqual([]);
});
