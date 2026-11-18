import { expect, test } from "bun:test";
import { pageSizePx, profileFor, specKey } from "../src/index.ts";
import type { PageProfile, SpecKey } from "../src/index.ts";

const sp = profileFor("screenplay")!;
const row = (p: PageProfile, k: SpecKey) => {
  const e = p.elements[k];
  return [
    e.indent,
    e.width,
    e.align,
    e.spaceBefore,
    e.capitalized,
    e.keptWithNext,
    e.split,
  ];
};

test("US Letter: 54 lines, a 60-cell column, the published margins", () => {
  expect([
    sp.linesPerPage,
    sp.columnCells,
    sp.engineVersion,
    sp.format,
    sp.paper,
  ]).toEqual([54, 60, 1, "screenplay", "letter"]);
  expect(sp.geometry).toEqual({
    widthPt: 612,
    heightPt: 792,
    marginLeftPt: 108,
    marginTopPt: 72,
    marginRightPt: 72,
    marginBottomPt: 72,
    pageNumberTopPt: 36,
  });
  expect(pageSizePx(sp)).toEqual({ width: 816, height: 1056 });
});

test("A4 keeps the column and every element, and changes the page", () => {
  const a4 = profileFor("screenplay", { paper: "a4" })!;
  expect([
    a4.linesPerPage,
    a4.columnCells,
    a4.geometry.widthPt,
    a4.geometry.heightPt,
    a4.geometry.marginLeftPt,
  ]).toEqual([58, 60, 595.28, 841.89, 108]);
  expect(
    [a4.geometry.marginRightPt, a4.geometry.marginBottomPt].map(
      (n) => Math.round(n * 100) / 100,
    ),
  ).toEqual([55.28, 73.89]);
  expect(a4.elements).toEqual(sp.elements);
});

test("the screenplay elements", () => {
  expect(
    (
      [
        "scene_heading",
        "action",
        "shot",
        "character",
        "parenthetical",
        "dialogue",
        "transition",
        "general",
        "act_break.new_act",
        "act_break.end_of_act",
      ] as const
    ).map((k) => row(sp, k)),
  ).toEqual([
    [0, 60, "left", 1, true, true, "never"],
    [0, 60, "left", 1, false, false, "action"],
    [0, 60, "left", 1, true, true, "never"],
    [22, 38, "left", 1, true, true, "never"],
    [16, 25, "left", 0, false, true, "never"],
    [10, 35, "left", 0, false, false, "dialogue"],
    [0, 60, "right", 1, true, false, "never"],
    [0, 60, "left", 1, false, false, "action"],
    [0, 60, "center", 1, true, true, "never"],
    [0, 60, "center", 1, true, false, "never"],
  ]);
  const a = sp.elements.action;
  expect([
    a.firstLineIndent,
    a.dropLines,
    a.lineSpacing,
    a.startingPage,
    a.printed,
    a.enclosure,
  ]).toEqual([0, 0, 1, false, true, null]);
  expect([sp.elements.group.printed, sp.elements.page_break.printed]).toEqual([
    false,
    false,
  ]);
  expect(sp.rules).toEqual({
    minLines: 2,
    actionNoSplitBelow: 4,
    dualSplitAbove: 0.5,
  });
  expect(sp.furniture).toEqual({
    speechContinued: true,
    speakerContinued: true,
    sceneContinued: false,
    scenesNumbered: false,
    scenesLettered: false,
    moreText: "(MORE)",
    contdText: " (CONT'D)",
    continuedTopText: "CONTINUED:",
    continuedFootText: "(CONTINUED)",
    breakMark: "#",
  });
  expect([sp.dual, sp.dualRightOffset]).toEqual([
    {
      character: { indent: 8, width: 20 },
      parenthetical: { indent: 4, width: 20 },
      dialogue: { indent: 0, width: 28 },
    },
    32,
  ]);
});

test("every profile lays out every element, and the formats that only relabel share the screenplay's layout", () => {
  expect(Object.keys(sp.elements).toSorted()).toEqual([
    "act_break.end_of_act",
    "act_break.new_act",
    "act_break.tag",
    "act_break.teaser",
    "action",
    "body",
    "bracket",
    "break",
    "camera",
    "chapter",
    "character",
    "dialogue",
    "emote",
    "engine",
    "general",
    "group",
    "page_break",
    "parenthetical",
    "quote",
    "scene_heading",
    "shot",
    "slug",
    "transition",
  ]);
  expect([
    specKey("act_break", "tag"),
    specKey("act_break", null),
    specKey("ink_line", null),
    specKey("future_thing", null),
  ]).toEqual(["act_break.tag", "act_break.new_act", "general", "general"]);
  for (const f of ["animation", "variety", "game", "a_format_from_next_year"])
    expect(profileFor(f)!.elements).toEqual(sp.elements);
  expect([
    row(sp, "slug"),
    row(sp, "bracket"),
    row(sp, "emote"),
    row(sp, "camera"),
    row(sp, "engine"),
  ]).toEqual([
    row(sp, "scene_heading"),
    row(sp, "action"),
    row(sp, "parenthetical"),
    row(sp, "shot"),
    row(sp, "action"),
  ]);
  expect(profileFor("ink")).toBeNull();
});

test("multi-camera", () => {
  const m = profileFor("multicam")!;
  expect([
    m.elements.dialogue.lineSpacing,
    m.elements.action.capitalized,
    m.elements.scene_heading.startingPage,
    m.elements["act_break.new_act"].startingPage,
    m.furniture.scenesLettered,
    m.furniture.scenesNumbered,
  ]).toEqual([2, true, true, true, true, true]);
  const off = profileFor("multicam", {
    multicam: {
      dialogueDoubleSpaced: false,
      sceneStartingPage: false,
      scenesLettered: false,
    },
  })!;
  expect([
    off.elements.dialogue.lineSpacing,
    off.elements.scene_heading.startingPage,
    off.furniture.scenesLettered,
  ]).toEqual([1, false, false]);
});

test("options change the profile, and the key tells two layouts apart", () => {
  expect(profileFor("screenplay")!.key).toBe(sp.key);
  expect(profileFor("screenplay", { paper: "a4" })!.key).not.toBe(sp.key);
  expect(
    profileFor("screenplay", { sceneHeadingSpaceBefore: 2 })!.elements
      .scene_heading.spaceBefore,
  ).toBe(2);
  expect(
    profileFor("screenplay", { elements: { dialogue: { width: 30 } } })!
      .elements.dialogue.width,
  ).toBe(30);
  expect(
    [3, 500].map(
      (n) => profileFor("screenplay", { linesPerPage: n })!.linesPerPage,
    ),
  ).toEqual([10, 60]);
});
