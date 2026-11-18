import { expect, test } from "bun:test";
import { paginate, profileFor } from "../src/index.ts";
import type { Pagination } from "../src/index.ts";
import { block, cueBlock, filledBlock } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const starts = (p: Pagination) => p.pages.map((x) => [x.block, x.line]);
const A = (n: number) => filledBlock("action", n);
const run = (l: number, r: number) => [
  cueBlock("MARA", { dual: "left" }),
  filledBlock("dialogue", l, { dual: "left" }),
  cueBlock("COLE", { dual: "right" }),
  filledBlock("dialogue", r, { dual: "right" }),
];

test("a dual run is as tall as its taller column, and a short one is never split", () => {
  expect(paginate([A(10), ...run(6, 9)], sp).pages[0]!.usedUnits).toBe(
    20 + 2 + 20,
  );
  expect(starts(paginate([A(50), ...run(6, 9)], sp))).toEqual([
    [0, 0],
    [1, 0],
  ]);
});

test("a run taller than half a page splits both columns at one row", () => {
  const p = paginate([A(40), ...run(40, 40)], sp);
  expect([p.pages[0]!.more, p.pages[0]!.usedUnits]).toEqual([true, 108]);
  expect(p.pages[1]).toMatchObject({
    block: 2,
    line: 11,
    offset: 308,
    right: { block: 4, line: 11, offset: 308 },
    contd: "MARA",
    contdRight: "COLE",
    topUnits: 2,
  });
  // a finished column does not resume
  expect(paginate([A(40), ...run(40, 3)], sp).pages[1]).toMatchObject({
    block: 2,
    line: 11,
    right: null,
    contdRight: null,
  });
});

test("a right column with no left column is ordinary dialogue", () => {
  expect(
    paginate(
      [
        cueBlock("COLE", { dual: "right" }),
        filledBlock("dialogue", 2, { dual: "right" }),
      ],
      sp,
    ).pages[0]!.usedUnits,
  ).toBe(6);
});

test("a scene heading is never left alone above a tall run whose columns share no cut row", () => {
  const p = paginate(
    [
      block("scene_heading", "INT. HALL - NIGHT"),
      cueBlock("MARA", { dual: "left" }),
      block("parenthetical", "beat", { dual: "left" }),
      filledBlock("dialogue", 30, { dual: "left" }),
      cueBlock("COLE", { dual: "right" }),
      filledBlock("dialogue", 30, { dual: "right" }),
    ],
    profileFor("multicam")!,
  );
  expect(
    p.pages.map((x) => [x.block, x.line, x.right, x.more, x.usedUnits]),
  ).toEqual([
    [0, 0, null, true, 108],
    [3, 24, { block: 5, line: 25, offset: 700 }, false, 26],
  ]);
});

test("a tall run moves whole when not one line of it fits below kept blocks", () => {
  const p = paginate(
    [filledBlock("shot", 52), ...run(30, 30)],
    profileFor("multicam")!,
  );
  expect(p.pages.map((x) => [x.block, x.line, x.more, x.usedUnits])).toEqual([
    [0, 0, false, 104],
    [1, 0, true, 108],
    [2, 26, false, 18],
  ]);
});
