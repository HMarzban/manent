import { expect, test } from "bun:test";
import { paginate, profileFor } from "../src/index.ts";
import type { Pagination } from "../src/index.ts";
import {
  block,
  cueBlock,
  filledBlock,
  unbrokenBlock,
} from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const ms = profileFor("manuscript")!;
const starts = (p: Pagination) => p.pages.map((x) => [x.block, x.line]);
const A = (n: number) => filledBlock("action", n);
const brk = () => filledBlock("page_break", 0);

test("a page holds 54 lines", () => {
  const p = paginate([A(54), A(1)], sp);
  expect([
    starts(p),
    p.pages[0]!.usedUnits,
    p.pages[0]!.label,
    p.pages[1]!.label,
  ]).toEqual([
    [
      [0, 0],
      [1, 0],
    ],
    108,
    "1",
    "2",
  ]);
  // 1 + 26 × 2 = 53 lines, then no room for 2
  const many = paginate(
    Array.from({ length: 28 }, () => A(1)),
    sp,
  );
  expect([starts(many), many.pages[0]!.readAhead]).toEqual([
    [
      [0, 0],
      [27, 0],
    ],
    27,
  ]);
});

test("a page never ends on a heading or a cue, and a cue keeps two lines of its dialogue", () => {
  expect(
    starts(paginate([A(52), filledBlock("scene_heading", 1), A(1)], sp)),
  ).toEqual([
    [0, 0],
    [1, 0],
  ]);
  expect(
    starts(paginate([A(50), cueBlock("JANE"), filledBlock("dialogue", 3)], sp)),
  ).toEqual([
    [0, 0],
    [1, 0],
  ]);
});

test("dialogue splits at a sentence end, with a line for (MORE) and one for the cue", () => {
  const blocks = [A(49), cueBlock("jane"), filledBlock("dialogue", 4)];
  const p = paginate(blocks, sp);
  expect([p.pages[0]!.more, p.pages[0]!.usedUnits]).toEqual([true, 108]);
  expect(p.pages[1]).toMatchObject({
    block: 2,
    line: 2,
    offset: 70,
    contd: "JANE",
    topUnits: 2,
    forced: false,
  });
  expect(
    paginate(blocks, profileFor("screenplay", { speechContinued: false })!)
      .pages[1],
  ).toMatchObject({ block: 2, line: 2, contd: null, topUnits: 0 });
  // no sentence end: the speech moves whole
  expect(
    starts(
      paginate([A(49), cueBlock("JANE"), unbrokenBlock("dialogue", 4)], sp),
    ),
  ).toEqual([
    [0, 0],
    [1, 0],
  ]);
});

test("action is not split under four lines, and then keeps two lines each side", () => {
  // a sentence end is preferred, not required
  expect([
    starts(paginate([A(51), A(3)], sp)),
    starts(paginate([A(50), A(4)], sp)),
    starts(paginate([A(50), unbrokenBlock("action", 4)], sp)),
  ]).toEqual([
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0, 0],
      [1, 2],
    ],
    [
      [0, 0],
      [1, 2],
    ],
  ]);
});

test("a transition never starts a page", () => {
  expect(starts(paginate([A(53), filledBlock("transition", 1)], sp))).toEqual([
    [0, 0],
    [0, 51],
  ]);
});

test("a forced break always starts a page and never makes an empty one", () => {
  const p = paginate([A(1), brk(), A(1)], sp);
  expect([starts(p), p.pages[1]!.forced]).toEqual([
    [
      [0, 0],
      [2, 0],
    ],
    true,
  ]);
  expect([
    starts(paginate([brk(), A(1)], sp)),
    starts(paginate([A(1), brk(), brk(), A(1)], sp)),
  ]).toEqual([
    [[1, 0]],
    [
      [0, 0],
      [3, 0],
    ],
  ]);
});

test("a chapter starts a page, at its drop", () => {
  // the body is 4 double-spaced lines
  const p = paginate(
    [
      block("body", "x".repeat(60)),
      block("chapter", "Chapter 2"),
      block("body", "x".repeat(250)),
    ],
    ms,
  );
  expect([starts(p), p.pages[1]!.forced, p.pages[1]!.usedUnits]).toEqual([
    [
      [0, 0],
      [1, 0],
    ],
    true,
    36 + 4 + 16,
  ]);
});

test("a block taller than a page is cut so every page places a line", () => {
  expect(starts(paginate([filledBlock("scene_heading", 60)], sp))).toEqual([
    [0, 0],
    [0, 54],
  ]);
});

test("the shortest page with the largest drop still moves on", () => {
  // cap 20, a drop of 4 lines at most
  const short = profileFor("manuscript", { linesPerPage: 10 })!;
  const p = paginate(
    [
      block("chapter", "Chapter 1"),
      block("body", "x".repeat(1950)),
      block("chapter", "Chapter 2"),
      block("chapter", "Chapter 3"),
      block("body", "x".repeat(400)),
    ],
    short,
  );
  expect(p.pages.filter((x) => x.usedUnits === 0 || x.usedUnits > 20)).toEqual(
    [],
  );
});

test("a 12,000-line block paginates", () => {
  const p = paginate([unbrokenBlock("action", 12_000)], sp);
  expect([
    p.pages.length,
    p.pages.filter((x) => x.usedUnits === 0 || x.usedUnits > 108),
  ]).toEqual([223, []]);
});

test("nothing printable is one empty page", () => {
  const empty = {
    index: 0,
    label: "1",
    block: 0,
    line: 0,
    offset: 0,
    usedUnits: 0,
    more: false,
    contd: null,
  };
  expect(paginate([], sp).pages).toMatchObject([empty]);
  expect(
    paginate([block("group", "Notes"), filledBlock("page_break", 0)], sp).pages,
  ).toMatchObject([empty]);
});

test("a keep-chain longer than a page is released from the bottom, and a heading is never left alone", () => {
  expect(
    starts(
      paginate(
        [
          ...Array.from({ length: 70 }, () => cueBlock("MARA")),
          filledBlock("dialogue", 1),
        ],
        sp,
      ),
    ),
  ).toEqual([
    [0, 0],
    [27, 0],
    [54, 0],
  ]);
  expect(
    starts(
      paginate(
        [A(50), filledBlock("scene_heading", 1), filledBlock("shot", 60)],
        sp,
      ),
    ),
  ).toEqual([
    [0, 0],
    [1, 0],
    [2, 52],
  ]);
});

test("double spacing counts two lines a line", () => {
  const m = profileFor("multicam")!;
  const used = (n: number) =>
    paginate([cueBlock("MARA"), unbrokenBlock("dialogue", n)], m).pages.map(
      (x) => x.usedUnits,
    );
  // 27 lines: 26 and (MORE) after the cue, one carried over under its cue
  expect([used(10), used(26), used(27)]).toEqual([[42], [106], [108, 6]]);
});
