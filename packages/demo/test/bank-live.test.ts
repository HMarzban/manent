import { expect, test } from "bun:test";
import { LIVE_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(LIVE_GUIDE);

const DIARY = [
  "D−7 tram line 3 opens",
  "D−7 cup draw at Port Allard",
  "D−6 library report",
  "D−6 school meals trial",
  "D−5 lighthouse restored",
  "D−4 car park charges",
  "D−3 otters in the Tolle",
  "D−2 Kittiwake-1 in orbit",
  "D−2 night market licence",
  "D−1 cup replay won",
  "D−1 bridge resurfacing announced",
  "D−1 gales warned of",
  "D library vote",
  "D gale and the last ferry",
  "D first photograph of Earth",
  "D otter cubs",
  "D homes at the dye works",
  "D census figures",
  "D the umbrella",
  "D+1 night market opens",
  "D+2 lighthouse museum reopens",
  "D+5 Athletic v Harrowfield Town",
  "D+7 library consultation",
  "D+7 tram fares review",
  "D+8 to D+11 bridge closed at night",
  "D+9 book festival",
  "D+10 Kittiwake-1 gallery",
];

test("the live shows' bank holds three hundred news sentences and no chapters", () => {
  expect(LIVE_GUIDE.sentences.length).toBe(300);
  expect(LIVE_GUIDE.chapters.length).toBe(0);
  expect(LIVE_GUIDE.names.length).toBe(26);
});

test("news copy is held to twenty words a sentence and no word of judgement", () => {
  expect(LIVE_GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 25,
    sentenceWords: 20,
    banned: [
      /\b(shocking|amazing|tragic|disgraceful|brilliant|outrageous|stunning|horrific|incredible|terrible|wonderful)\b/i,
    ],
  });
});

test("every sentence is tagged with one item of the news diary, and every item is reported", () => {
  const untagged = LIVE_GUIDE.sentences.filter(
    (sentence) =>
      sentence.tags.length !== 1 || !DIARY.includes(sentence.tags[0] ?? ""),
  );
  expect(untagged).toEqual([]);
  expect([
    ...new Set(LIVE_GUIDE.sentences.flatMap((sentence) => sentence.tags)),
  ]).toEqual(DIARY);
});

test("every sentence keeps to the newsroom's voice and names only what the diary holds", () => {
  expect(checkBank(LIVE_GUIDE, OTHERS)).toEqual([]);
});
