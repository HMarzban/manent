import { expect, test } from "bun:test";
import {
  LOCK_SOURCES,
  NO_LOCKS,
  comparePageLabels,
  labelsBetween,
  paginate,
  profileFor,
  toLockTable,
} from "../src/index.ts";
import type {
  LayoutBlock,
  LockAnchor,
  LockAnchorRecord,
} from "../src/index.ts";
import { block, filledBlock } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const ten = () =>
  Array.from({ length: 10 }, (_, i) =>
    filledBlock("action", 1, { id: `a${i}` }),
  );
const at = (
  label: string,
  blockId: string,
  extra: Partial<LockAnchor> = {},
): LockAnchor => ({
  label,
  blockId,
  offset: 0,
  quote: null,
  fallbackIds: [],
  source: "lock",
  ...extra,
});
const labels = (blocks: LayoutBlock[], anchors: LockAnchor[], level = 1) =>
  paginate(blocks, sp, { level, anchors }).pages.map((x) => x.label);

const rec = (
  order: number,
  level: number,
  label: string,
  quote = "",
): LockAnchorRecord => ({
  level,
  order,
  label,
  blockId: "a0",
  offset: 0,
  quote,
  fallbackIds: [],
  source: "issue",
});
const anchor = (label: string, quote: string | null): LockAnchor => ({
  label,
  blockId: "a0",
  offset: 0,
  quote,
  fallbackIds: [],
  source: "issue",
});

test("the wire's records become the engine's table", () => {
  expect(
    toLockTable([rec(2, 1, "2"), rec(1, 1, "1", "Rain"), rec(2, 2, "2A")]),
  ).toEqual({
    level: 2,
    anchors: [anchor("1", "Rain"), anchor("2", null), anchor("2A", null)],
  });
  expect([toLockTable([]), LOCK_SOURCES]).toEqual([
    NO_LOCKS,
    ["lock", "issue", "import"],
  ]);
});

test("locked pages start at their anchors and may be short", () => {
  const p = paginate(ten(), sp, {
    level: 1,
    anchors: [at("1", "a0"), at("2", "a3"), at("3", "a6")],
  });
  expect(p.pages.map((x) => [x.label, x.block, x.locked, x.forced])).toEqual([
    ["1", 0, true, true],
    ["2", 3, true, true],
    ["3", 6, true, true],
  ]);
});

test("overflow makes A-pages, a second level AA, and pages before the first lock count from one", () => {
  const tall = [
    filledBlock("action", 120, { id: "a0" }),
    filledBlock("action", 1, { id: "a1" }),
  ];
  expect([
    labels(tall, [at("1", "a0"), at("2", "a1")]),
    labels(tall, [at("12A", "a0"), at("13", "a1")], 2),
    labels(ten(), [at("10", "a5")]),
  ]).toEqual([
    ["1", "1A", "1B", "2"],
    ["12A", "12AA", "12AB", "13"],
    ["1", "10"],
  ]);
});

test("no label is given twice: an overflow before a hard A-page takes a prefix", () => {
  const run = (lines: number, next: string) =>
    labels(
      [
        filledBlock("action", lines, { id: "p12" }),
        filledBlock("action", 10, { id: "x" }),
        filledBlock("action", 1, { id: "p13" }),
      ],
      [at("12", "p12"), at(next, "x"), at("13", "p13")],
      2,
    );
  const cases = [
    run(70, "12A"),
    run(120, "12A"),
    run(70, "A12A"),
    run(70, "12B"),
    // a page added before page 1
    labels(
      [filledBlock("action", 1, { id: "n" }), ...ten()],
      [at("1", "a0"), at("2", "a5")],
    ),
  ];
  expect(cases).toEqual([
    ["12", "A12A", "12A", "13"],
    ["12", "A12A", "B12A", "12A", "13"],
    ["12", "AA12A", "A12A", "13"],
    ["12", "12A", "12B", "13"],
    ["A1", "1", "2"],
  ]);
  for (const l of cases)
    expect([new Set(l).size, l.toSorted(comparePageLabels)]).toEqual([
      l.length,
      l,
    ]);
});

