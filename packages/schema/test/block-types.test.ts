import { expect, test } from "bun:test";
import { BLOCK_TYPES, FORMAT_ELEMENTS, isBlockType } from "../src/index.ts";
import type { BlockType } from "../src/index.ts";

test("a guard is the one way a closed list is searched", () => {
  expect(["action", "page_break", "nope", 7].map(isBlockType)).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

test("format element sets", () => {
  const all: BlockType[] = ["act_break", "group", "page_break"];
  const base: BlockType[] = [
    "scene_heading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    "shot",
    "general",
  ];
  expect(FORMAT_ELEMENTS.screenplay).toEqual([...base, ...all]);
  expect(FORMAT_ELEMENTS.multicam).toEqual(FORMAT_ELEMENTS.screenplay);
  expect(FORMAT_ELEMENTS.animation).toEqual(FORMAT_ELEMENTS.screenplay);
  expect(FORMAT_ELEMENTS.variety).toEqual([
    "slug",
    "bracket",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    "shot",
    "general",
    ...all,
  ]);
  expect(FORMAT_ELEMENTS.game).toEqual([
    ...base,
    "emote",
    "camera",
    "engine",
    ...all,
  ]);
  expect(FORMAT_ELEMENTS.ink).toEqual(["ink_line", ...all]);
  expect(FORMAT_ELEMENTS.manuscript).toEqual([
    "chapter",
    "body",
    "break",
    "quote",
    ...all,
  ]);
  // every element belongs to a format
  expect(new Set(Object.values(FORMAT_ELEMENTS).flat())).toEqual(
    new Set(BLOCK_TYPES),
  );
});
