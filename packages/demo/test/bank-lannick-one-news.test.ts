import { expect, test } from "bun:test";
import { NEWS_GUIDE } from "../src/generate/index.ts";
import {
  checkBank,
  othersThan,
  storyDurationMs,
} from "./support/bank-rules.ts";

const OTHERS = othersThan(NEWS_GUIDE);

test("the newscast's bank holds its stories and nothing composed", () => {
  expect(NEWS_GUIDE.format).toBe("variety");
  expect(NEWS_GUIDE.stories.length).toBe(36);
  expect(
    NEWS_GUIDE.stories.reduce((sum, story) => sum + story.lines.length, 0),
  ).toBe(190);
  expect(
    NEWS_GUIDE.stories.reduce((sum, story) => sum + story.brackets.length, 0),
  ).toBe(30);
  expect(NEWS_GUIDE.cast.length).toBe(28);
  expect(NEWS_GUIDE.names.length).toBe(31);
  expect(NEWS_GUIDE.places.length).toBe(0);
  expect(NEWS_GUIDE.vocabulary.length).toBe(0);
  expect(NEWS_GUIDE.beats.length).toBe(0);
  expect(NEWS_GUIDE.action.length).toBe(0);
  expect(NEWS_GUIDE.dialogue).toEqual([]);
  expect(NEWS_GUIDE.tags.length).toBe(0);
  expect(NEWS_GUIDE.barks.length).toBe(0);
});

test("news copy is held to twenty-five words a line and no word of judgement", () => {
  expect(NEWS_GUIDE.style).toEqual({
    actionWords: 0,
    dialogueWords: 25,
    sentenceWords: 20,
    banned: [
      /\b(shocking|amazing|tragic|disgraceful|brilliant|outrageous|stunning|horrific|incredible|terrible|wonderful)\b/i,
    ],
  });
});

test("every scripted story but three has its row's running time", () => {
  expect(NEWS_GUIDE.stories.map((story) => [story.slug, story.durMs])).toEqual([
    ["stories/02", 35_000],
    ["stories/03", 65_000],
    ["stories/04", 40_000],
    ["stories/05", 30_000],
    ["stories/06", 45_000],
    ["stories/08", 30_000],
    ["stories/09", 35_000],
    ["stories/10", 40_000],
    ["stories/11", 110_000],
    ["stories/12", 30_000],
    ["stories/13", 55_000],
    ["stories/14", 25_000],
    ["stories/15", 100_000],
    ["stories/16", 40_000],
    ["stories/17", 25_000],
    ["stories/18", 45_000],
    ["stories/19", 30_000],
    ["stories/20", 105_000],
    ["stories/21", 50_000],
    ["stories/22", 45_000],
    ["stories/23", 35_000],
    ["stories/24", 35_000],
    ["stories/25", 115_000],
    ["stories/26", 25_000],
    ["stories/27", 125_000],
    ["stories/28", 210_000],
    ["stories/29", 55_000],
    ["stories/30", 40_000],
    ["stories/31", 35_000],
    ["stories/32", 130_000],
    ["stories/33", 30_000],
    ["stories/34", 45_000],
    ["stories/35", 35_000],
    ["stories/36", 30_000],
    ["stories/38", 35_000],
    ["stories/39", 45_000],
  ]);
});

test("each story reads within two seconds of its row's running time", () => {
  const drifting = NEWS_GUIDE.stories
    .map((story) => ({
      slug: story.slug,
      driftMs: storyDurationMs(story) - story.durMs,
    }))
    .filter((story) => Math.abs(story.driftMs) > 2_000);
  expect(drifting).toEqual([]);
});

test("every story line is spoken by the cast and keeps to the newsroom's voice", () => {
  expect(checkBank(NEWS_GUIDE, OTHERS)).toEqual([]);
});
