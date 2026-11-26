import { expect, test } from "bun:test";
import fc from "fast-check";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import type {
  PrompterStateJSON,
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import { compareRundowns, isRundownRowChange } from "../src/index.ts";

const DEFAULT_FIELDS: RundownFieldsJSON = {
  airDate: "2026-11-26",
  airAt: 1_764_180_000_000,
  windowLeadMs: 3_600_000,
  targetMs: 1_800_000,
};

function cell(
  value: string | number | null,
  userId = "ana",
  setAt = 100,
  previous: RundownCellJSON["previous"] = null,
): RundownCellJSON {
  return { value, userId, setAt, previous };
}

function row(
  id: string,
  order: string,
  overrides: Partial<RundownRowJSON> = {},
): RundownRowJSON {
  return {
    id,
    order,
    kind: "item",
    cells: {},
    docId: null,
    blockId: null,
    durationMs: null,
    prompter: null,
    unnumbered: false,
    ...overrides,
  };
}

function rundown(
  rows: RundownRowJSON[],
  overrides: Partial<Pick<RundownJSON, "rundown" | "columns">> = {},
): RundownJSON {
  return {
    rundown: { ...DEFAULT_FIELDS, ...overrides.rundown },
    columns: overrides.columns ?? [...NEWS_COLUMNS],
    rows,
  };
}

test("identical and empty rundowns report no changes", () => {
  const empty = rundown([]);
  const emptyDiff = compareRundowns(empty, empty);
  expect(emptyDiff).toEqual({
    v: 1,
    rows: [],
    fields: [],
    columnsChanged: false,
    counts: { added: 0, removed: 0, changed: 0, moved: 0, fields: 0 },
    hasChanges: false,
  });

  const sample = rundown([
    row("r1", "a", { cells: { story: cell("Intro"), dur: cell(30_000) } }),
    row("r2", "b", { cells: { story: cell("Weather") } }),
  ]);
  const sameDiff = compareRundowns(sample, sample);
  expect(sameDiff.hasChanges).toBe(false);
  expect(sameDiff.counts).toEqual({
    added: 0,
    removed: 0,
    changed: 0,
    moved: 0,
    fields: 0,
  });
  expect(
    sameDiff.rows.map((entry) => [entry.id, entry.kind, entry.moved]),
  ).toEqual([
    ["r1", "unchanged", false],
    ["r2", "unchanged", false],
  ]);
});

test("LIS alignment counts a 3-row rotation as one move, not three", () => {
  const before = rundown([row("A", "a"), row("B", "b"), row("C", "c")]);
  const rotatedLeft = rundown([row("B", "a"), row("C", "b"), row("A", "c")]);
  const left = compareRundowns(before, rotatedLeft);
  expect(left.counts).toEqual({
    added: 0,
    removed: 0,
    changed: 0,
    moved: 1,
    fields: 0,
  });
  expect(
    left.rows.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      moved: entry.moved,
      beforeIndex: entry.beforeIndex,
      afterIndex: entry.afterIndex,
    })),
  ).toEqual([
    { id: "B", kind: "unchanged", moved: false, beforeIndex: 1, afterIndex: 0 },
    { id: "C", kind: "unchanged", moved: false, beforeIndex: 2, afterIndex: 1 },
    { id: "A", kind: "unchanged", moved: true, beforeIndex: 0, afterIndex: 2 },
  ]);

  const rotatedRight = rundown([row("C", "a"), row("A", "b"), row("B", "c")]);
  const right = compareRundowns(before, rotatedRight);
  expect(right.counts.moved).toBe(1);
  expect(
    right.rows.filter((entry) => entry.moved).map((entry) => entry.id),
  ).toEqual(["C"]);
});

