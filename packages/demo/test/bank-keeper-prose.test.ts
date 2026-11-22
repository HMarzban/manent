import { expect, test } from "bun:test";
import {
  createUsedLines,
  generateChapter,
  KEEPER_PROSE,
} from "../src/generate/index.ts";
import { createRng, DEMO_SEED } from "../src/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(KEEPER_PROSE);

// the length of one chapter of the long book
const CHAPTER_WORDS = 5_600;

// one day's entry in Tamsin's bell-book: the day, the bell, whether it rings, the weather, her name
const BELL_BOOK_ENTRY = new RegExp(
  "^Day [a-z-]+\\. [^:.]+: (rings?|silent)[^.]*\\. [^.]+\\. Tamsin Hale\\.$",
);

const wordCount = (text: string): number =>
  text.split(/\s+/).filter((word) => word !== "").length;

const chapterOf = (chapter: number) =>
  generateChapter(
    KEEPER_PROSE,
    chapter,
    CHAPTER_WORDS,
    createRng(DEMO_SEED),
    createUsedLines(),
  );

test("the long book's bank holds its names, its sentences and its 96 chapters", () => {
  expect(KEEPER_PROSE.project).toBe("keeper-prose");
  expect(KEEPER_PROSE.names.length).toBe(14);
  expect(KEEPER_PROSE.sentences.length).toBe(625);
  expect(KEEPER_PROSE.chapters.length).toBe(96);
});

test("the long book's voice allows thirty words a sentence and nothing the bell roads never knew", () => {
  expect(KEEPER_PROSE.style).toEqual({
    actionWords: 25,
    dialogueWords: 30,
    sentenceWords: 30,
    banned: [
      /\b(phone|car|computer|email|okay|OK|television|radio|plane|train)\b/,
    ],
  });
});

test("the chapters are numbered one to 96, each a day outlined in three beats", () => {
  const chapters = KEEPER_PROSE.chapters;
  expect(chapters.map((c) => c.number)).toEqual(
    Array.from({ length: 96 }, (_, index) => index + 1),
  );
  expect(
    chapters.filter((c) => c.beats.length !== 3).map((c) => c.number),
  ).toEqual([]);
});

test("each chapter's bell-book entry names its day, its bell, whether it rings and the weather, signed by Tamsin Hale", () => {
  expect(
    KEEPER_PROSE.chapters
      .filter((c) => !BELL_BOOK_ENTRY.test(c.ledger))
      .map((c) => c.ledger),
  ).toEqual([]);
});

test("every sentence is tagged only with the book's people, places and threads", () => {
  const tags = new Set([
    ...KEEPER_PROSE.sentences.flatMap((s) => s.tags),
    ...KEEPER_PROSE.chapters.flatMap((c) => c.tags),
  ]);
  expect([...tags].toSorted()).toEqual([
    "Ansel",
    "Aske",
    "Carrow Height",
    "Carrow's bell tower",
    "Edric",
    "Hild",
    "Joss",
    "Tamsin",
    "Vane",
    "Wenna",
    "deep winter",
    "small kindnesses",
    "the Founding",
    "the Grey Reach",
    "the Hush",
    "the Provost's hall",
    "the bell-tongue",
    "the casting",
    "the cold forge",
    "the drove road",
    "the first snows",
    "the founder's craft",
    "the founding road",
    "the foundry",
    "the high paths",
    "the mountain road",
    "the new toll-house",
    "the river Merrin",
    "the road",
    "the ruined toll-house",
    "the shepherd's hut",
    "the silent bells",
    "the thaw",
    "the wardens' post",
    "weather",
  ]);
});

test("every sentence shares a place or a thread with at least one chapter", () => {
  const visited = new Set(KEEPER_PROSE.chapters.flatMap((c) => c.tags));
  expect(
    KEEPER_PROSE.sentences
      .filter((s) => !s.tags.some((tag) => visited.has(tag)))
      .map((s) => s.text),
  ).toEqual([]);
});

test("every chapter can draw on a sentence that names Tamsin", () => {
  expect(
    KEEPER_PROSE.chapters
      .filter(
        (c) =>
          !KEEPER_PROSE.sentences.some(
            (s) =>
              s.text.includes("Tamsin") &&
              s.tags.some((tag) => c.tags.includes(tag)),
          ),
      )
      .map((c) => c.number),
  ).toEqual([]);
});

test("a chapter written from the demo seed names Tamsin Hale, from the first chapter to the last", () => {
  expect(
    [1, 48, 96].map((chapter) =>
      chapterOf(chapter).some((b) => b.text.includes("Tamsin Hale")),
    ),
  ).toEqual([true, true, true]);
});

test("every chapter can be written at the book's length without running out of sentences", () => {
  expect(
    KEEPER_PROSE.chapters
      .filter(
        (c) =>
          chapterOf(c.number)
            .filter((b) => b.element === "body")
            .reduce((sum, b) => sum + wordCount(b.text), 0) < CHAPTER_WORDS,
      )
      .map((c) => c.number),
  ).toEqual([]);
});

test("the long book's bank holds no undeclared name, repeat or line off its voice", () => {
  expect(checkBank(KEEPER_PROSE, OTHERS)).toEqual([]);
});
