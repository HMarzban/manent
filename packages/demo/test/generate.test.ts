import { expect, test } from "bun:test";
import { blocksToText, parseSeedText } from "../src/content/markup.ts";
import {
  checkGenerated,
  createUsedLines,
  generateChapter,
  generateScenes,
  SeedBuildError,
} from "../src/generate/index.ts";
import { createRng } from "../src/index.ts";
import { TINY, TINY_LEDGER, TINY_PROSE } from "./fixtures/tiny-guide.ts";

const buildError = (run: () => unknown): [string, string] | null => {
  try {
    run();
  } catch (error) {
    if (error instanceof SeedBuildError) return [error.code, error.where];
    throw error;
  }
  return null;
};

const issues = (text: string) =>
  checkGenerated(parseSeedText(text).blocks, TINY, 55).map((i) => [
    i.code,
    i.blockIndex,
  ]);

const sceneText = (seed: number) =>
  blocksToText(
    generateScenes(TINY, TINY.beats[0]!, createRng(seed), createUsedLines()),
  );

// the same five-word action on the first line and on `line`, with three-word actions between
const withRepeatAt = (line: number) =>
  Array.from({ length: line }, (_, i) =>
    i === 0 || i === line - 1
      ? "action The lift has stopped again."
      : `action Clock ticks ${i}.`,
  ).join("\n");

const headingOf = (chapter: number) =>
  generateChapter(TINY_PROSE, chapter, 10, createRng(1), createUsedLines())[0]!
    .text;

test("the same seed writes the same scenes", () => {
  expect(sceneText(7)).toBe(sceneText(7));
  expect(sceneText(7)).not.toBe(sceneText(8));
});

test("generated scenes keep to their cast and places and answer every question", () => {
  const beat = TINY.beats[0]!;
  const blocks = generateScenes(TINY, beat, createRng(3), createUsedLines());
  expect(checkGenerated(blocks, TINY, 55)).toEqual([]);
  // Orla is in the guide's cast but not in this beat's; a line with a speaker is only ever that speaker's
  const speakerOf = new Map(TINY.dialogue.map((d) => [d.text, d.speaker]));
  const strays = Array.from({ length: 20 }, (_, seed) =>
    generateScenes(TINY, beat, createRng(seed), createUsedLines()),
  ).flatMap((scenes) =>
    scenes.filter(
      (b, i) =>
        (b.element === "character" && !beat.cast.includes(b.text)) ||
        (b.element === "action" && b.text.includes("Orla")) ||
        (b.element === "dialogue" &&
          ![null, undefined, scenes[i - 1]!.text].includes(
            speakerOf.get(b.text),
          )),
    ),
  );
  expect(strays).toEqual([]);
});

test("each rule finds what it guards", () => {
  expect(issues("scene_heading INT. MOON - NIGHT")).toEqual([
    ["unknown_place", 0],
  ]);
  expect(issues("character NOBODY\ndialogue Hello there, all of you.")).toEqual(
    [["unknown_speaker", 0]],
  );
  expect(issues("action Lorem ipsum dolor sit amet.")).toEqual([["filler", 0]]);
  expect(
    issues(
      "character JANE\ndialogue Is it far from here now?\naction She waits.\naction Nothing.\naction Still nothing.",
    ),
  ).toEqual([["unanswered", 1]]);
  expect(
    issues(
      "character JANE\ndialogue We go at dawn, all of us.\ncharacter TOM\ndialogue Fine.\ncharacter JANE\ndialogue We go at dawn, all of us.",
    ),
  ).toEqual([["repeated_dialogue", 5]]);
  expect(
    issues(
      "action The lift has stopped between floors.\naction The lift has stopped between floors.",
    ),
  ).toEqual([["repeated_sentence", 1]]);
});

test("a question answered within the next two speeches, by someone else, is answered", () => {
  const ask = "character JANE\ndialogue Is it far from here now?";
  expect(
    issues(
      `${ask}\ncharacter TOM\ndialogue Fine.\ncharacter TOM\ndialogue Not that I know of, near enough.`,
    ),
  ).toEqual([]);
  expect(
    issues(
      `${ask}\ncharacter JANE\ndialogue About a mile, past the second gate.`,
    ),
  ).toEqual([["unanswered", 1]]);
  expect(
    issues(
      `${ask}\ncharacter TOM\ndialogue Fine.\ncharacter TOM\ndialogue Right.\ncharacter TOM\ndialogue Not that I know of.`,
    ),
  ).toEqual([["unanswered", 1]]);
});

test("a sentence may come back after ten pages, never sooner", () => {
  // each of these blocks is two estimated lines, and ten pages of 55 lines are 550
  expect(issues(withRepeatAt(276))).toEqual([]);
  expect(issues(withRepeatAt(275))).toEqual([["repeated_sentence", 274]]);
});

test("a guide that runs out of lines stops the build instead of repeating", () => {
  const long = { ...TINY.beats[0]!, pages: [1, 40] as const };
  expect(
    buildError(() =>
      generateScenes(TINY, long, createRng(1), createUsedLines()),
    ),
  ).toEqual(["generator_exhausted", "tiny: tiny/script#1"]);
});

test("a chapter has its heading, its break, its ledger entry and a closing line", () => {
  const blocks = generateChapter(
    TINY_PROSE,
    3,
    900,
    createRng(5),
    createUsedLines(),
  );
  expect(blocks[0]).toEqual({
    element: "chapter",
    text: "Chapter Three: The Night Freight",
    marks: [],
    kind: null,
  });
  expect(blocks.filter((b) => b.element === "break")).toEqual([
    { element: "break", text: "*", marks: [], kind: null },
  ]);
  expect(
    blocks.filter((b) => b.element === "quote").map((b) => b.text),
  ).toEqual([TINY_LEDGER]);
  expect(
    blocks
      .map((b) => b.element)
      .filter((element, i, all) => element !== all[i - 1]),
  ).toEqual(["chapter", "body", "break", "body", "quote", "body"]);
  const last = blocks.at(-1)!;
  expect([
    last.element,
    TINY_PROSE.sentences.some((s) => s.text === last.text),
  ]).toEqual(["body", true]);
  const sentences = new Map(TINY_PROSE.sentences.map((s) => [s.text, s.tags]));
  const offTag = blocks
    .filter((b) => b.element === "body")
    .flatMap((b) => b.text.split(/(?<=\.) /))
    .filter((text) => sentences.get(text)?.includes("harbour") ?? true);
  expect(offTag).toEqual([]);
});

test("a chapter's number is written in words, hyphenated, each part capitalised", () => {
  expect([headingOf(21), headingOf(96)]).toEqual([
    "Chapter Twenty-One: The Inspector",
    "Chapter Ninety-Six: The Last Shift",
  ]);
});

test("generated text never repeats a line across calls that share their used set", () => {
  const used = createUsedLines();
  const lines = [
    ...generateScenes(TINY, TINY.beats[0]!, createRng(11), used),
    ...generateScenes(TINY, TINY.beats[1]!, createRng(12), used),
  ]
    .filter((b) => b.element === "dialogue")
    .map((b) => b.text);
  expect(lines.filter((line, i) => lines.indexOf(line) !== i)).toEqual([]);
});
