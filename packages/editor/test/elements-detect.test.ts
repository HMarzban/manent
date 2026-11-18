import { expect, test } from "bun:test";
import type { ActBreakKind, BlockType } from "@manent/schema";
import { detectOnEnter, detectTyped } from "../src/index.ts";
import type { ElementRef } from "../src/index.ts";

const sp = (type: BlockType, kind: ActBreakKind | null = null): ElementRef => ({
  type,
  kind,
});

test("typing turns a line into the element its first characters name", () => {
  expect([
    detectTyped("screenplay", sp("action"), null, "int. "),
    detectTyped("screenplay", sp("action"), sp("character"), "("),
    detectTyped("screenplay", sp("action"), sp("action"), "("),
    detectTyped("variety", sp("bracket"), null, "["),
    detectTyped("game", sp("action"), null, "*"),
    detectTyped("variety", sp("bracket"), null, "INT. "),
    detectTyped("screenplay", sp("action"), null, "INTO "),
  ]).toEqual([
    sp("scene_heading"),
    sp("parenthetical"),
    null,
    null,
    sp("general"),
    null,
    null,
  ]);
});

test("Enter turns a capital line ending TO: into a transition, and act names into act breaks", () => {
  expect([
    detectOnEnter("screenplay", sp("action"), "CUT TO:"),
    detectOnEnter("screenplay", sp("action"), "Cut to:"),
    detectOnEnter("screenplay", sp("action"), "ACT TWO"),
    detectOnEnter("screenplay", sp("action"), "TAG"),
    detectOnEnter("multicam", sp("general"), "END OF ACT ONE"),
    detectOnEnter("manuscript", sp("body"), "ACT TWO"),
    detectOnEnter("stage_play", sp("action"), "CUT TO:"),
  ]).toEqual([
    sp("transition"),
    null,
    sp("act_break", "new_act"),
    sp("act_break", "tag"),
    sp("act_break", "end_of_act"),
    null,
    null,
  ]);
});

test("each format detects only its own shortcuts", () => {
  expect([
    detectTyped("stage_play", sp("general"), null, "Ext. "),
    detectTyped("variety", sp("dialogue"), sp("dialogue"), "("),
    detectTyped("screenplay", sp("character"), sp("action"), "("),
    detectTyped("game", sp("dialogue"), null, "{"),
    detectTyped("game", sp("general"), null, "#"),
    detectTyped("manuscript", sp("body"), sp("dialogue"), "("),
    detectTyped("ink", sp("ink_line"), null, "INT. "),
    detectOnEnter("multicam", sp("action"), "TEASER"),
    detectOnEnter("animation", sp("action"), "END OF ACT"),
    detectOnEnter("screenplay", sp("action"), "END OF ACTION"),
    detectOnEnter("screenplay", sp("action"), "ACT"),
    detectOnEnter("variety", sp("bracket"), "CUT TO:"),
    detectOnEnter("ink", sp("ink_line"), "CUT TO:"),
  ]).toEqual([
    sp("scene_heading"),
    sp("parenthetical"),
    null,
    sp("general"),
    null,
    null,
    null,
    sp("act_break", "teaser"),
    sp("act_break", "end_of_act"),
    null,
    null,
    null,
    null,
  ]);
});
