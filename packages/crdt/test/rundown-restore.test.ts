import { expect, test } from "bun:test";
import fc from "fast-check";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import type { PrompterStateJSON, RundownFieldsJSON } from "@manent/schema";
import {
  ORIGIN_RESTORE,
  createDoc,
  createRundownUndo,
  initRundown,
  insertRows,
  observeRundown,
  readRundown,
  readRundownWrites,
  restoreCell,
  setCell,
  writeDurations,
  writePrompterState,
} from "../src/index.ts";
import { applyRundownRestore } from "../src/rundown/rundown-restore.ts";
import type { RundownRestoreOp } from "../src/rundown/rundown-restore.ts";

const R1 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c701";
const R2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c702";
const R3 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c703";
const R4 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c704";
const R5 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c705";
const DOC_A = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7aa";
const BLK_A = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7bb";

const FIELDS: RundownFieldsJSON = {
  airDate: "2026-11-26",
  airAt: 1_764_180_000_000,
  windowLeadMs: 3_600_000,
  targetMs: 1_800_000,
};

const BASE62 = /^[0-9A-Za-z]+$/;

function setupRundown() {
  const doc = createDoc();
  initRundown(doc, FIELDS, NEWS_COLUMNS);
  insertRows(
    doc,
    [
      { id: R1, kind: "item", docId: null, blockId: null },
      { id: R2, kind: "script", docId: DOC_A, blockId: null },
      { id: R3, kind: "item", docId: null, blockId: null },
    ],
    null,
  );
  setCell(doc, R1, "story", "Open live", { userId: "sam", now: () => 200 });
  setCell(doc, R2, "story", "Lead live", { userId: "sam", now: () => 200 });
  setCell(doc, R3, "story", "Extra live", { userId: "sam", now: () => 200 });
  const prompter: PrompterStateJSON = {
    state: "on",
    versionId: "v1",
    sentAt: 250,
    sentByUserId: "ana",
  };
  writeDurations(
    doc,
    new Map([
      [R1, 15_000],
      [R2, 60_000],
      [R3, 20_000],
    ]),
  );
  writePrompterState(doc, R2, prompter);
  return { doc, prompter };
}

test("applyRundownRestore runs atomically in one Yjs transaction under ORIGIN_RESTORE without touching server-only keys", () => {
  const { doc, prompter } = setupRundown();
  const undo = createRundownUndo(doc, { trackedOrigins: [null] });
  const updates: { bytes: Uint8Array; origin: unknown }[] = [];
  const observations: {
    rowIds: string[];
    fields: boolean;
    columns: boolean;
  }[] = [];
  doc.subscribe((bytes, origin) => updates.push({ bytes, origin }));
  observeRundown(doc, (change) => observations.push(change));

  const ops: RundownRestoreOp[] = [
    { op: "set_fields", fields: { targetMs: 2_400_000 } },
    { op: "set_columns", columns: [...SHOW_COLUMNS] },
    { op: "remove_row", rowId: R3 },
    { op: "move_row", rowId: R2, after: null },
    {
      op: "update_row_meta",
      rowId: R1,
      meta: { kind: "header", unnumbered: true },
    },
    {
      op: "set_cell",
      rowId: R2,
      columnId: "story",
      value: "Lead restored",
      previous: { value: "Lead live", userId: "sam", setAt: 200 },
    },
    {
      op: "insert_row",
      after: R1,
      row: {
        id: R4,
        kind: "script",
        cells: {
          story: {
            value: "Re-inserted story",
            userId: "dana",
            setAt: 9_000,
            previous: null,
          },
          dur: {
            value: 30_000,
            userId: "dana",
            setAt: 9_000,
            previous: null,
          },
        },
        docId: DOC_A,
        blockId: BLK_A,
        unnumbered: false,
      },
    },
  ];

  const applied = applyRundownRestore(doc, ops, {
    userId: "dana",
    now: 9_000,
    origin: ORIGIN_RESTORE,
  });

  expect(applied).toBe(ops.length);
  expect(updates).toHaveLength(1);
  expect(updates[0]!.origin).toBe(ORIGIN_RESTORE);
  expect(observations).toHaveLength(1);
  expect(observations[0]!.fields).toBe(true);
  expect(observations[0]!.columns).toBe(true);

  const after = readRundown(doc);
  expect(after.rundown.targetMs).toBe(2_400_000);
  expect(after.rundown.airDate).toBe("2026-11-26");
  expect(after.columns).toEqual([...SHOW_COLUMNS]);
  expect(after.rows.map((r) => r.id)).toEqual([R2, R1, R4]);
  for (const r of after.rows) expect(BASE62.test(r.order)).toBe(true);

  const [r2, r1, r4] = after.rows;
  // Surviving rows keep exact server-only durationMs and prompter untouched
  expect(r2!.durationMs).toBe(60_000);
  expect(r2!.prompter).toEqual(prompter);
  expect(r1!.durationMs).toBe(15_000);
  expect(r1!.prompter).toBeNull();
  expect(r1!.kind).toBe("header");
  expect(r1!.unnumbered).toBe(true);
  // Re-inserted row has no server-only fields written
  expect(r4!.durationMs).toBeNull();
  expect(r4!.prompter).toBeNull();
  expect(r4!.docId).toBe(DOC_A);
  expect(r4!.blockId).toBe(BLK_A);
  expect(r4!.cells.story).toEqual({
    value: "Re-inserted story",
    userId: "dana",
    setAt: 9_000,
    previous: null,
  });
  expect(r4!.cells.dur).toEqual({
    value: 30_000,
    userId: "dana",
    setAt: 9_000,
    previous: null,
  });

  // readRundownWrites proves ZERO server-only keys were written in the update
  const writes = readRundownWrites(doc, updates[0]!.bytes);
  for (const rowWrite of writes.rows) {
    expect(rowWrite.keys).not.toContain("durationMs");
    expect(rowWrite.keys).not.toContain("prompter");
  }

  // ADR 0052: cell.previous preserved and immediately restorable with restoreCell
  expect(r2!.cells.story).toEqual({
    value: "Lead restored",
    userId: "dana",
    setAt: 9_000,
    previous: { value: "Lead live", userId: "sam", setAt: 200 },
  });
  restoreCell(doc, R2, "story", { userId: "dana", now: () => 9_001 });
  expect(readRundown(doc).rows[0]!.cells.story).toEqual({
    value: "Lead live",
    userId: "dana",
    setAt: 9_001,
    previous: { value: "Lead restored", userId: "dana", setAt: 9_000 },
  });

  // Undo manager does not undo an ORIGIN_RESTORE transaction (only the local restoreCell)
  undo.undo();
  expect(readRundown(doc).rows[0]!.cells.story?.value).toBe("Lead restored");
  undo.undo();
  expect(readRundown(doc).rows.map((r) => r.id)).toEqual([R2, R1, R4]);

  undo.destroy();
  doc.destroy();
});

