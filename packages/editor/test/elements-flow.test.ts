import { expect, test } from "bun:test";
import { ACT_BREAK_KINDS, FORMATS, FORMAT_ELEMENTS } from "@manent/schema";
import type { ActBreakKind, BlockType, FormatId } from "@manent/schema";
import {
  ELEMENT_SLOTS,
  elementSlot,
  firstElement,
  flowRow,
  plainTextElement,
  shiftTabTarget,
  slotElement,
} from "../src/index.ts";
import type { ElementRef, FlowTarget } from "../src/index.ts";

const sp = (type: BlockType, kind: ActBreakKind | null = null): ElementRef => ({
  type,
  kind,
});
const name = (t: FlowTarget) => (typeof t.to === "object" ? t.to.type : t.to);
const row = (
  f: FormatId,
  e: ElementRef,
  pref: "action" | "character" = "action",
) => {
  const r = flowRow(f, e, { enterAfterDialogue: pref });
  return [
    name(r.enter),
    name(r.tabAtEnd),
    name(r.tabEmpty),
    name(r.enterEmpty),
  ];
};
const prefs = { enterAfterDialogue: "action" } as const;

test("Enter and Tab follow the table, screenplay", () => {
  expect(
    [
      sp("scene_heading"),
      sp("action"),
      sp("character"),
      sp("parenthetical"),
      sp("dialogue"),
      sp("transition"),
      sp("shot"),
      sp("act_break", "new_act"),
      sp("act_break", "end_of_act"),
      sp("group"),
    ].map((e) => row("screenplay", e)),
  ).toEqual([
    ["action", "heading_part", "action", "picker"],
    ["action", "character", "character", "picker"],
    ["dialogue", "parenthetical", "transition", "action"],
    ["dialogue", "dialogue", "dialogue", "dialogue"],
    ["action", "parenthetical", "character", "action"],
    ["scene_heading", "scene_heading", "scene_heading", "picker"],
    ["action", "action", "action", "picker"],
    ["scene_heading", "scene_heading", "scene_heading", "picker"],
    ["act_break", "act_break", "act_break", "picker"],
    ["scene_heading", "scene_heading", "scene_heading", "picker"],
  ]);
  expect(row("screenplay", sp("dialogue"), "character")[0]).toBe("character");
});

test("Enter and Tab follow the table, manuscript", () => {
  expect(
    [sp("chapter"), sp("break"), sp("body"), sp("quote")].map((e) =>
      row("manuscript", e),
    ),
  ).toEqual([
    ["body", "body", "body", "picker"],
    ["body", "body", "body", "picker"],
    ["body", "quote", "nothing", "picker"],
    ["body", "body", "body", "body"],
  ]);
});

test("each format speaks its own elements", () => {
  expect([
    row("variety", sp("slug")),
    row("variety", sp("bracket")),
    row("game", sp("emote")),
    row("stage_play", sp("character"))[2],
    row("ink", sp("ink_line")),
    row("multicam", sp("dialogue")),
  ]).toEqual([
    ["bracket", "heading_part", "bracket", "picker"],
    ["bracket", "character", "character", "picker"],
    ["emote", "character", "character", "picker"],
    "action",
    ["ink_line", "nothing", "nothing", "ink_line"],
    ["action", "parenthetical", "character", "action"],
  ]);
});

test("every slot each format offers is one of its elements, and back again", () => {
  for (const f of FORMATS)
    for (const slot of ELEMENT_SLOTS) {
      const e = slotElement(f, slot);
      if (e === null) continue;
      expect([
        f,
        slot,
        FORMAT_ELEMENTS[f].includes(e.type),
        elementSlot(f, e),
      ]).toEqual([f, slot, true, slot]);
    }
  expect([
    slotElement("variety", "1"),
    slotElement("manuscript", "5"),
    slotElement("stage_play", "6"),
    slotElement("game", "G"),
    slotElement("ink", "2"),
  ]).toEqual([sp("slug"), sp("quote"), null, sp("engine"), sp("ink_line")]);
});

test("every target of the flow is an element of the format", () => {
  for (const f of FORMATS)
    for (const type of FORMAT_ELEMENTS[f])
      for (const kind of type === "act_break" ? ACT_BREAK_KINDS : [null]) {
        const r = flowRow(
          f,
          { type, kind },
          { enterAfterDialogue: "character" },
        );
        for (const t of [r.enter, r.tabAtEnd, r.tabEmpty, r.enterEmpty])
          if (typeof t.to === "object")
            expect([f, type, FORMAT_ELEMENTS[f].includes(t.to.type)]).toEqual([
              f,
              type,
              true,
            ]);
      }
});

test("Shift+Tab on an empty line goes back the way Tab came", () => {
  expect([
    shiftTabTarget("screenplay", sp("character"), prefs),
    shiftTabTarget("screenplay", sp("transition"), prefs),
    shiftTabTarget("screenplay", sp("scene_heading"), prefs),
  ]).toEqual([sp("action"), sp("character"), sp("transition")]);
  expect(shiftTabTarget("manuscript", sp("chapter"), prefs)).toBeNull();
});

test("a new script starts on its first slot, and a pasted plain line is its second", () => {
  expect([
    firstElement("screenplay"),
    firstElement("variety"),
    firstElement("manuscript"),
    firstElement("ink"),
    plainTextElement("variety"),
    plainTextElement("manuscript"),
    plainTextElement("ink"),
  ]).toEqual([
    sp("scene_heading"),
    sp("slug"),
    sp("chapter"),
    sp("ink_line"),
    sp("bracket"),
    sp("body"),
    sp("ink_line"),
  ]);
});