test("added and removed rows align around staying rows with afterRowId", () => {
  const before = rundown([
    row("r1", "a"),
    row("r2", "b"),
    row("r3", "c"),
    row("r4", "d"),
  ]);
  const after = rundown([row("r1", "a"), row("r5", "b"), row("r3", "c")]);
  const diff = compareRundowns(before, after);
  expect(diff.counts).toEqual({
    added: 1,
    removed: 2,
    changed: 0,
    moved: 0,
    fields: 0,
  });
  expect(
    diff.rows.map((entry) => [
      entry.id,
      entry.kind,
      entry.beforeIndex,
      entry.afterIndex,
      entry.afterRowId,
    ]),
  ).toEqual([
    ["r1", "unchanged", 0, 0, null],
    ["r5", "added", null, 1, null],
    ["r2", "removed", 1, null, "r1"],
    ["r3", "unchanged", 2, 2, null],
    ["r4", "removed", 3, null, "r3"],
  ]);
});

test("per-cell diffs track value changes and ignore metadata-only cell changes", () => {
  const before = rundown([
    row("r1", "a", {
      cells: {
        story: cell("Lead", "ana", 100),
        presenter: cell("Sam", "ana", 100),
        writer: cell("Dana", "ana", 100),
        dur: cell(60_000, "ana", 100),
      },
    }),
  ]);
  const after = rundown([
    row("r1", "a", {
      cells: {
        story: cell("Lead updated", "sam", 200, {
          value: "Lead",
          userId: "ana",
          setAt: 100,
        }),
        presenter: cell("Sam", "dana", 250, {
          value: "Old",
          userId: "ana",
          setAt: 50,
        }),
        writer: cell(null, "sam", 200, {
          value: "Dana",
          userId: "ana",
          setAt: 100,
        }),
        type: cell("VO", "sam", 200),
        dur: cell(90_000, "sam", 200),
      },
    }),
  ]);
  const diff = compareRundowns(before, after);
  expect(diff.counts.changed).toBe(1);
  expect(diff.rows[0]!.kind).toBe("changed");
  expect(
    diff.rows[0]!.cells.map((entry) => [
      entry.columnId,
      entry.before,
      entry.after,
    ]),
  ).toEqual([
    ["story", "Lead", "Lead updated"],
    ["writer", "Dana", null],
    ["type", null, "VO"],
    ["dur", 60_000, 90_000],
  ]);
});

test("server-only durationMs and prompter never mark a row as edited", () => {
  const onPrompter: PrompterStateJSON = {
    state: "on",
    versionId: "v1",
    sentAt: 100,
    sentByUserId: "ana",
  };
  const changedPrompter: PrompterStateJSON = {
    state: "changed",
    versionId: "v2",
    sentAt: 200,
    sentByUserId: "sam",
  };
  const before = rundown([
    row("r1", "a", {
      cells: { story: cell("Anchor intro") },
      durationMs: 30_000,
      prompter: onPrompter,
    }),
    row("r2", "b", {
      cells: { story: cell("Sports") },
      durationMs: null,
      prompter: null,
    }),
  ]);
  const after = rundown([
    row("r1", "M", {
      cells: { story: cell("Anchor intro") },
      durationMs: 42_000,
      prompter: changedPrompter,
    }),
    row("r2", "Z", {
      cells: { story: cell("Sports") },
      durationMs: 15_000,
      prompter: onPrompter,
    }),
  ]);
  const diff = compareRundowns(before, after);
  expect(diff.hasChanges).toBe(false);
  expect(diff.counts).toEqual({
    added: 0,
    removed: 0,
    changed: 0,
    moved: 0,
    fields: 0,
  });
  expect(diff.rows.every((entry) => !isRundownRowChange(entry))).toBe(true);
  expect(diff.rows[0]!.serverFields).toEqual(["durationMs", "prompter"]);
  expect(diff.rows[1]!.serverFields).toEqual(["durationMs", "prompter"]);
});

