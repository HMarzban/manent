import { expect, test } from "bun:test";
import type { LockAnchorRecord, LockSource } from "@manent/pagination";
import { importAnchors, touchedImportPages } from "../src/index.ts";

const BLOCKS_TEXT = [
  { id: "b1", text: "The lamp room is dark but for the beam." },
  { id: "b2", text: "Dana climbs." },
  { id: "b3", text: "DANA" },
  { id: "b4", text: "It never stops turning, not once in forty years." },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `b${i + 5}`,
    text: "Sam waits.",
  })),
];

const IMPORT_RECORDS: LockAnchorRecord[] = [
  {
    level: 1,
    order: 1,
    label: "1",
    blockId: "b1",
    offset: 0,
    quote: "The lamp room is dark bu",
    fallbackIds: ["b2", "b3", "b4"],
    source: "import",
  },
  {
    level: 1,
    order: 2,
    label: "2",
    blockId: "b4",
    offset: 3,
    quote: "never stops turning, not",
    fallbackIds: ["b5", "b6", "b7", "b8", "b9", "b10", "b11", "b12"],
    source: "import",
  },
];

test("import anchors quote their text and name the blocks after them", () => {
  expect(
    importAnchors(BLOCKS_TEXT, [
      { label: "1", blockId: "b1", offset: 0 },
      { label: "2", blockId: "b4", offset: 3 },
    ]),
  ).toEqual(IMPORT_RECORDS);
});

test("a page start on a block the script does not hold is refused", () => {
  expect(() =>
    importAnchors(BLOCKS_TEXT, [{ label: "1", blockId: "b99", offset: 0 }]),
  ).toThrow(RangeError);
});

/** Each row is a page's label, its anchor's block and offset, in page order. */
function recordsAt(
  rows: readonly (readonly [string, string, number])[],
  source: LockSource = "import",
): LockAnchorRecord[] {
  return rows.map(([label, blockId, offset], i) => ({
    level: 1,
    order: i + 1,
    label,
    blockId,
    offset,
    quote: "",
    fallbackIds: [],
    source,
  }));
}

const BEFORE = ["b1", "b2", "b3", "b4", "b5"];
const ROWS = [
  ["1", "b1", 0],
  ["2", "b3", 0],
  ["3", "b4", 5],
] as const;

const EDITS = [
  { inserted: [], changed: ["b2"], removed: [] },
  { inserted: [{ id: "new1", after: "b3" }], changed: [], removed: [] },
  {
    inserted: [
      { id: "new1", after: "b3" },
      { id: "new2", after: "new1" },
    ],
    changed: [],
    removed: [],
  },
  { inserted: [], changed: ["b4"], removed: [] },
  { inserted: [], changed: [], removed: ["b5"] },
];

test("an edit touches the pages that hold it, and no other", () => {
  const records = recordsAt(ROWS);
  // new2 follows new1, inserted in the same change; b4 starts page 3 at offset 5: both pages hold
  // part of it; b5, removed, is found in the order before
  expect(
    EDITS.map((change) => touchedImportPages(BEFORE, records, change)),
  ).toEqual([["1"], ["2"], ["2"], ["2", "3"], ["3"]]);
});

test("an anchor that is not an import anchor is never reported", () => {
  const records = recordsAt(ROWS, "lock");
  expect(
    EDITS.map((change) => touchedImportPages(BEFORE, records, change)),
  ).toEqual([[], [], [], [], []]);
});

test("an insert after a block two pages share is on the later page, and one at the start on the first", () => {
  const records = recordsAt(ROWS);
  expect([
    touchedImportPages(BEFORE, records, {
      inserted: [{ id: "new1", after: "b4" }],
      changed: [],
      removed: [],
    }),
    touchedImportPages(BEFORE, records, {
      inserted: [{ id: "new1", after: null }],
      changed: [],
      removed: [],
    }),
  ]).toEqual([["3"], ["1"]]);
});
