import { expect, test } from "bun:test";
import {
  applyLayoutPatches,
  endsSentence,
  measure,
  paginate,
  profileFor,
  resolveSpec,
  toLayoutBlock,
} from "../src/index.ts";
import type { LayoutBlock, LayoutPatches } from "../src/index.ts";
import { block, filledBlock, viewOf } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const ms = profileFor("manuscript")!;
const play = profileFor("stage_play")!;
const lines = (b: LayoutBlock, p = sp) => measure(b, p).lines;
const heading = (id: string, place: string) =>
  toLayoutBlock(
    viewOf(
      { id: id.repeat(16), type: "scene_heading" },
      ["INT. "],
      [place, "underline"],
    ),
  );

test("a layout block is the block's text, its style bytes and the attributes that change layout", () => {
  const b = toLayoutBlock(
    viewOf(
      {
        id: "b".repeat(16),
        type: "dialogue",
        dual: "left",
        width: 30,
        noContd: true,
      },
      ["Rain "],
      ["hard", "bold", "caps"],
      ["er", "link"],
    ),
  );
  expect({ ...b, styles: [...b.styles!] }).toEqual({
    id: "b".repeat(16),
    type: "dialogue",
    kind: null,
    text: "Rain harder",
    styles: [0, 0, 0, 0, 0, 17, 17, 17, 17, 0, 0],
    dual: "left",
    num: null,
    align: null,
    indent: null,
    width: 30,
    spaceBefore: null,
    noContd: true,
  });
  expect([
    toLayoutBlock(viewOf({}, ["plain"])).styles,
    toLayoutBlock(viewOf({ type: "action", dual: "left" }, ["x"])).dual,
    Object.isFrozen(b),
  ]).toEqual([null, null, true]);
});

test("a layout patch changes the engine's blocks and nothing else", () => {
  const blocks = [
    block("scene_heading", "INT. HALL", { id: "h1", num: "1" }),
    block("action", "x", { id: "a1" }),
    block("scene_heading", "EXT. YARD", { id: "h2", num: "2" }),
    block("action", "y", { id: "a2" }),
  ];
  const layout: LayoutPatches = {
    key: "k1",
    patches: new Map([
      ["h1", { text: "OMITTED" }],
      ["a1", { type: "group", text: "" }],
      ["h2", { num: "2A" }],
    ]),
  };
  const out = applyLayoutPatches(blocks, layout);
  expect(out.map((b) => [b.id, b.type, b.text, b.num])).toEqual([
    ["h1", "scene_heading", "OMITTED", "1"],
    ["a1", "group", "", null],
    ["h2", "scene_heading", "EXT. YARD", "2A"],
    ["a2", "action", "y", null],
  ]);
  expect([
    out[3] === blocks[3],
    Object.isFrozen(out[0]),
    applyLayoutPatches(blocks, null).every((b, i) => b === blocks[i]),
  ]).toEqual([true, true, true]);
});

test("a patch that replaces a block's text drops the styles of the text it replaced", () => {
  const out = applyLayoutPatches([heading("a", "HALL"), heading("b", "YARD")], {
    key: "k1",
    patches: new Map([
      ["a".repeat(16), { text: "OMITTED" }],
      ["b".repeat(16), { num: "2A" }],
    ]),
  });
  expect(
    out.map((b) => [b.text, b.styles === null ? null : [...b.styles]]),
  ).toEqual([
    ["OMITTED", null],
    ["INT. YARD", [0, 0, 0, 0, 0, 4, 4, 4, 4]],
  ]);
});

test("overrides are clamped", () => {
  const spec = (extra: Partial<LayoutBlock>) => {
    const e = resolveSpec(sp, block("action", "x", extra));
    return [e.indent, e.width, e.spaceBefore, e.align];
  };
  expect([
    spec({ width: 0 }),
    spec({ width: 5000 }),
    spec({ indent: 500 }),
    spec({ spaceBefore: 10_000 }),
    spec({ align: "center" }),
  ]).toEqual([
    [0, 1, 1, "left"],
    [0, 60, 1, "left"],
    [59, 1, 1, "left"],
    [0, 60, 10, "left"],
    [0, 60, 1, "center"],
  ]);
  expect([
    resolveSpec(sp, filledBlock("dialogue", 1, { dual: "right" })).indent,
    resolveSpec(sp, filledBlock("dialogue", 1, { dual: "right" })).width,
  ]).toEqual([32, 28]);
  const odd = Array.from({ length: 100 }, () =>
    block("action", "x".repeat(60), { width: 0, spaceBefore: 10_000 }),
  );
  expect(
    paginate(odd, sp).pages.filter(
      (p) => p.usedUnits > 108 || p.usedUnits === 0,
    ),
  ).toEqual([]);
});

test("a block is measured from its own values: width, first-line indent, enclosure", () => {
  // what the ruler changes is what is measured
  expect([
    lines(filledBlock("action", 3)),
    lines(filledBlock("action", 3, { width: 30 })),
    lines(block("group", "Act two notes")),
  ]).toEqual([3, 6, 0]);
  // 60 + 65
  expect([
    lines(block("body", "x".repeat(125)), ms),
    lines(block("body", "x".repeat(126)), ms),
  ]).toEqual([2, 3]);
  // "(" and ")" take a cell each of 45
  expect([
    lines(block("action", "x".repeat(43)), play),
    lines(block("action", "x".repeat(44)), play),
  ]).toEqual([1, 2]);
});

test("a sentence ends a line", () => {
  expect(
    [
      "He stops.",
      "“Go!”  ",
      "wait…",
      "the end?’",
      "and then",
      "ask Dr.",
      "at 5 p.m.",
      "",
    ].map(endsSentence),
  ).toEqual([true, true, true, true, false, false, false, false]);
});