test("row metadata, broadcast fields, columns and moved+changed rows are reported", () => {
  const before = rundown(
    [
      row("r1", "a", { kind: "item", unnumbered: false }),
      row("r2", "b", {
        kind: "script",
        docId: "d1",
        blockId: "b1",
        cells: { story: cell("Headline") },
      }),
    ],
    {
      rundown: {
        airDate: "2026-11-26",
        airAt: 1_000,
        windowLeadMs: 3_600_000,
        targetMs: 1_800_000,
      },
      columns: [...NEWS_COLUMNS],
    },
  );
  const after = rundown(
    [
      row("r2", "a", {
        kind: "script",
        docId: "d2",
        blockId: "b1",
        cells: { story: cell("Breaking") },
      }),
      row("r1", "b", { kind: "header", unnumbered: true }),
    ],
    {
      rundown: {
        airDate: "2026-11-27",
        airAt: 2_000,
        windowLeadMs: 3_600_000,
        targetMs: 2_400_000,
      },
      columns: [...SHOW_COLUMNS],
    },
  );
  const diff = compareRundowns(before, after);
  expect(diff.hasChanges).toBe(true);
  expect(diff.columnsChanged).toBe(true);
  expect(diff.fields).toEqual([
    { field: "airDate", before: "2026-11-26", after: "2026-11-27" },
    { field: "airAt", before: 1_000, after: 2_000 },
    { field: "targetMs", before: 1_800_000, after: 2_400_000 },
  ]);
  expect(diff.counts).toEqual({
    added: 0,
    removed: 0,
    changed: 2,
    moved: 1,
    fields: 3,
  });
  const r2 = diff.rows.find((entry) => entry.id === "r2")!;
  const r1 = diff.rows.find((entry) => entry.id === "r1")!;
  expect(r2.kind).toBe("changed");
  expect(r2.moved).toBe(false);
  expect(r2.fields).toEqual(["docId"]);
  expect(r2.cells.map((entry) => entry.columnId)).toEqual(["story"]);
  expect(r1.kind).toBe("changed");
  expect(r1.moved).toBe(true);
  expect(r1.fields).toEqual(["kind", "unnumbered"]);
});

const arbRowKind = fc.constantFrom<RowKind>("header", "item", "script");
const arbStoredCol = fc.constantFrom<RundownColumnId>(
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
);

const arbRow = (id: string, order: string): fc.Arbitrary<RundownRowJSON> =>
  fc
    .record({
      kind: arbRowKind,
      story: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
      dur: fc.option(fc.nat({ max: 600_000 }), { nil: null }),
      unnumbered: fc.boolean(),
      durationMs: fc.option(fc.nat({ max: 600_000 }), { nil: null }),
    })
    .map(({ kind, story, dur, unnumbered, durationMs }) => {
      const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
      if (story !== null) cells.story = cell(story);
      if (dur !== null) cells.dur = cell(dur);
      return row(id, order, { kind, cells, unnumbered, durationMs });
    });

const arbRundown: fc.Arbitrary<RundownJSON> = fc
  .uniqueArray(fc.constantFrom("r1", "r2", "r3", "r4", "r5", "r6"), {
    maxLength: 6,
  })
  .chain((ids) =>
    fc.tuple(...ids.map((id, i) => arbRow(id, String.fromCharCode(97 + i)))),
  )
  .map((rows) => rundown(rows));

test("comparison invariants hold across arbitrary rundowns", () => {
  fc.assert(
    fc.property(arbRundown, arbRundown, arbStoredCol, (before, after, _col) => {
      expect(compareRundowns(before, before).hasChanges).toBe(false);
      const diff = compareRundowns(before, after);
      expect(diff.counts.added).toBe(
        diff.rows.filter((entry) => entry.kind === "added").length,
      );
      expect(diff.counts.removed).toBe(
        diff.rows.filter((entry) => entry.kind === "removed").length,
      );
      expect(diff.counts.changed).toBe(
        diff.rows.filter((entry) => entry.kind === "changed").length,
      );
      expect(diff.counts.moved).toBe(
        diff.rows.filter((entry) => entry.moved).length,
      );
      // changing only durationMs / prompter never introduces user-visible changes
      const serverOnly = {
        ...before,
        rows: before.rows.map((item, i) => ({
          ...item,
          durationMs: (i + 1) * 1000,
          prompter: {
            state: "on" as const,
            versionId: `v${i}`,
            sentAt: i,
            sentByUserId: "ana",
          },
        })),
      };
      expect(compareRundowns(before, serverOnly).hasChanges).toBe(false);
    }),
    { numRuns: 300 },
  );
});
