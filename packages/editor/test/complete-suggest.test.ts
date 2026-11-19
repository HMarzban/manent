import { expect, test } from "bun:test";
import type { LayoutBlock } from "@manent/pagination";
import { collectNames, suggest, toIndex } from "../src/index.ts";
import { docOfBlocks } from "./docs.ts";

const blocksOfScript = (
  rows: readonly (readonly [string, string])[],
): readonly LayoutBlock[] => toIndex(docOfBlocks(rows)).blocks;

const names = collectNames(
  blocksOfScript([
    ["scene_heading", "INT. KITCHEN - NIGHT"],
    ["character", "DANA"],
    ["dialogue", "Hi."],
    ["character", "DAVID (V.O.)"],
    ["scene_heading", "EXT. HARBOR - DAY"],
    ["character", "DANA"],
    ["transition", "SMASH CUT TO:"],
  ]),
);

test("names are collected from the script, cues without their extension", () => {
  expect([
    [...names.characters],
    [...names.locations],
    [...names.times],
    [...names.transitions],
  ]).toEqual([
    [
      ["DANA", 2],
      ["DAVID", 1],
    ],
    [
      ["KITCHEN", 1],
      ["HARBOR", 1],
    ],
    [
      ["NIGHT", 1],
      ["DAY", 1],
    ],
    [["SMASH CUT TO:", 1]],
  ]);
});

test("a cue completes from the scene first, then by use", () => {
  expect(suggest("character", "Da", 2, names, ["DAVID"])).toEqual({
    from: 0,
    to: 2,
    items: ["DAVID", "DANA"],
    next: "close",
  });
  expect(suggest("character", "DANA (", 6, names, [])).toEqual({
    from: 5,
    to: 6,
    items: ["(V.O.)", "(O.S.)", "(CONT'D)"],
    next: "close",
  });
  expect(suggest("character", "DANA", 2, names, [])).toBeNull(); // the caret is not at the end
});

test("a cue offers neither the name already typed nor anything before a letter", () => {
  expect([
    suggest("character", "dana", 4, names, []),
    suggest("character", "", 0, names, []),
    suggest("character", "D", 1, names, []),
  ]).toEqual([
    null,
    null,
    { from: 0, to: 1, items: ["DANA", "DAVID"], next: "close" },
  ]);
});

test("names used as often are offered A to Z, and at most six", () => {
  const many = collectNames(
    blocksOfScript(
      ["MO", "MIA", "MAX", "MEG", "MILO", "MARA", "MEL", "MAX"].map(
        (name): [string, string] => ["character", name],
      ),
    ),
  );
  expect(suggest("character", "M", 1, many, [])!.items).toEqual([
    "MAX",
    "MARA",
    "MEG",
    "MEL",
    "MIA",
    "MILO",
  ]);
});

test("a scene heading completes in three parts", () => {
  expect(suggest("scene_heading", "i", 1, names, [])!.items).toEqual([
    "INT.",
    "I/E.",
  ]);
  expect(suggest("scene_heading", "INT. K", 6, names, [])).toEqual({
    from: 5,
    to: 6,
    items: ["KITCHEN"],
    next: "times",
  });
  expect(
    suggest("scene_heading", "INT. KITCHEN - ", 15, names, [])!.items,
  ).toEqual(["NIGHT", "DAY", "CONTINUOUS", "LATER"]);
});

test("transitions complete from the script and the usual ones", () => {
  expect(suggest("transition", "", 0, names, [])!.items).toEqual([
    "SMASH CUT TO:",
    "CUT TO:",
    "DISSOLVE TO:",
    "FADE OUT.",
  ]);
});

test("slugs complete from the script, and other elements offer nothing", () => {
  const show = collectNames(
    blocksOfScript([
      ["slug", "COLD OPEN"],
      ["slug", "CREDITS"],
      ["action", "Rain."],
    ]),
  );
  expect([
    suggest("slug", "c", 1, show, []),
    suggest("action", "Ra", 2, show, []),
    suggest("transition", "zz", 2, names, []),
  ]).toEqual([
    { from: 0, to: 1, items: ["COLD OPEN", "CREDITS"], next: "close" },
    null,
    null,
  ]);
});
