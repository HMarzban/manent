import { expect, test } from "bun:test";
import { STYLE } from "../src/index.ts";
import {
  EDGE_PARAGRAPHS,
  RULE_SCRIPTS,
  block,
  corpusDoc,
  corpusId,
  cueBlock,
  filledBlock,
  filledText,
  generateBlocks,
  layoutBlocksOf,
  unbrokenText,
  viewOf,
} from "../src/testing/index.ts";
import type { CorpusFormat } from "../src/testing/index.ts";

test("the generator is deterministic and grows by appending", () => {
  const a = generateBlocks("screenplay", 500, 7);
  expect(generateBlocks("screenplay", 500, 7)).toEqual(a);
  expect(generateBlocks("screenplay", 200, 7)).toEqual(a.slice(0, 200));
  expect(generateBlocks("screenplay", 500, 8)).not.toEqual(a);
});
const types = (f: CorpusFormat) =>
  [...new Set(generateBlocks(f, 3000, 1).map((b) => b.type))].toSorted();

test("each format is made of its own elements, in a believable order, in the script font", () => {
  expect(types("screenplay")).toEqual([
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "scene_heading",
    "transition",
  ]);
  expect(types("stage_play")).toEqual([
    "act_break",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "scene_heading",
  ]);
  expect(types("manuscript")).toEqual(["body", "break", "chapter", "quote"]);
  expect(
    types("variety").filter((t) => t === "slug" || t === "bracket"),
  ).toEqual(["bracket", "slug"]);
  expect(
    types("game").filter((t) => ["emote", "camera", "engine"].includes(t)),
  ).toEqual(["camera", "emote", "engine"]);
  expect(types("multicam")).toContain("act_break");
  const s = generateBlocks("screenplay", 3000, 1);
  expect(s[0]!.type).toBe("scene_heading");
  expect(
    s.filter(
      (b, i) =>
        b.type === "dialogue" &&
        !["character", "parenthetical"].includes(s[i - 1]!.type),
    ),
  ).toEqual([]);
  expect(s.filter((b) => !new RegExp("^[\\x20-\\x7e]+$").test(b.text))).toEqual(
    [],
  );
});
test("a corpus document and its layout blocks carry the same stable ids", () => {
  const blocks = generateBlocks("screenplay", 250, 1);
  const doc = corpusDoc(blocks);
  expect(doc.content!.map((s) => s.content!.length)).toEqual([100, 100, 50]);
  expect([
    doc.content![0]!.content![0]!.attrs!.id,
    doc.content![1]!.content![0]!.attrs!.id,
    corpusId(100),
  ]).toEqual(["blk_000000000000", "blk_00000000002s", "blk_00000000002s"]);
  expect(
    layoutBlocksOf(blocks)
      .map((b) => [b.id, b.type, b.text])
      .slice(0, 2),
  ).toEqual(blocks.slice(0, 2).map((b, i) => [corpusId(i), b.type, b.text]));
});
test("the builders", () => {
  expect([filledText(35, 3), unbrokenText(60, 2)]).toEqual([
    ("x".repeat(34) + ".").repeat(3),
    "x".repeat(120),
  ]);
  expect(filledBlock("dialogue", 2, { dual: "left" })).toMatchObject({
    type: "dialogue",
    text: ("x".repeat(27) + ".").repeat(2),
    dual: "left",
    styles: null,
    kind: null,
    num: null,
    noContd: false,
  });
  expect([
    cueBlock("JANE").type,
    cueBlock("JANE").text,
    filledBlock("page_break", 0).text,
    Object.isFrozen(block("action", "x")),
  ]).toEqual(["character", "JANE", "", true]);
  expect(
    viewOf({ type: "dialogue" }, ["Rain "], ["hard", "bold"]),
  ).toMatchObject({
    attrs: { type: "dialogue", dual: null, omitted: false },
    runs: [
      { text: "Rain ", marks: [] },
      { text: "hard", marks: ["bold"] },
    ],
  });
});
test("the rule scripts and edge paragraphs are complete", () => {
  expect(RULE_SCRIPTS.map((s) => s.name)).toEqual([
    "long-speech",
    "short-actions",
    "many-cues",
    "transitions",
    "page-breaks",
    "dual",
    "tall-dual",
    "tall-block",
    "manuscript-chapters",
    "multicam-acts",
    "stage-play",
    "outside-the-font",
  ]);
  expect(EDGE_PARAGRAPHS.map((e) => [e.name, e.inFont, e.style])).toEqual([
    ["double-spaces", true, 0],
    ["hyphens", true, 0],
    ["slashes", true, 0],
    ["dashes", true, 0],
    ["unbroken", true, 0],
    ["quotes", true, 0],
    ["accents", true, 0],
    ["italic-ligatures", true, STYLE.ITALIC],
    ["bold-italic-ligatures", true, STYLE.BOLD | STYLE.ITALIC],
    ["wide", false, 0],
    ["emoji", false, 0],
    ["right-to-left", false, 0],
    ["mixed", false, 0],
  ]);
});
