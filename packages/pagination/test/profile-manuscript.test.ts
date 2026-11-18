import { expect, test } from "bun:test";
import { profileFor } from "../src/index.ts";

const ms = profileFor("manuscript")!;

test("a manuscript page", () => {
  expect([
    ms.columnCells,
    ms.linesPerPage,
    ms.geometry.marginLeftPt,
    ms.geometry.marginRightPt,
    ms.geometry.marginTopPt,
  ]).toEqual([65, 54, 72, 72, 72]);
  expect([
    profileFor("manuscript", { paper: "a4" })!.columnCells,
    profileFor("manuscript", { paper: "a4" })!.linesPerPage,
  ]).toEqual([65, 58]);
});

test("the manuscript elements", () => {
  const e = ms.elements;
  expect([
    e.body.indent,
    e.body.width,
    e.body.firstLineIndent,
    e.body.spaceBefore,
    e.body.lineSpacing,
    e.body.split,
  ]).toEqual([0, 65, 5, 0, 2, "action"]);
  expect([
    e.chapter.align,
    e.chapter.dropLines,
    e.chapter.startingPage,
    e.chapter.keptWithNext,
    e.chapter.capitalized,
    e.chapter.lineSpacing,
  ]).toEqual(["center", 18, true, true, false, 2]);
  expect([e.break.align, e.break.keptWithNext, e.break.lineSpacing]).toEqual([
    "center",
    true,
    2,
  ]);
  expect([
    e.quote.indent,
    e.quote.width,
    e.quote.firstLineIndent,
    e.quote.split,
  ]).toEqual([5, 55, 0, "action"]);
});

test("a manuscript has no screenplay furniture, whatever is asked", () => {
  const f = profileFor("manuscript", {
    speechContinued: true,
    speakerContinued: true,
    sceneContinued: true,
    scenesNumbered: true,
  })!.furniture;
  expect([
    f.speechContinued,
    f.speakerContinued,
    f.sceneContinued,
    f.scenesNumbered,
    f.breakMark,
  ]).toEqual([false, false, false, false, "#"]);
});
