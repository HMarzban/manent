import { expect, test } from "bun:test";
import {
  BLOCK_TYPES,
  FORMATS,
  FORMAT_ELEMENTS,
  firstElement,
  isBlockType,
} from "../src/index.ts";
import type { BlockType, FormatId } from "../src/index.ts";

test("a guard is the one way a closed list is searched", () => {
  expect(["action", "page_break", "nope", 7].map(isBlockType)).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

test("format element sets", () => {
  const all: BlockType[] = ["act_break", "group", "page_break", "graphic"];
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

test("a stage play has the screenplay's elements but Transition and Shot", () => {
  expect(FORMAT_ELEMENTS.stage_play).toEqual(
    FORMAT_ELEMENTS.screenplay.filter(
      (t) => t !== "transition" && t !== "shot",
    ),
  );
  expect(FORMAT_ELEMENTS.stage_play).toEqual([
    "scene_heading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "general",
    "act_break",
    "group",
    "page_break",
    "graphic",
  ]);
});

test("every format names its first block element", () => {
  const expected: Record<FormatId, { type: BlockType; kind: null }> = {
    screenplay: { type: "scene_heading", kind: null },
    multicam: { type: "scene_heading", kind: null },
    animation: { type: "scene_heading", kind: null },
    variety: { type: "slug", kind: null },
    game: { type: "scene_heading", kind: null },
    ink: { type: "ink_line", kind: null },
    manuscript: { type: "chapter", kind: null },
    stage_play: { type: "scene_heading", kind: null },
  };
  expect(
    Object.fromEntries(FORMATS.map((format) => [format, firstElement(format)])),
  ).toEqual(expected);
});
