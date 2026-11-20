import { expect, test } from "bun:test";
import { LARCH_ROAD_GUIDE } from "../src/generate/index.ts";
import type { Beat } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(LARCH_ROAD_GUIDE);

test("every list of the series' bank holds the number written for it", () => {
  expect(LARCH_ROAD_GUIDE.cast.length).toBe(6);
  expect(LARCH_ROAD_GUIDE.places.length).toBe(5);
  expect(LARCH_ROAD_GUIDE.names.length).toBe(4);
  expect(LARCH_ROAD_GUIDE.vocabulary.length).toBe(0);
  expect(LARCH_ROAD_GUIDE.beats.length).toBe(64);
  expect(LARCH_ROAD_GUIDE.action.length).toBe(300);
  expect(LARCH_ROAD_GUIDE.dialogue.length).toBe(300);
  expect(LARCH_ROAD_GUIDE.tags.length).toBe(40);
  expect(LARCH_ROAD_GUIDE.stories.length).toBe(0);
  expect(LARCH_ROAD_GUIDE.barks.length).toBe(0);
});

test("the series is multi-camera, held to its voice's limits", () => {
  expect(LARCH_ROAD_GUIDE.format).toBe("multicam");
  expect(LARCH_ROAD_GUIDE.style).toEqual({
    actionWords: 20,
    dialogueWords: 25,
    sentenceWords: 20,
    banned: [],
  });
});

test("no fewer lines answer than ask, and a quarter belong to anyone in the scene", () => {
  const lines = LARCH_ROAD_GUIDE.dialogue;
  const ask = lines.filter((line) => line.intent === "ask").length;
  const answer = lines.filter((line) => line.intent === "answer").length;
  const anyone = lines.filter((line) => line.speaker === null).length;
  expect({ ask, answer, anyone }).toEqual({
    ask: 90,
    answer: 102,
    anyone: 83,
  });
  expect(answer >= ask).toBe(true);
  expect(anyone * 4 >= lines.length).toBe(true);
});

test("every beat's people are in the cast and its places in the places", () => {
  const cues = new Set(LARCH_ROAD_GUIDE.cast.map((member) => member.cue));
  const places = new Set(LARCH_ROAD_GUIDE.places);
  const beats = LARCH_ROAD_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("the third season's eight episodes hold eight scenes each, and no other season has beats", () => {
  const perSeason: Record<string, number> = {};
  const perEpisode: Record<string, number> = {};
  for (const beat of LARCH_ROAD_GUIDE.beats) {
    const episode = beat.id.slice("heavy/h25/".length, beat.id.indexOf("#"));
    const season = episode.slice(0, 1);
    perSeason[season] = (perSeason[season] ?? 0) + 1;
    perEpisode[episode] = (perEpisode[episode] ?? 0) + 1;
  }
  expect(perSeason).toEqual({ "3": 64 });
  expect(perEpisode).toEqual({
    "301": 8,
    "302": 8,
    "303": 8,
    "304": 8,
    "305": 8,
    "306": 8,
    "307": 8,
    "308": 8,
  });
});

test("each episode's scenes run in order, each starting a page of its own, with none left out", () => {
  const episodes = new Map<string, Beat[]>();
  for (const beat of LARCH_ROAD_GUIDE.beats) {
    const key = beat.id.slice(0, beat.id.indexOf("#"));
    episodes.set(key, [...(episodes.get(key) ?? []), beat]);
  }
  const broken = [...episodes.values()].flatMap((beats) =>
    beats.filter((beat, i) => {
      const [first, last] = beat.pages;
      const before = beats[i - 1]?.pages[1] ?? 0;
      return (
        !beat.id.endsWith(`#${i + 1}`) ||
        beat.scenes[0] !== i + 1 ||
        beat.scenes[1] !== i + 1 ||
        first !== before + 1 ||
        last < first
      );
    }),
  );
  expect(broken.map((beat) => beat.id)).toEqual([]);
  expect([...episodes.values()].map((beats) => beats.at(-1)?.pages[1])).toEqual(
    [46, 48, 45, 47, 50, 46, 44, 42],
  );
});

test("no entry of the series' bank breaks a bank rule", () => {
  expect(checkBank(LARCH_ROAD_GUIDE, OTHERS)).toEqual([]);
});

test("no line for anyone in the scene and no tag names one of the cast", () => {
  const castWords = new Set(
    LARCH_ROAD_GUIDE.cast.flatMap((member) =>
      `${member.cue} ${member.name}`.toLowerCase().split(" "),
    ),
  );
  const namesCast = (text: string): boolean =>
    text
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .some(
        (word) => castWords.has(word) || castWords.has(word.replace(/s$/u, "")),
      );
  const anyone = LARCH_ROAD_GUIDE.dialogue
    .filter((line) => line.speaker === null)
    .map((line) => line.text);
  expect([...anyone, ...LARCH_ROAD_GUIDE.tags].filter(namesCast)).toEqual([]);
});
