import { expect, test } from "bun:test";
import { LAMP_ROOM_GUIDE } from "../src/generate/index.ts";
import { checkBank, othersThan } from "./support/bank-rules.ts";

const OTHERS = othersThan(LAMP_ROOM_GUIDE);

test("the bank holds its counts of each list", () => {
  expect(LAMP_ROOM_GUIDE.action.length).toBe(300);
  expect(LAMP_ROOM_GUIDE.dialogue.length).toBe(300);
  expect(LAMP_ROOM_GUIDE.tags.length).toBe(40);
  expect(LAMP_ROOM_GUIDE.beats.length).toBe(7);
  expect(LAMP_ROOM_GUIDE.stories.length).toBe(0);
  expect(LAMP_ROOM_GUIDE.barks.length).toBe(0);
  expect(LAMP_ROOM_GUIDE.cast.length).toBe(5);
  expect(LAMP_ROOM_GUIDE.places.length).toBe(5);
  expect(LAMP_ROOM_GUIDE.names.length).toBe(5);
  expect(LAMP_ROOM_GUIDE.vocabulary.length).toBe(10);
});

test("The Lamp Room is a screenplay", () => {
  expect(LAMP_ROOM_GUIDE.format).toBe("screenplay");
});

test("the seven beats cover twelve pages, a scene each", () => {
  expect(
    LAMP_ROOM_GUIDE.beats.map(({ id, scenes, pages, timeOfDay, places }) => ({
      id,
      scenes,
      pages,
      timeOfDay,
      places,
    })),
  ).toEqual([
    {
      id: "medium/the-lamp-room/script#1",
      scenes: [1, 1],
      pages: [1, 1],
      timeOfDay: "DUSK",
      places: ["EXT. GULL POINT - POINT ROAD"],
    },
    {
      id: "medium/the-lamp-room/script#2",
      scenes: [2, 2],
      pages: [1, 3],
      timeOfDay: "NIGHT",
      places: ["INT. LIGHTHOUSE - KEEPER'S KITCHEN"],
    },
    {
      id: "medium/the-lamp-room/script#3",
      scenes: [3, 3],
      pages: [3, 5],
      timeOfDay: "NIGHT",
      places: ["INT. LAMP ROOM"],
    },
    {
      id: "medium/the-lamp-room/script#4",
      scenes: [4, 4],
      pages: [5, 7],
      timeOfDay: "LATER",
      places: ["INT. LAMP ROOM"],
    },
    {
      id: "medium/the-lamp-room/script#5",
      scenes: [5, 5],
      pages: [7, 9],
      timeOfDay: "LATER",
      places: ["INT. LAMP ROOM"],
    },
    {
      id: "medium/the-lamp-room/script#6",
      scenes: [6, 6],
      pages: [9, 11],
      timeOfDay: "NIGHT",
      places: ["EXT. LAMP ROOM - GALLERY"],
    },
    {
      id: "medium/the-lamp-room/script#7",
      scenes: [7, 7],
      pages: [11, 12],
      timeOfDay: "DAWN",
      places: ["INT. LAMP ROOM"],
    },
  ]);
});

test("every cue and place a beat names is in the cast and the places", () => {
  const cues = new Set(LAMP_ROOM_GUIDE.cast.map((member) => member.cue));
  const places = new Set(LAMP_ROOM_GUIDE.places);
  const beats = LAMP_ROOM_GUIDE.beats;
  expect(
    beats.flatMap((beat) => beat.cast).filter((c) => !cues.has(c)),
  ).toEqual([]);
  expect(
    beats.flatMap((beat) => beat.places).filter((p) => !places.has(p)),
  ).toEqual([]);
});

test("every question has an answer to match, and a quarter of the lines suit anyone", () => {
  const dialogue = LAMP_ROOM_GUIDE.dialogue;
  const asks = dialogue.filter((line) => line.intent === "ask").length;
  const answers = dialogue.filter((line) => line.intent === "answer").length;
  const anyone = dialogue.filter((line) => line.speaker === null).length;
  expect({ asks, answers, anyone }).toEqual({
    asks: 84,
    answers: 87,
    anyone: 88,
  });
  expect(answers >= asks && anyone * 4 >= dialogue.length).toBe(true);
});

test("every entry keeps to the voice of the film", () => {
  expect(checkBank(LAMP_ROOM_GUIDE, OTHERS)).toEqual([]);
});
