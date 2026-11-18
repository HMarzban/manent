import { expect, test } from "bun:test";
import {
  breaksIn,
  fillUnits,
  flowUnits,
  layoutPage,
  lineStartsOf,
  pageOf,
  pageStarts,
  paginate,
  profileFor,
  toLayoutBlock,
} from "../src/index.ts";
import type { Pagination, PositionedLine } from "../src/index.ts";
import {
  block,
  cueBlock,
  filledBlock,
  generateBlocks,
  layoutBlocksOf,
  viewOf,
} from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const ms = profileFor("manuscript")!;
const play = profileFor("stage_play")!;
const A = (n: number) => filledBlock("action", n);
const corpus = () => layoutBlocksOf(generateBlocks("screenplay", 3000, 1));
const run = (l: number, r: number) => [
  cueBlock("MARA", { dual: "left" }),
  filledBlock("dialogue", l, { dual: "left" }),
  cueBlock("COLE", { dual: "right" }),
  filledBlock("dialogue", r, { dual: "right" }),
];
const text = (p: Pagination, k: number) =>
  layoutPage(p, k).lines.filter((l) => l.kind === "text");
const said = (l: PositionedLine) => l.runs.map((r) => r.text).join("");

test("lines sit on the grid the profile gives", () => {
  const p = paginate(
    [
      block("scene_heading", "int. kitchen - night"),
      cueBlock("jane"),
      filledBlock("dialogue", 2),
      block("transition", "cut to:"),
    ],
    sp,
  );
  expect(text(p, 0).map((l) => [l.x, l.y, l.cells, l.blockLine])).toEqual([
    [0, 0, 20, 0],
    [22, 4, 4, 0],
    [10, 6, 35, 0],
    [10, 8, 35, 1],
    [53, 12, 7, 0],
  ]);
  expect([text(p, 0)[0]!.runs, said(text(p, 0)[4]!)]).toEqual([
    [{ text: "INT. KITCHEN - NIGHT", style: 0 }],
    "CUT TO:",
  ]);
});

test("runs are cut where the style changes, and a stage direction wears its parentheses", () => {
  expect(
    text(
      paginate(
        [
          toLayoutBlock(
            viewOf(
              { type: "action" },
              ["Rain "],
              ["hard", "bold"],
              [" tonight"],
            ),
          ),
        ],
        sp,
      ),
      0,
    )[0]!.runs,
  ).toEqual([
    { text: "Rain ", style: 0 },
    { text: "hard", style: 1 },
    { text: " tonight", style: 0 },
  ]);
  expect(
    text(paginate([block("action", "She exits.")], play), 0).map((l) => [
      l.x,
      l.cells,
      said(l),
    ]),
  ).toEqual([[15, 12, "(She exits.)"]]);
  expect(
    text(
      paginate(
        [block("body", "One."), block("break", ""), block("body", "Two.")],
        ms,
      ),
      0,
    ).map((l) => [l.x, l.y, said(l)]),
  ).toEqual([
    [5, 1, "One."],
    [32, 5, "#"],
    [5, 9, "Two."],
  ]);
});

test("furniture is placed, and is not text", () => {
  const p = paginate([A(49), cueBlock("JANE"), filledBlock("dialogue", 4)], sp);
  const all = (k: number) =>
    layoutPage(p, k).lines.map((l) => [l.kind, l.x, l.y, said(l)]);
  expect([all(0).at(-1), all(1).slice(0, 2)]).toEqual([
    ["more", 22, 106, "(MORE)"],
    [
      ["page_number", 58, -6, "2."],
      ["contd", 22, 0, "JANE (CONT'D)"],
    ],
  ]);
  expect(pageStarts(p)).toEqual([
    { label: null, firstLine: "x".repeat(59) + "." },
    { label: "2", firstLine: "JANE (CONT'D)" },
  ]);
});

test("a double-spaced line sits in the middle of its two lines, and dual columns share rows", () => {
  expect(
    text(
      paginate(
        [cueBlock("MARA"), filledBlock("dialogue", 2)],
        profileFor("multicam")!,
      ),
      0,
    ).map((l) => l.y),
  ).toEqual([0, 3, 7]);
  expect(text(paginate(run(1, 1), sp), 0).map((l) => [l.x, l.y])).toEqual([
    [8, 0],
    [40, 0],
    [0, 2],
    [32, 2],
  ]);
});

test("every line of the script is on exactly one page, in order, and the scroll is as tall as its pages", () => {
  const p = paginate(corpus(), sp);
  const n = p.blocks.length;
  const seen: string[] = [];
  for (let k = 0; k < p.pages.length; k++)
    for (const l of text(p, k)) seen.push(`${l.blockId}:${l.blockLine}`);
  expect(seen).toEqual(
    p.blocks.flatMap((b, i) =>
      Array.from(lineStartsOf(p, i), (_, line) => `${b.id}:${line}`),
    ),
  );
  expect([
    flowUnits(p, 0, n) + fillUnits(p, p.pages.length - 1),
    flowUnits(p, 0, 1200) + flowUnits(p, 1200, n),
    breaksIn(p, 0, n),
  ]).toEqual([p.pages.length * 108, flowUnits(p, 0, n), p.pages.length - 1]);
  expect(
    [0, 5, p.pages.length - 1].map((k) =>
      pageOf(p, p.pages[k]!.block, p.pages[k]!.offset),
    ),
  ).toEqual([0, 5, p.pages.length - 1]);
});
