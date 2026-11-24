import { expect, test } from "bun:test";
import {
  createDoc,
  encodeAwareness,
  initRundown,
  insertRows,
  loadDoc,
  moveRows,
  readRundown,
  setCell,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import {
  parseClipboardRows,
  serializeRowsForClipboard,
} from "../src/rundown/clipboard.ts";
import {
  STORY_OPEN_COLUMN,
  applyAwarenessUpdate,
  collectCellPresence,
  parseCellAwareness,
} from "../src/rundown/presence.ts";
import {
  CORNER_MARK_WINDOW_MS,
  formatPreviousWhen,
  isRecentOtherChange,
  tourCellOf,
} from "../src/rundown/previous-value.tsx";
import { buildRundownClock } from "../src/rundown/rundown-access.ts";

const R1 = "55555555-5555-4555-8555-555555555551";
const R2 = "55555555-5555-4555-8555-555555555552";
const R3 = "55555555-5555-4555-8555-555555555553";
const STORY_1 = "66666666-6666-4666-8666-666666666661";

test("clipboard serialises rundown rows as JSON and TSV and refuses malformed payloads", () => {
  const doc = createDoc();
  initRundown(
    doc,
    {
      airDate: "2026-11-17",
      airAt: new Date(2026, 10, 17, 23, 35, 0).getTime(),
      windowLeadMs: 3_600_000,
      targetMs: 600_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: R1, kind: "header", docId: null, blockId: null },
      { id: R2, kind: "script", docId: STORY_1, blockId: null },
    ],
    null,
  );
  const by = { userId: "dana", now: () => 1_700_000_000_000 };
  setCell(doc, R1, "segment", "ACT ONE", by);
  setCell(doc, R2, "segment", "Monologue", by);
  setCell(doc, R2, "writer", "Sam Okafor", by);
  setCell(doc, R2, "dur", 465_000, by);

  const rundown = readRundown(doc);
  const clock = buildRundownClock(rundown, () => null);
  const out = serializeRowsForClipboard({
    sourceDocId: "rundown-1",
    rows: rundown.rows,
    columnIds: SHOW_COLUMNS,
    clock,
  });

  expect(parseClipboardRows(out.json)).toEqual({
    version: 1,
    sourceDocId: "rundown-1",
    rows: [
      {
        kind: "header",
        docId: null,
        unnumbered: false,
        cells: { segment: "ACT ONE" },
      },
      {
        kind: "script",
        docId: STORY_1,
        unnumbered: false,
        cells: { segment: "Monologue", writer: "Sam Okafor", dur: 465_000 },
      },
    ],
  });
  expect(out.tsv.split("\n")).toEqual([
    "ACT ONE",
    "1\tMonologue\tSam Okafor\t7:45\t7:45\t23:35:00\t23:37:15\t",
  ]);
  expect([
    parseClipboardRows(""),
    parseClipboardRows("not-json"),
    parseClipboardRows(
      JSON.stringify({ version: 2, sourceDocId: "x", rows: [] }),
    ),
    parseClipboardRows(
      JSON.stringify({
        version: 1,
        sourceDocId: "x",
        rows: [
          { kind: "item", docId: null, unnumbered: false, cells: { dur: -5 } },
        ],
      }),
    ),
  ]).toEqual([null, null, null, null]);
});

