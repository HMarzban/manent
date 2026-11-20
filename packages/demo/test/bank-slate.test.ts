import { expect, test } from "bun:test";
import { SLATE_GUIDES } from "../src/generate/index.ts";
import type { StyleGuide } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

/** The lists every film fills from the one shared bank. */
const sharedLists = (guide: StyleGuide): readonly (readonly string[])[] => [
  guide.action,
  guide.dialogue.map((line) => line.text),
  guide.tags,
];

const textsOf = (guide: StyleGuide): string[] => [
  ...sharedLists(guide).flat(),
  ...guide.beats.map((beat) => beat.summary),
];

test("the slate holds twenty-eight films, each with its own format, cast, places and pages", () => {
  expect(
    SLATE_GUIDES.map((guide) => ({
      project: guide.project,
      format: guide.format,
      cast: guide.cast.length,
      places: guide.places.length,
      names: guide.names.length,
      vocabulary: guide.vocabulary.length,
      pages: guide.beats.at(-1)?.pages[1],
    })),
  ).toEqual([
    {
      project: "ned-ashby-and-the-glass-orchard",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 1,
      vocabulary: 0,
      pages: 61,
    },
    {
      project: "ember-fleet-the-far-shore",
      format: "screenplay",
      cast: 6,
      places: 4,
      names: 2,
      vocabulary: 0,
      pages: 118,
    },
    {
      project: "the-keeper-of-the-last-bell-the-founding-road",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 2,
      vocabulary: 0,
      pages: 129,
    },
    {
      project: "the-keeper-of-the-last-bell-carrow-height",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 2,
      vocabulary: 0,
      pages: 126,
    },
    {
      project: "paper-moons",
      format: "animation",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 84,
    },
    {
      project: "salt-and-sons",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 104,
    },
    {
      project: "overtime-at-the-observatory",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 96,
    },
    {
      project: "quiet-water",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 102,
    },
    {
      project: "sixteen-bridges",
      format: "screenplay",
      cast: 6,
      places: 5,
      names: 1,
      vocabulary: 0,
      pages: 110,
    },
    {
      project: "highwire",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 108,
    },
    {
      project: "the-understudys-understudy",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 98,
    },
    {
      project: "a-house-for-the-winter",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 92,
    },
    {
      project: "the-beekeepers-accounts",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 94,
    },
    {
      project: "cold-reading",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 100,
    },
    {
      project: "matchday",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 90,
    },
    {
      project: "the-last-tram-to-orrin-street",
      format: "screenplay",
      cast: 7,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 88,
    },
    {
      project: "snowline",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 106,
    },
    {
      project: "pigeon-post",
      format: "screenplay",
      cast: 4,
      places: 4,
      names: 0,
      vocabulary: 0,
      pages: 10,
    },
    {
      project: "second-unit",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 104,
    },
    {
      project: "gentle-machines",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 96,
    },
    {
      project: "small-claims",
      format: "screenplay",
      cast: 5,
      places: 4,
      names: 0,
      vocabulary: 0,
      pages: 32,
    },
    {
      project: "the-night-porter",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 58,
    },
    {
      project: "tidecallers",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 56,
    },
    {
      project: "moss-and-pebble-puddle-hunt",
      format: "ink",
      cast: 5,
      places: 4,
      names: 0,
      vocabulary: 0,
      pages: 14,
    },
    {
      project: "lowlight",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 100,
    },
    {
      project: "rooftop-summer",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 98,
    },
    {
      project: "the-archivist",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 102,
    },
    {
      project: "the-glassblower",
      format: "screenplay",
      cast: 5,
      places: 5,
      names: 0,
      vocabulary: 0,
      pages: 94,
    },
  ]);
});

test("every film keeps four to eight cast and three to six places", () => {
  expect(
    SLATE_GUIDES.filter(
      (guide) =>
        guide.cast.length < 4 ||
        guide.cast.length > 8 ||
        guide.places.length < 3 ||
        guide.places.length > 6,
    ).map((guide) => guide.project),
  ).toEqual([]);
});

test("every film holds the shared bank's counts of each list", () => {
  expect(
    SLATE_GUIDES.map((guide) => ({
      action: guide.action.length,
      dialogue: guide.dialogue.length,
      tags: guide.tags.length,
      beats: guide.beats.length,
      stories: guide.stories.length,
      barks: guide.barks.length,
    })),
  ).toEqual(
    SLATE_GUIDES.map(() => ({
      action: 300,
      dialogue: 300,
      tags: 40,
      beats: 6,
      stories: 0,
      barks: 0,
    })),
  );
});

