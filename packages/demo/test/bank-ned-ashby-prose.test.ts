import { expect, test } from "bun:test";
import { NED_PROSE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(NED_PROSE);

test("the novel's bank holds its names, its sentences and its 31 chapters", () => {
  expect(NED_PROSE.project).toBe("ned-ashby-prose");
  expect(NED_PROSE.names.length).toBe(22);
  expect(NED_PROSE.sentences.length).toBe(600);
  expect(NED_PROSE.chapters.length).toBe(31);
});

test("the novel's voice allows forty words a sentence and keeps its magic a craft of the city", () => {
  expect(NED_PROSE.style).toEqual({
    actionWords: 0,
    dialogueWords: 0,
    sentenceWords: 40,
    banned: [
      /\b(screen|app|internet|online|email|website)\b/i,
      /\bphone\b[^.]*\b(fix|fixes|find|finds|call|calls)\b/i,
      /\b(stupid|idiot|shut up)\b/i,
    ],
  });
});

test("the chapters are numbered one to 31, each outlined in six beats with one entry in the watch book", () => {
  const chapters = NED_PROSE.chapters;
  expect(chapters.map((c) => c.number)).toEqual(
    Array.from({ length: 31 }, (_, index) => index + 1),
  );
  expect(
    chapters.filter((c) => c.beats.length !== 6).map((c) => c.number),
  ).toEqual([]);
  expect(chapters.filter((c) => c.ledger === "").map((c) => c.number)).toEqual(
    [],
  );
});

test("every sentence is tagged only with the novel's people, places and threads", () => {
  const tags = new Set([
    ...NED_PROSE.sentences.flatMap((s) => s.tags),
    ...NED_PROSE.chapters.flatMap((c) => c.tags),
  ]);
  expect([...tags].toSorted()).toEqual([
    "Alderman Crane",
    "Candlemere",
    "Hattie",
    "Magister Velle",
    "Maud",
    "Ned",
    "Old Wick",
    "Old Wick's lighthouse",
    "Tallow",
    "the Fourth Ward",
    "the Glassworks",
    "the Guild Hall",
    "the Guild's secret",
    "the Lantern Tower",
    "the afterglow",
    "the first lighting",
    "the flame burning down",
    "the gas mains",
    "the lost minutes",
  ]);
});

test("every sentence shares a place or a thread with at least one chapter", () => {
  const visited = new Set(NED_PROSE.chapters.flatMap((c) => c.tags));
  expect(
    NED_PROSE.sentences
      .filter((s) => !s.tags.some((tag) => visited.has(tag)))
      .map((s) => s.text),
  ).toEqual([]);
});

test("the novel's bank holds no undeclared name, repeat or line off its voice", () => {
  expect(checkBank(NED_PROSE, OTHERS)).toEqual([]);
});