test("two people moving the same row concurrently converge without duplicating the row", () => {
  const a = createDoc({ clientId: 10 });
  initRundown(
    a,
    {
      airDate: "2026-11-17",
      airAt: null,
      windowLeadMs: 3_600_000,
      targetMs: null,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    a,
    [
      { id: R1, kind: "item", docId: null, blockId: null },
      { id: R2, kind: "item", docId: null, blockId: null },
      { id: R3, kind: "item", docId: null, blockId: null },
    ],
    null,
  );
  const b = loadDoc(a.encodeState(), { clientId: 20 });

  moveRows(a, [R2], null);
  moveRows(b, [R2], R3);

  const upA = a.encodeState();
  const upB = b.encodeState();
  a.applyUpdate(upB);
  b.applyUpdate(upA);

  const idsA = readRundown(a).rows.map((r) => r.id);
  const idsB = readRundown(b).rows.map((r) => r.id);
  expect(idsA).toEqual(idsB);
  expect(new Set(idsA).size).toBe(3);
  expect(idsA.length).toBe(3);
});

test("corner mark expires after one minute, excludes own edits, and formats previous timestamps", () => {
  const now = new Date(2026, 10, 17, 18, 52, 0).getTime();
  const recentOther = {
    value: "8:30",
    userId: "sam",
    setAt: now - 30_000,
    previous: { value: "9:00", userId: "dana", setAt: now - 120_000 },
  };
  expect([
    isRecentOtherChange(recentOther, "dana", now),
    isRecentOtherChange(recentOther, "sam", now),
    isRecentOtherChange(recentOther, "dana", now + CORNER_MARK_WINDOW_MS),
    isRecentOtherChange({ ...recentOther, previous: null }, "dana", now),
  ]).toEqual([true, false, false, false]);

  expect([
    formatPreviousWhen(new Date(2026, 10, 17, 18, 52).getTime(), now),
    formatPreviousWhen(new Date(2026, 10, 16, 18, 52).getTime(), now),
    formatPreviousWhen(new Date(2026, 10, 14, 18, 52).getTime(), now),
    formatPreviousWhen(new Date(2026, 10, 5, 18, 52).getTime(), now),
  ]).toEqual(["18:52", "Yesterday 18:52", "Sat 18:52", "5 Nov 18:52"]);
});

test("rundown:cell tour target chooses the open popover cell or else the single most recently overwritten cell", () => {
  const rundown: RundownJSON = {
    rundown: {
      airDate: "2026-11-17",
      airAt: null,
      windowLeadMs: 3_600_000,
      targetMs: null,
    },
    columns: ["number", "segment", "dur"],
    rows: [
      {
        id: R1,
        order: "001",
        kind: "item",
        cells: {
          segment: {
            value: "Cold open",
            userId: "sam",
            setAt: 1000,
            previous: { value: "Open", userId: "dana", setAt: 500 },
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
      {
        id: R2,
        order: "002",
        kind: "item",
        cells: {
          dur: {
            value: 510_000,
            userId: "sam",
            setAt: 2000,
            previous: { value: 540_000, userId: "dana", setAt: 500 },
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
    ],
  };

  expect(tourCellOf(rundown, null, "segment")).toEqual({
    rowId: R2,
    columnId: "dur",
  });
  expect(
    tourCellOf(rundown, { rowId: R1, columnId: "segment" }, "segment"),
  ).toEqual({ rowId: R1, columnId: "segment" });
});

test("cell and story awareness decodes collaborators, ignores own client and clears departed peers", () => {
  expect(parseCellAwareness(null)).toBeNull();
  const update = encodeAwareness([
    {
      clientId: 10,
      clock: 1,
      state: {
        user: { userId: "dana" },
        cell: { rowId: R1, columnId: "dur" },
      },
    },
    {
      clientId: 20,
      clock: 1,
      state: {
        user: { userId: "sam" },
        cell: { rowId: R1, columnId: "dur" },
      },
    },
    {
      clientId: 30,
      clock: 1,
      state: {
        user: { userId: "alex" },
        cell: { rowId: R2, columnId: null },
      },
    },
  ]);

  const map1 = applyAwarenessUpdate(new Map(), update, 10);
  const lookup1 = collectCellPresence(map1);
  expect(lookup1(R1, "dur")).toEqual(["sam"]);
  expect(lookup1(R2, STORY_OPEN_COLUMN)).toEqual(["alex"]);
  expect(lookup1(R1, STORY_OPEN_COLUMN)).toEqual([]);

  const leave = encodeAwareness([{ clientId: 20, clock: 2, state: null }]);
  const map2 = applyAwarenessUpdate(map1, leave, 10);
  expect(collectCellPresence(map2)(R1, "dur")).toEqual([]);
  expect(collectCellPresence(map2)(R2, STORY_OPEN_COLUMN)).toEqual(["alex"]);
});