test("set_cell without explicit previous derives previous from the live cell and defaults origin to ORIGIN_RESTORE", () => {
  const { doc } = setupRundown();
  const origins: unknown[] = [];
  doc.subscribe((_bytes, origin) => origins.push(origin));

  const applied = applyRundownRestore(
    doc,
    [{ op: "set_cell", rowId: R1, columnId: "story", value: "Reverted" }],
    { userId: "ana", now: () => 500 },
  );
  expect(applied).toBe(1);
  expect(origins).toEqual([ORIGIN_RESTORE]);
  expect(readRundown(doc).rows[0]!.cells.story).toEqual({
    value: "Reverted",
    userId: "ana",
    setAt: 500,
    previous: { value: "Open live", userId: "sam", setAt: 200 },
  });
  doc.destroy();
});

test("empty ops emit no transaction and invalid ops throw before mutating the document", () => {
  const { doc } = setupRundown();
  const snapshotBefore = readRundown(doc);
  let updateCount = 0;
  doc.subscribe(() => updateCount++);

  expect(applyRundownRestore(doc, [], { userId: "ana", now: 100 })).toBe(0);
  expect(updateCount).toBe(0);

  // Second op is invalid (non-stored column "cume"): first op must NOT apply
  expect(() =>
    applyRundownRestore(
      doc,
      [
        { op: "remove_row", rowId: R3 },
        { op: "set_cell", rowId: R1, columnId: "cume", value: "bad" },
      ],
      { userId: "ana", now: 100, origin: ORIGIN_RESTORE },
    ),
  ).toThrow(RangeError);

  expect(updateCount).toBe(0);
  expect(readRundown(doc)).toEqual(snapshotBefore);
  doc.destroy();
});

test("arbitrary restore reorder/insert/remove sequences stay valid and preserve server-only fields", () => {
  const pool = [R1, R2, R3, R4, R5];
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.constantFrom(...pool), { minLength: 1, maxLength: 5 }),
      fc.uniqueArray(fc.constantFrom(...pool), { minLength: 0, maxLength: 5 }),
      (initialIds, targetIds) => {
        const doc = createDoc();
        initRundown(doc, FIELDS, NEWS_COLUMNS);
        insertRows(
          doc,
          initialIds.map((id) => ({
            id,
            kind: "item" as const,
            docId: null,
            blockId: null,
          })),
          null,
        );
        const durations = new Map<string, number | null>(
          initialIds.map((id, i) => [id, (i + 1) * 1000]),
        );
        writeDurations(doc, durations);

        const targetSet = new Set(targetIds);
        const initialSet = new Set(initialIds);
        const ops: RundownRestoreOp[] = [];
        for (const id of initialIds)
          if (!targetSet.has(id)) ops.push({ op: "remove_row", rowId: id });
        let after: string | null = null;
        for (const id of targetIds) {
          if (initialSet.has(id))
            ops.push({ op: "move_row", rowId: id, after });
          else
            ops.push({
              op: "insert_row",
              after,
              row: {
                id,
                kind: "item",
                cells: {},
                docId: null,
                blockId: null,
                unnumbered: false,
              },
            });
          after = id;
        }

        const updates: Uint8Array[] = [];
        doc.subscribe((bytes) => updates.push(bytes));
        applyRundownRestore(doc, ops, {
          userId: "dana",
          now: 5_000,
          origin: ORIGIN_RESTORE,
        });

        const result = readRundown(doc);
        expect(result.rows.map((r) => r.id)).toEqual(targetIds);
        for (const r of result.rows) {
          expect(BASE62.test(r.order)).toBe(true);
          if (initialSet.has(r.id))
            expect(r.durationMs).toBe(durations.get(r.id)!);
          else expect(r.durationMs).toBeNull();
        }
        if (ops.length > 0) {
          expect(updates).toHaveLength(1);
          const writes = readRundownWrites(doc, updates[0]!);
          for (const rw of writes.rows) {
            expect(rw.keys).not.toContain("durationMs");
            expect(rw.keys).not.toContain("prompter");
          }
        }
        doc.destroy();
      },
    ),
    { numRuns: 200 },
  );
});
