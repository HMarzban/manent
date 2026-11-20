import { expect, test } from "bun:test";
import type { ProseGuide, StyleGuide } from "../src/generate/index.ts";
import {
  BANK_ISSUE_CODES,
  checkBank,
  storyDurationMs,
} from "./support/bank-rules.ts";

const STYLE = {
  actionWords: 25,
  dialogueWords: 30,
  sentenceWords: 25,
  banned: [],
};

const FIRST: StyleGuide = {
  project: "first",
  format: "screenplay",
  cast: [{ cue: "IDA", name: "Ida Marsh" }],
  places: ["INT. FERRY OFFICE"],
  names: [],
  vocabulary: ["timetable"],
  beats: [],
  style: STYLE,
  action: ["Ida folds the timetable along its old crease."],
  dialogue: [
    {
      speaker: "IDA",
      intent: "ask",
      text: "Who signed for the last crossing?",
    },
    { speaker: null, intent: "answer", text: "The man who sells the tickets." },
  ],
  tags: ["if you ask me"],
  stories: [],
  barks: [],
};

const SECOND: StyleGuide = {
  ...FIRST,
  project: "second",
  cast: [{ cue: "PIKE", name: "Pike Arden" }],
  places: ["EXT. CAR DECK"],
  action: ["The rope lies coiled on the car deck."],
  dialogue: [],
  tags: [],
};

const OTHERS = [SECOND];

const withAction = (...action: string[]): StyleGuide => ({
  ...FIRST,
  action: [...FIRST.action, ...action],
});

test("the issue codes keep their order", () => {
  expect(BANK_ISSUE_CODES).toEqual([
    "unlisted_name",
    "repeated",
    "too_long",
    "off_voice",
    "not_a_sentence",
    "unknown_speaker",
  ]);
});

test("a bank of clean entries passes", () => {
  expect(checkBank(FIRST, OTHERS)).toEqual([]);
});

test("a name no guide lists is refused", () => {
  expect(checkBank(withAction("Ida buys a Glimmerco cola."), OTHERS)).toEqual([
    { code: "unlisted_name", entry: "Ida buys a Glimmerco cola." },
  ]);
});

test("a name from another project's cast is refused", () => {
  expect(checkBank(withAction("Pike waves."), OTHERS)).toEqual([
    { code: "unlisted_name", entry: "Pike waves." },
  ]);
});

test("a line written twice is refused once, at its second place", () => {
  const line = "Ida folds the timetable along its old crease.";
  expect(checkBank(withAction(line), OTHERS)).toEqual([
    { code: "repeated", entry: line },
  ]);
});

test("two lines of one list that open with the same six words are refused", () => {
  const line = "Ida folds the timetable along its new crease.";
  expect(checkBank(withAction(line), OTHERS)).toEqual([
    { code: "repeated", entry: line },
  ]);
});

test("a line another project already holds is refused", () => {
  const line = "The rope lies coiled on the car deck!";
  expect(checkBank(withAction(line), OTHERS)).toEqual([
    { code: "repeated", entry: line },
  ]);
});

test("a line longer than its voice allows is refused", () => {
  const line = `${Array.from({ length: 30 }, () => "on").join(" ")} again.`;
  const guide: StyleGuide = {
    ...FIRST,
    dialogue: [
      ...FIRST.dialogue,
      { speaker: "IDA", intent: "state", text: line },
    ],
  };
  expect(checkBank(guide, OTHERS)).toEqual([{ code: "too_long", entry: line }]);
});

test("filler is refused, and its capitalised word is a name no guide lists", () => {
  const line = "Lorem ipsum dolor sit amet.";
  expect(checkBank(withAction(line), OTHERS)).toEqual([
    { code: "unlisted_name", entry: line },
    { code: "off_voice", entry: line },
  ]);
});

test("an action that is not a whole sentence is refused", () => {
  expect(checkBank(withAction("and then the fog."), OTHERS)).toEqual([
    { code: "not_a_sentence", entry: "and then the fog." },
  ]);
});

test("a line spoken by someone outside the cast is refused", () => {
  const guide: StyleGuide = {
    ...FIRST,
    dialogue: [
      ...FIRST.dialogue,
      { speaker: "NOBODY", intent: "state", text: "The tide turns at four." },
    ],
  };
  expect(checkBank(guide, OTHERS)).toEqual([
    { code: "unknown_speaker", entry: "The tide turns at four." },
  ]);
});

test("a book's chapters may share a place, and each sentence must end", () => {
  const book: ProseGuide = {
    project: "book",
    names: ["Mallow Street"],
    style: { ...STYLE, actionWords: 0, dialogueWords: 0 },
    chapters: [
      {
        number: 1,
        title: "The box on the step",
        beats: ["The box is left on the step."],
        ledger: "the box arrives",
        tags: ["Mallow Street"],
      },
      {
        number: 2,
        title: "The box goes back",
        beats: ["The box is carried back up the street."],
        ledger: "the box leaves",
        tags: ["Mallow Street"],
      },
    ],
    sentences: [
      { text: "The box sat on the step all morning.", tags: [] },
      { text: "The box on Mallow Street", tags: [] },
    ],
  };
  expect(checkBank(book, OTHERS)).toEqual([
    { code: "not_a_sentence", entry: "The box on Mallow Street" },
  ]);
});

test("a story lasts as long as its lines take to read, plus its brackets", () => {
  expect(
    storyDurationMs({
      slug: "ep1",
      durMs: 44_000,
      lines: [
        {
          speaker: null,
          intent: "state",
          text: "The ferry leaves at five and is back by noon.",
        },
      ],
      brackets: ["T=0:40 ferry footage"],
    }),
  ).toBe(44_000);
});