test("the label order and the labels between two pages", () => {
  expect(
    [
      "13",
      "12B",
      "A12A",
      "12",
      "1",
      "12ZA",
      "AA12A",
      "11Z",
      "12A",
      "B12A",
      "A1",
      "12AA",
    ].toSorted(comparePageLabels),
  ).toEqual([
    "A1",
    "1",
    "11Z",
    "12",
    "AA12A",
    "A12A",
    "B12A",
    "12A",
    "12AA",
    "12B",
    "12ZA",
    "13",
  ]);
  const none = new Set<string>();
  expect([
    labelsBetween("12", "12B", 3, none),
    labelsBetween(null, "1", 2, none),
    labelsBetween("12", null, 28, none).slice(-3),
    labelsBetween("B12A", "12A", 1, none),
    labelsBetween("12", "13", 2, new Set(["12A"])),
    labelsBetween(null, null, 3, none),
    labelsBetween("40", "12", 1, none),
    labelsBetween("Z12A", "12A", 1, none),
  ]).toEqual([
    ["12A", "12AA", "12AB"],
    ["A1", "B1"],
    ["12Z", "12ZA", "12ZB"],
    ["C12A"],
    ["12B", "12C"],
    ["1", "2", "3"],
    ["40A"],
    ["Z12AA"],
  ]);
  expect([
    labelsBetween("12", "12C", 2, new Set(["12A", "12B"])),
    labelsBetween("12", "AA12A", 1, none),
    labelsBetween("Y12A", "12A", 2, none),
    labelsBetween(null, "10", 11, none).slice(-3),
  ]).toEqual([
    ["12BA", "12BB"],
    ["AAA12A"],
    ["ZA12A", "ZB12A"],
    ["9", "9A", "9B"],
  ]);
  expect([
    Math.sign(comparePageLabels("012", "12")),
    Math.sign(comparePageLabels("13", "13–14")),
    comparePageLabels("12A", "12A"),
  ]).toEqual([-1, -1, 0]);
});

test("a page with nothing left prints as a range", () => {
  expect([
    labels(ten(), [at("1", "a0"), at("2", "gone"), at("3", "a5")]),
    labels(ten(), [at("1", "a0"), at("2", "gone")]),
    labels(ten(), [at("1", "a0"), at("2", "a3"), at("3", "a3")]),
    labels(ten(), [
      at("1", "a0"),
      at("2", "gone", { fallbackIds: ["nope", "a4"] }),
    ]),
  ]).toEqual([["1", "2–3"], ["1–2"], ["1", "2–3"], ["1", "2"]]);
});

test("an anchor out of page order is ignored", () => {
  const p = paginate(ten(), sp, {
    level: 1,
    anchors: [at("1", "a0"), at("2", "a6"), at("3", "a3"), at("4", "a8")],
  });
  expect(p.pages.map((x) => [x.label, x.block])).toEqual([
    ["1", 0],
    ["2", 6],
    ["4", 8],
  ]);
});

const second = (text: string) =>
  paginate(
    [
      block("action", text, { id: "a0" }),
      filledBlock("action", 1, { id: "a1" }),
    ],
    sp,
    {
      level: 1,
      anchors: [at("1", "a0"), at("2", "a0", { offset: 10, quote: "cccc" })],
    },
  ).pages[1];

test("a page may start inside a block, and follows its quote", () => {
  expect([
    second("aaaa bbbb cccc dddd"),
    second("XX aaaa bbbb cccc dddd"),
    second("aaaa bbbb dddd"),
  ]).toMatchObject([
    { block: 0, line: 1, offset: 10, locked: true, label: "2" },
    { block: 0, line: 1, offset: 13 },
    { block: 1, line: 0 },
  ]);
});

test("a damaged lock table is ignored piece by piece", () => {
  const junk = [
    at("1", "a0"),
    at("2", "a2", { offset: 9999 }),
    at("2", "a2"),
    at("9", "nowhere", { fallbackIds: ["x"] }),
    ...Array.from({ length: 10_000 }, (_, i) => at(String(100 + i), "a7")),
  ];
  expect(
    paginate(ten(), sp, { level: 1, anchors: junk }).pages.map((x) => [
      x.label,
      x.block,
    ]),
  ).toEqual([
    ["1", 0],
    ["2", 3],
    ["9–10099", 7],
  ]);
  // only the run that never goes backwards holds
  expect(
    paginate(ten(), sp, { level: 1, anchors: junk.toReversed() }).pages.map(
      (x) => x.block,
    ),
  ).toEqual([0, 7]);
  // one label never starts two pages
  expect(labels(ten(), [at("1", "a0"), at("2", "a3"), at("2", "a6")])).toEqual([
    "1",
    "2",
  ]);
});

test("labels are found between any two pages, whatever their labels read", () => {
  const none = new Set<string>();
  expect([
    labelsBetween(null, "13–14", 3, none),
    labelsBetween("012", "12", 1, none),
    labelsBetween("Z12", "12A", 2, none),
  ]).toEqual([["1", "2", "3"], ["012A"], ["Z12A", "Z12AB"]]);
});
