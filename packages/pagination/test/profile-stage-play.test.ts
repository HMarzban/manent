import { expect, test } from "bun:test";
import { profileFor } from "../src/index.ts";

const play = profileFor("stage_play")!;

test("a stage play is a profile over the screenplay's elements", () => {
  const e = play.elements;
  expect([
    play.columnCells,
    play.linesPerPage,
    play.geometry.marginLeftPt,
  ]).toEqual([60, 54, 108]);
  expect([
    e["act_break.new_act"].align,
    e["act_break.new_act"].capitalized,
    e["act_break.new_act"].startingPage,
  ]).toEqual(["center", true, true]);
  expect([
    e.scene_heading.align,
    e.scene_heading.capitalized,
    e.scene_heading.spaceBefore,
    e.scene_heading.keptWithNext,
    e.scene_heading.startingPage,
  ]).toEqual(["center", false, 2, true, false]);
  expect([
    e.character.indent,
    e.character.width,
    e.character.align,
    e.character.capitalized,
  ]).toEqual([0, 60, "center", true]);
  expect([
    e.dialogue.indent,
    e.dialogue.width,
    e.dialogue.split,
    e.parenthetical.indent,
    e.parenthetical.width,
  ]).toEqual([0, 60, "dialogue", 10, 40]);
  for (const k of ["action", "shot", "transition"] as const)
    expect([
      e[k].indent,
      e[k].width,
      e[k].align,
      e[k].capitalized,
      e[k].keptWithNext,
      e[k].split,
      e[k].enclosure,
    ]).toEqual([15, 45, "left", false, false, "action", ["(", ")"]]);
  expect(play.furniture.speechContinued).toBe(true);
});
