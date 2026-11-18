import { expect, test } from "bun:test";
import {
  applyLayoutPatches,
  contdSuffix,
  letters,
  pageNumberText,
  paginate,
  profileFor,
  sceneNumber,
} from "../src/index.ts";
import type { LayoutBlock, Pagination } from "../src/index.ts";
import { block, cueBlock, filledBlock } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const starts = (p: Pagination) => p.pages.map((x) => [x.block, x.line]);
const A = (n: number) => filledBlock("action", n);
const D = (n: number) => filledBlock("dialogue", n);
const last = (blocks: LayoutBlock[], profile = sp) =>
  contdSuffix(paginate(blocks, profile), blocks.length - 2);

test("the same speaker is continued, within a scene, unless the cue says no", () => {
  expect([
    last([cueBlock("JANE"), D(1), A(1), cueBlock("Jane (V.O.)"), D(1)]),
    last([cueBlock("JANE"), D(1), cueBlock("SAM"), D(1)]),
    last([
      cueBlock("JANE"),
      D(1),
      filledBlock("scene_heading", 1),
      cueBlock("JANE"),
      D(1),
    ]),
    last([cueBlock("JANE"), D(1), cueBlock("JANE (CONT'D)"), D(1)]),
    last([cueBlock("JANE"), D(1), cueBlock("JANE", { noContd: true }), D(1)]),
    last(
      [cueBlock("JANE"), D(1), cueBlock("JANE"), D(1)],
      profileFor("screenplay", { speakerContinued: false })!,
    ),
  ]).toEqual([true, false, false, false, false, false]);
});

test("the suffix is wrapped with the cue", () => {
  // 30 + 9 cells is more than the cue's 38
  const long = "A".repeat(30);
  expect(
    paginate([cueBlock(long), D(1), cueBlock(long), D(1)], sp).pages[0]!
      .usedUnits,
  ).toBe(2 + 2 + 2 + 4 + 2);
});

test("a speech that carries over between two of its blocks gets (MORE) and repeats the cue", () => {
  // the line for (MORE) is kept under the first dialogue
  const p = paginate(
    [A(49), cueBlock("JANE"), D(2), filledBlock("parenthetical", 1), D(2)],
    sp,
  );
  expect([p.pages[0]!.more, p.pages[0]!.usedUnits, p.pages[1]]).toMatchObject([
    true,
    108,
    { block: 3, line: 0, contd: "JANE", topUnits: 2 },
  ]);
  // no room for the dialogue and its (MORE): the speech moves whole
  const tight = paginate(
    [A(50), cueBlock("JANE"), D(2), filledBlock("parenthetical", 1), D(2)],
    sp,
  );
  expect(starts(tight)).toEqual([
    [0, 0],
    [1, 0],
  ]);
  // a break the writer forced inside a speech is marked the same way
  const forced = paginate(
    [cueBlock("JANE"), D(2), filledBlock("page_break", 0), D(2)],
    sp,
  );
  expect([forced.pages[0]!.more, forced.pages[1]!.contd]).toEqual([
    true,
    "JANE",
  ]);
  // one speech across four pages
  const long = paginate([A(49), cueBlock("JANE"), D(120)], sp);
  expect(
    long.pages.map((x) => [x.block, x.line, x.usedUnits, x.more, x.contd]),
  ).toEqual([
    [0, 0, 108, true, null],
    [2, 2, 108, true, "JANE"],
    [2, 54, 108, true, "JANE"],
    [2, 106, 30, false, "JANE"],
  ]);
});

test("a page inside a scene is marked CONTINUED", () => {
  const on = profileFor("screenplay", { sceneContinued: true })!;
  expect(
    paginate([filledBlock("scene_heading", 1), A(30), A(30)], on).pages[1],
  ).toMatchObject({
    block: 2,
    line: 21,
    sceneContinued: true,
    topUnits: 4,
    contd: null,
  });
  expect(
    paginate([A(53), filledBlock("scene_heading", 1), A(1)], on).pages[1]!
      .sceneContinued,
  ).toBe(false);
});

test("scene numbers count headings unless one is stored, and page numbers carry a period", () => {
  const p = paginate(
    [
      filledBlock("scene_heading", 1),
      A(1),
      filledBlock("scene_heading", 1, { num: "12A" }),
      block("slug", "COLD OPEN"),
    ],
    sp,
  );
  expect([0, 1, 2, 3].map((i) => sceneNumber(p, i))).toEqual([
    "1",
    null,
    "12A",
    "3",
  ]);
  const patched = applyLayoutPatches(p.blocks, {
    key: "k",
    patches: new Map([[p.blocks[0]!.id, { num: "2A" }]]),
  });
  // a patched number is the number the page shows
  expect(sceneNumber(paginate(patched, sp), 0)).toBe("2A");
  const m = paginate(
    [filledBlock("scene_heading", 1), filledBlock("scene_heading", 1)],
    profileFor("multicam", { multicam: { sceneStartingPage: false } })!,
  );
  expect([
    sceneNumber(m, 0),
    sceneNumber(m, 1),
    letters(26),
    letters(27),
    letters(28),
  ]).toEqual(["A", "B", "Z", "AA", "AB"]);
  const two = paginate([A(54), A(1)], sp);
  expect([
    pageNumberText(two.pages[0]!),
    pageNumberText(two.pages[1]!),
  ]).toEqual([null, "2."]);
});

test("scene letters count from one", () => {
  expect(() => letters(0)).toThrow(RangeError);
  expect(() => letters(1.5)).toThrow(RangeError);
});
