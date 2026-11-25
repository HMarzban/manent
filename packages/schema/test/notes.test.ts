import { expect, test } from "bun:test";
import {
  ANCHOR_CONTEXT_UNITS,
  isScriptNote,
  textAnchorAt,
} from "../src/index.ts";
import type { ScriptNote } from "../src/index.ts";

const NOTE: ScriptNote = {
  v: 1,
  anchor: {
    blockId: "blk_000000000001",
    start: 16,
    end: 20,
    quote: "Salt",
    prefix: "The lens turns. ",
    suffix: " on the glass, a",
  },
  text: "Keep the salt on the glass in every shot of the lens.",
  writerName: "Priya Nair",
  at: 1_763_000_000_000,
};

test("a note is recognised by its shape", () => {
  expect([
    isScriptNote(NOTE),
    isScriptNote({ ...NOTE, v: 2 }),
    isScriptNote({ ...NOTE, anchor: { blockId: "blk_000000000001" } }),
    isScriptNote(null),
  ]).toEqual([true, false, false, false]);
});

test("a note's anchor quotes its text with sixteen units either side, never half a surrogate pair", () => {
  const block = {
    id: "blk_000000000001",
    text: "The lens turns. Salt on the glass, and 👁 above it all.",
  };
  expect(ANCHOR_CONTEXT_UNITS).toBe(16);
  expect(textAnchorAt(block, 16, 20)).toEqual({
    blockId: "blk_000000000001",
    start: 16,
    end: 20,
    quote: "Salt",
    prefix: "The lens turns. ",
    suffix: " on the glass, a",
  });
  // 16 units back would start inside the eye's pair: 15 are taken
  expect(
    textAnchorAt(
      { id: "blk_000000000002", text: "👁 Salt on the glass." },
      17,
      20,
    ),
  ).toMatchObject({ quote: "ass", prefix: " Salt on the gl" });
  // 16 units on would end inside the eye's pair: 15 are taken
  expect(
    textAnchorAt(
      { id: "blk_000000000003", text: "Salt on the glass, 👁." },
      0,
      4,
    ),
  ).toMatchObject({ quote: "Salt", suffix: " on the glass, " });
});

test("a note's anchor outside its block's text is refused", () => {
  const block = { id: "blk_000000000001", text: "Salt on the glass." };
  for (const [start, end] of [
    [-1, 2],
    [4, 2],
    [0, 19],
    [0.5, 2],
  ] as const)
    expect(() => textAnchorAt(block, start, end)).toThrow(RangeError);
});