test("each outline runs beat after beat from scene 1 and page 1 of its own document", () => {
  expect(
    SLATE_GUIDES.map((guide) => guide.beats.map((beat) => beat.id)[0]),
  ).toEqual([
    "heavy/h02/script#1",
    "heavy/h04/script#1",
    "heavy/h06/script#1",
    "heavy/h07/script#1",
    "heavy/h08/script#1",
    "heavy/h09/script#1",
    "heavy/h10/script#1",
    "heavy/h11/script#1",
    "heavy/h12/script#1",
    "heavy/h13/script#1",
    "heavy/h14/script#1",
    "heavy/h15/script#1",
    "heavy/h16/script#1",
    "heavy/h17/script#1",
    "heavy/h18/script#1",
    "heavy/h19/script#1",
    "heavy/h20/script#1",
    "heavy/h21/script#1",
    "heavy/h22/script#1",
    "heavy/h23/script#1",
    "heavy/h27/101#1",
    "heavy/h28/101#1",
    "heavy/h29/101#1",
    "heavy/h36/script#1",
    "heavy/h37/script#1",
    "heavy/h38/script#1",
    "heavy/h39/script#1",
    "heavy/h40/script#1",
  ]);
  const breaks = SLATE_GUIDES.flatMap((guide) => {
    const key = guide.beats[0]?.id.split("#")[0];
    return guide.beats.flatMap((beat, index) => {
      const before = guide.beats[index - 1];
      const firstScene = before === undefined ? 1 : before.scenes[1] + 1;
      const firstPages =
        before === undefined ? [1] : [before.pages[1], before.pages[1] + 1];
      const holds =
        beat.id === `${key}#${index + 1}` &&
        beat.scenes[0] === firstScene &&
        beat.scenes[1] >= beat.scenes[0] &&
        firstPages.includes(beat.pages[0]) &&
        beat.pages[1] >= beat.pages[0];
      return holds ? [] : [beat.id];
    });
  });
  expect(breaks).toEqual([]);
});

test("every cue and place a beat names is in its film's cast and places", () => {
  expect(
    SLATE_GUIDES.flatMap((guide) => {
      const cues = new Set(guide.cast.map((member) => member.cue));
      return guide.beats
        .flatMap((beat) => beat.cast)
        .filter((c) => !cues.has(c));
    }),
  ).toEqual([]);
  expect(
    SLATE_GUIDES.flatMap((guide) => {
      const places = new Set(guide.places);
      return guide.beats
        .flatMap((beat) => beat.places)
        .filter((p) => !places.has(p));
    }),
  ).toEqual([]);
});

test("no two of the slate's cast share a name or a cue", () => {
  const names = SLATE_GUIDES.flatMap((guide) => guide.cast.map((m) => m.name));
  const cues = SLATE_GUIDES.flatMap((guide) => guide.cast.map((m) => m.cue));
  expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual(
    [],
  );
  expect(cues.filter((cue, index) => cues.indexOf(cue) !== index)).toEqual([]);
});

test("every shared line is filled with each film's own people and places, and no slot is left", () => {
  expect(
    SLATE_GUIDES.flatMap(textsOf).filter((text) => /[{}]/.test(text)),
  ).toEqual([]);
  const shared = SLATE_GUIDES.flatMap((guide) =>
    sharedLists(guide).flatMap((list, kind) =>
      list.map((text, at) => `${kind}:${at}:${text}`),
    ),
  );
  const alike = shared.filter(
    (entry, index) => shared.indexOf(entry) !== index,
  );
  expect(alike).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const ratios = SLATE_GUIDES.map(({ dialogue }) => ({
    asks: dialogue.filter((line) => line.intent === "ask").length,
    answers: dialogue.filter((line) => line.intent === "answer").length,
    anyone: dialogue.filter((line) => line.speaker === null).length,
  }));
  expect(ratios).toEqual(
    SLATE_GUIDES.map(() => ({ asks: 75, answers: 80, anyone: 99 })),
  );
  expect(
    ratios.every(
      ({ asks, answers, anyone }) => answers >= asks && anyone * 4 >= 300,
    ),
  ).toBe(true);
});

test("every entry keeps to the voice of its film", () => {
  expect(
    SLATE_GUIDES.flatMap((guide) => checkBank(guide, othersThan(guide))),
  ).toEqual([]);
});
