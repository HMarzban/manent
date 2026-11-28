import { expect, test } from "bun:test";
import { paginate, profileFor } from "../src/index.ts";

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

test("manuscript single line spacing overrides chapter, body, break and quote while leaving default double-spaced", () => {
  const single = profileFor("manuscript", { manuscriptLineSpacing: 1 })!;
  expect([
    single.elements.chapter.lineSpacing,
    single.elements.body.lineSpacing,
    single.elements.break.lineSpacing,
    single.elements.quote.lineSpacing,
  ]).toEqual([1, 1, 1, 1]);
  expect(ms.elements.body.lineSpacing).toBe(2);
});

const makeOpeningBlock = (
  text: string,
  firstLine?: "flush" | "drop_cap" | "raised_cap",
) => ({
  id: "b1",
  type: "body",
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
  ...(firstLine === undefined ? {} : { firstLine }),
});

test("manuscript body opening styles (flush, drop_cap, raised_cap) are measured accurately without drift", () => {
  // 63 chars wraps to 2 lines with default 5-cell indent (60 cells), but fits on 1 line when flush (65 cells).
  const line63 = "a".repeat(63);
  expect(paginate([makeOpeningBlock(line63)], ms).metrics[0]!.lines).toBe(2);
  expect(
    paginate([makeOpeningBlock(line63, "flush")], ms).metrics[0]!.lines,
  ).toBe(1);
  // Short drop_cap paragraph reserves at least 2 lines to match its floated initial height.
  expect(
    paginate([makeOpeningBlock("Short opener.", "drop_cap")], ms).metrics[0]!
      .lines,
  ).toBe(2);
  // Raised cap adds 1 extra cell on line 0 (2em initial, flush left): 64 chars fits on 1 line, 65 wraps to 2.
  expect(
    paginate([makeOpeningBlock("a".repeat(64), "raised_cap")], ms).metrics[0]!
      .lines,
  ).toBe(1);
  expect(
    paginate([makeOpeningBlock("a".repeat(65), "raised_cap")], ms).metrics[0]!
      .lines,
  ).toBe(2);
});
