import { expect, test } from "bun:test";
import { engineFor } from "@manent/pagination";
import type { LayoutBlock, LockAnchorRecord } from "@manent/pagination";
import { block, filledBlock } from "@manent/pagination/testing";
import {
  captureAnchors,
  fragmentRuns,
  lockedPagination,
  mergeAnchors,
  nextLabel,
} from "../src/index.ts";
import type { LockedLayout } from "../src/index.ts";

const v1 = engineFor(1)!;
const sp = v1.profileFor("screenplay")!;
const ten = () =>
  Array.from({ length: 10 }, (_, i) =>
    filledBlock("action", 1, { id: `a${i}` }),
  );
const labels = (l: LockedLayout) => l.pagination.pages.map((x) => x.label);
const rec = (
  label: string,
  blockId: string,
  extra: Partial<LockAnchorRecord> = {},
): Omit<LockAnchorRecord, "order"> => ({
  level: 1,
  label,
  blockId,
  offset: 0,
  quote: "",
  fallbackIds: [],
  source: "lock",
  ...extra,
});
// Each record's order is its place in the list.
const inOrder = (
  records: readonly Omit<LockAnchorRecord, "order">[],
): LockAnchorRecord[] => records.map((r, i) => ({ ...r, order: i + 1 }));
const locked = (blocks: readonly LayoutBlock[], records: LockAnchorRecord[]) =>
  lockedPagination(blocks, sp, records, v1);

// 12, an issued A12A of 50 lines, a hard 12A, 13; page 12 holds `lines` lines.
const prefixedScript = (lines: number) => [
  filledBlock("action", lines, { id: "p12" }),
  filledBlock("action", 50, { id: "y" }),
  filledBlock("action", 5, { id: "x" }),
  filledBlock("action", 1, { id: "p13" }),
];
// 40, issued 40A, 40B and 40C of `first`, 6 and 4 lines, 41.
const fragmentScript = (first: number) => [
  filledBlock("action", 50, { id: "p40" }),
  filledBlock("action", first, { id: "a" }),
  filledBlock("action", 6, { id: "b" }),
  filledBlock("action", 4, { id: "c" }),
  filledBlock("action", 1, { id: "p41" }),
];

test("locking records every page's start, its quote and its fallbacks", () => {
  const blocks = [
    ...ten(),
    filledBlock("page_break", 0),
    filledBlock("action", 60, { id: "big" }),
  ];
  const p = v1.paginate(blocks, sp);
  const r = captureAnchors(p, "every_page", 1, "lock");
  expect(
    r.map((x) => [
      x.order,
      x.label,
      x.blockId,
      x.offset,
      x.source,
      x.fallbackIds.length,
    ]),
  ).toEqual([
    [1, "1", "a0", 0, "lock", 8],
    [2, "2", "big", 0, "lock", 0],
    [3, "3", "big", expect.any(Number), "lock", 0],
  ]);
  expect(r[0]!.quote).toBe(blocks[0]!.text.slice(0, 24));
});

test("a quote never ends inside a surrogate pair", () => {
  const text = `${"x".repeat(23)}👨 waits by the door.`;
  const p = v1.paginate([block("action", text, { id: "e" })], sp);
  expect(captureAnchors(p, "every_page", 1, "lock")[0]!.quote).toBe(
    "x".repeat(23),
  );
});

test("an issued A-page absorbs its parent's overflow and comes back when it fits", () => {
  const base = [
    filledBlock("action", 50, { id: "p12" }),
    filledBlock("action", 50, { id: "x" }),
    filledBlock("action", 5, { id: "p13" }),
  ];
  const records = inOrder([
    rec("12", "p12"),
    rec("12A", "x", { source: "issue" }),
    rec("13", "p13"),
  ]);
  expect(labels(locked(base, records))).toEqual(["12", "12A", "13"]);
  const grown = base.with(0, filledBlock("action", 70, { id: "p12" }));
  expect(labels(locked(grown, records))).toEqual(["12", "12A", "12B", "13"]);
  expect(locked(grown, records).dropped).toEqual(["12A"]);
  const shrunk = base.with(0, filledBlock("action", 20, { id: "p12" }));
  expect(labels(locked(shrunk, records))).toEqual(["12", "12A", "13"]);
});

test("Lock A-pages holds an A-page's start and its overflow takes a second letter", () => {
  const r = inOrder([
    rec("12", "p12"),
    rec("12A", "x", { level: 2 }),
    rec("13", "p13"),
  ]);
  const blocks = [
    filledBlock("action", 50, { id: "p12" }),
    filledBlock("action", 70, { id: "x" }),
    filledBlock("action", 1, { id: "p13" }),
  ];
  expect(labels(locked(blocks, r))).toEqual(["12", "12A", "12AA", "13"]);
});

test("under Lock A-pages a parent's overflow before a hard 12A takes a prefix, never a second 12A", () => {
  const r = inOrder([
    rec("12", "p12"),
    rec("12A", "x", { level: 2 }),
    rec("13", "p13"),
  ]);
  const l = locked(
    [
      filledBlock("action", 130, { id: "p12" }),
      filledBlock("action", 5, { id: "x" }),
      filledBlock("action", 1, { id: "p13" }),
    ],
    r,
  );
  expect([labels(l), l.dropped]).toEqual([
    ["12", "A12A", "B12A", "12A", "13"],
    [],
  ]);
});

