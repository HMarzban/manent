import { expect, test } from "bun:test";
import { paginate, profileFor } from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import type { BlockJSON, BlockType } from "@manent/schema";
import {
  characterReportRows,
  findNearDuplicateLocations,
  locationReportRows,
  numbersOf,
  pickupLineRows,
  sceneReportRows,
} from "../src/index.ts";

const screenplay = profileFor("screenplay")!;

function block(id: string, type: BlockType, text: string): LayoutBlock {
  return {
    id,
    type,
    kind: null,
    text,
    styles: null,
    dual: null,
    num: null,
    align: null,
    indent: null,
    width: null,
    spaceBefore: null,
    noContd: false,
  };
}

function blockJson(id: string, type: BlockType, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

test("numbersOf counts pages, scenes, estimated runtime and dialogue sorted by word count", () => {
  const layoutBlocks = [
    block("b01", "scene_heading", "INT. KITCHEN - DAY"),
    block("b02", "character", "TOM (V.O.)"),
    block("b03", "dialogue", "One two."),
    block("b04", "character", "MIRA"),
    block("b05", "parenthetical", "(quietly)"),
    block("b06", "dialogue", "Three four five six seven."),
    block("b07", "scene_heading", "EXT. KITCHEN - NIGHT"),
    block("b08", "character", "MIRA (CONT'D)"),
    block("b09", "dialogue", "Eight nine."),
  ];
  const result = numbersOf(layoutBlocks, 4, [
    "1",
    "1",
    "1",
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
  ]);
  expect(result).toEqual({
    pages: 4,
    scenes: 2,
    chapters: 0,
    words: 23,
    estimatedRuntimeMinutes: 4,
    estimatedReadingMinutes: 1,
    characters: [
      { name: "MIRA", speeches: 2, words: 7, scenes: 2, firstPage: "1" },
      { name: "TOM", speeches: 1, words: 2, scenes: 1, firstPage: "1" },
    ],
  });
});

test("report row builders produce exact character, scene (locked & unlocked), location and pickup-line rows", () => {
  const blocks = [
    block("b01", "scene_heading", "INT. KITCHEN - DAY"),
    block("b02", "character", "MIRA"),
    block("b03", "dialogue", "First unchanged line."),
    block("b04", "character", "TOM (O.S.)"),
    block("b05", "dialogue", "Edited line now."),
    block("b06", "scene_heading", "EXT. KITCHEN - NIGHT"),
    block("b07", "character", "MIRA"),
    block("b08", "dialogue", "Brand new pickup line."),
  ];
  const pagination = paginate(blocks, screenplay);

  expect(characterReportRows(pagination)).toEqual([
    { name: "MIRA", speeches: 2, words: 7, scenes: 2, firstPage: "1" },
    { name: "TOM", speeches: 1, words: 3, scenes: 1, firstPage: "1" },
  ]);

  const unlockedScenes = sceneReportRows(pagination);
  expect(
    unlockedScenes.map((r) => [r.number, r.heading, r.page, r.characters]),
  ).toEqual([
    ["1", "INT. KITCHEN - DAY", "1", "MIRA, TOM"],
    ["2", "EXT. KITCHEN - NIGHT", "1", "MIRA"],
  ]);
  expect(unlockedScenes[0]!.length.endsWith("lines")).toBe(true);

  const lockedScenes = sceneReportRows(pagination, { locked: true });
  expect(lockedScenes[0]!.length).toMatch(/^\d+\/8$|^\d+( \d+\/8)?$/);

  expect(locationReportRows(pagination)).toEqual([
    {
      location: "KITCHEN",
      interiorOrExterior: "Interior and exterior",
      scenes: 2,
      pages: "1",
    },
  ]);

  const recordBaseline: BlockJSON[] = [
    blockJson("b03", "dialogue", "First unchanged line."),
    blockJson("b05", "dialogue", "Original line before edit."),
  ];
  expect(pickupLineRows(pagination, recordBaseline)).toEqual([
    { character: "TOM", line: "Edited line now.", page: "1" },
    { character: "MIRA", line: "Brand new pickup line.", page: "1" },
  ]);
});

test("findNearDuplicateLocations groups trailing-dot and typo spellings with most-used canonical first", () => {
  const blocks = [
    block("b01", "scene_heading", "INT. KITCHEN - DAY"),
    block("b02", "scene_heading", "INT. KITCHEN. - NIGHT"),
    block("b03", "scene_heading", "INT. KITCHEN - DUSK"),
    block("b04", "scene_heading", "INT. KICHEN - DAWN"),
    block("b05", "scene_heading", "EXT. HARBOUR - DAY"),
  ];
  expect(findNearDuplicateLocations(blocks)).toEqual([
    {
      canonical: "KITCHEN",
      variants: ["KITCHEN.", "KICHEN"],
      spellings: ["KITCHEN", "KITCHEN.", "KICHEN"],
      affectedCount: 2,
    },
  ]);
});