test("an issued prefixed A-page absorbs its parent's overflow one level down", () => {
  const r = inOrder([
    rec("12", "p12"),
    rec("A12A", "y", { source: "issue" }),
    rec("12A", "x", { level: 2 }),
    rec("13", "p13"),
  ]);
  expect(labels(locked(prefixedScript(50), r))).toEqual([
    "12",
    "A12A",
    "12A",
    "13",
  ]);
  const grown = locked(prefixedScript(70), r);
  expect([labels(grown), grown.dropped]).toEqual([
    ["12", "A12A", "B12A", "12A", "13"],
    ["A12A"],
  ]);
});

test("pages added before locked page 1 are A1 and B1", () => {
  const r = inOrder([rec("1", "p1"), rec("2", "p2")]);
  const blocks = [
    filledBlock("action", 100, { id: "new" }),
    filledBlock("action", 5, { id: "p1" }),
    filledBlock("action", 5, { id: "p2" }),
  ];
  expect(labels(locked(blocks, r))).toEqual(["A1", "B1", "1", "2"]);
});

test("issuing records the A-pages it finds, in page order", () => {
  const current = inOrder([
    rec("17", "p17"),
    rec("18", "p18"),
    rec("21", "p21"),
    rec("22", "p22"),
  ]);
  const blocks = [
    filledBlock("action", 70, { id: "p17" }),
    filledBlock("action", 5, { id: "p18" }),
    filledBlock("action", 130, { id: "p21" }),
    filledBlock("action", 5, { id: "p22" }),
  ];
  const p = locked(blocks, current).pagination;
  const added = captureAnchors(p, "derived_pages", 1, "issue");
  expect(added.map((x) => [x.order, x.label, x.blockId, x.source])).toEqual([
    [1, "17A", "p17", "issue"],
    [2, "21A", "p21", "issue"],
    [3, "21B", "p21", "issue"],
  ]);
  expect(
    mergeAnchors(current, added, p).map((x) => [x.order, x.label, x.source]),
  ).toEqual([
    [1, "17", "lock"],
    [2, "17A", "issue"],
    [3, "18", "lock"],
    [4, "21", "lock"],
    [5, "21A", "issue"],
    [6, "21B", "issue"],
    [7, "22", "lock"],
  ]);
});

test("issuing after an A-page absorbed its parent's overflow records the page that took its label", () => {
  const current = inOrder([
    rec("12", "p12"),
    rec("12A", "x", { source: "issue" }),
    rec("13", "p13"),
  ]);
  const blocks = [
    filledBlock("action", 70, { id: "p12" }),
    filledBlock("action", 50, { id: "x" }),
    filledBlock("action", 5, { id: "p13" }),
  ];
  const p = locked(blocks, current).pagination;
  const added = captureAnchors(p, "derived_pages", 1, "issue");
  expect(
    mergeAnchors(current, added, p).map((x) => [
      x.order,
      x.label,
      x.blockId,
      x.offset > 0,
    ]),
  ).toEqual([
    [1, "12", "p12", false],
    [2, "12A", "p12", true],
    [3, "12B", "x", true],
    [4, "13", "p13", false],
  ]);
});

test("merging anchors needs the engine their pages were laid out with", () => {
  const p = v1.paginate(ten(), sp);
  const records = captureAnchors(p, "every_page", 1, "lock");
  expect(() => mergeAnchors(records, [], { ...p, engineVersion: 0 })).toThrow(
    RangeError,
  );
});

test("fragments are short A-pages of one parent that fit on one page", () => {
  const r = inOrder([
    rec("40", "p40"),
    rec("40A", "a", { source: "issue" }),
    rec("40B", "b", { source: "issue" }),
    rec("40C", "c", { source: "issue" }),
    rec("41", "p41"),
  ]);
  expect(fragmentRuns(locked(fragmentScript(5), r).pagination, r)).toEqual([
    { labels: ["40A", "40B", "40C"] },
  ]);
  expect(fragmentRuns(locked(fragmentScript(50), r).pagination, r)).toEqual([]);
});

test("the next label of a page is the one its overflow would take", () => {
  const p = locked(
    [
      filledBlock("action", 70, { id: "p12" }),
      filledBlock("action", 1, { id: "p13" }),
    ],
    inOrder([rec("12", "p12"), rec("13", "p13")]),
  ).pagination;
  const before12A = (extra: Partial<LockAnchorRecord>) =>
    locked(
      [
        filledBlock("action", 50, { id: "p12" }),
        filledBlock("action", 5, { id: "x" }),
        filledBlock("action", 1, { id: "p13" }),
      ],
      inOrder([rec("12", "p12"), rec("12A", "x", extra), rec("13", "p13")]),
    ).pagination;
  const hard = before12A({ level: 2 });
  const issued = before12A({ source: "issue" });
  expect(p.pages.map((x) => x.label)).toEqual(["12", "12A", "13"]);
  expect([nextLabel(p, 0, v1), nextLabel(p, 1, v1)]).toEqual(["12A", "12B"]);
  expect([nextLabel(hard, 0, v1), nextLabel(issued, 0, v1)]).toEqual([
    "A12A",
    "12A",
  ]);
});
