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
import { compareRundowns, planRundownRestore } from "../src/index.ts";
import type {
  RundownRestoreOptions,
  RundownRestoreScope,
} from "../src/index.ts";

const DEFAULT_FIELDS: RundownFieldsJSON = {
  airDate: "2026-11-26",
  airAt: 1_764_180_000_000,
  windowLeadMs: 3_600_000,
  targetMs: 1_800_000,
};

const OPTS: RundownRestoreOptions = { userId: "dana", now: 9_000 };

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

test("whole-rundown restore plans minimal LIS moves, fields, columns, inserts, removes and cell updates", () => {
  const prompterB: PrompterStateJSON = {
    state: "on",
    versionId: "v1",
    sentAt: 500,
    sentByUserId: "ana",
  };
  const current = rundown(
    [
      row("A", "a", {
        cells: { story: cell("One", "ana", 100) },
        durationMs: 10_000,
      }),
      row("C", "b", {
        cells: { story: cell("Three", "ana", 100) },
        durationMs: 30_000,
      }),
      row("B", "c", {
        cells: { story: cell("TWO NOW", "sam", 200) },
        durationMs: 20_000,
        prompter: prompterB,
      }),
      row("N", "d", { cells: { story: cell("Extra", "sam", 200) } }),
    ],
    {
      rundown: { ...DEFAULT_FIELDS, targetMs: 2_000_000 },
      columns: [...SHOW_COLUMNS],
    },
  );
  const target = rundown(
    [
      row("A", "a", {
        cells: { story: cell("One", "ana", 50) },
        durationMs: 99_000,
      }),
      row("B", "b", {
        cells: { story: cell("Two", "ana", 50) },
        durationMs: 88_000,
        prompter: null,
      }),
      row("C", "c", { cells: { story: cell("Three", "ana", 50) } }),
      row("D", "d", {
        kind: "script",
        docId: "doc-d",
        cells: { story: cell("Four", "ana", 50), dur: cell(45_000, "ana", 50) },
        durationMs: 45_000,
        prompter: prompterB,
      }),
    ],
    {
      rundown: { ...DEFAULT_FIELDS, targetMs: 1_800_000 },
      columns: [...NEWS_COLUMNS],
    },
  );

  const plan = planRundownRestore(current, target, { kind: "all" }, OPTS);
  expect(plan.ops).toEqual([
    { op: "set_fields", fields: { targetMs: 1_800_000 } },
    { op: "set_columns", columns: [...NEWS_COLUMNS] },
    { op: "remove_row", rowId: "N" },
    {
      op: "set_cell",
      rowId: "B",
      columnId: "story",
      value: "Two",
      previous: { value: "TWO NOW", userId: "sam", setAt: 200 },
    },
    { op: "move_row", rowId: "C", after: "B" },
    {
      op: "insert_row",
      after: "C",
      row: {
        id: "D",
        kind: "script",
        cells: {
          story: {
            value: "Four",
            userId: "dana",
            setAt: 9_000,
            previous: null,
          },
          dur: { value: 45_000, userId: "dana", setAt: 9_000, previous: null },
        },
        docId: "doc-d",
        blockId: null,
        unnumbered: false,
      },
    },
  ]);
  expect(plan.applied).toBe(6);
  expect(plan.result.rows.map((item) => item.id)).toEqual(["A", "B", "C", "D"]);
  // Server-only fields stay intact on surviving rows and stay null on re-inserted rows
  const rowB = plan.result.rows.find((item) => item.id === "B")!;
  const rowC = plan.result.rows.find((item) => item.id === "C")!;
  const rowD = plan.result.rows.find((item) => item.id === "D")!;
  expect(rowB.durationMs).toBe(20_000);
  expect(rowB.prompter).toEqual(prompterB);
  expect(rowC.durationMs).toBe(30_000);
  expect(rowD.durationMs).toBeNull();
  expect(rowD.prompter).toBeNull();
  // ADR 0052 cell.previous preserved on restored cell
  expect(rowB.cells.story).toEqual({
    value: "Two",
    userId: "dana",
    setAt: 9_000,
    previous: { value: "TWO NOW", userId: "sam", setAt: 200 },
  });
  // Unchanged cell on row A keeps original writer & timestamp
  expect(plan.result.rows[0]!.cells.story).toEqual({
    value: "One",
    userId: "ana",
    setAt: 100,
    previous: null,
  });
});

test("clearing a cell during restore preserves its displaced value in cell.previous", () => {
  const current = rundown([
    row("r1", "a", {
      cells: {
        story: cell("Added headline", "sam", 300),
        dur: cell(60_000, "sam", 300),
      },
    }),
  ]);
  const target = rundown([row("r1", "a", { cells: {} })]);
  const plan = planRundownRestore(current, target, { kind: "all" }, OPTS);
  expect(plan.ops).toEqual([
    {
      op: "set_cell",
      rowId: "r1",
      columnId: "story",
      value: null,
      previous: { value: "Added headline", userId: "sam", setAt: 300 },
    },
    {
      op: "set_cell",
      rowId: "r1",
      columnId: "dur",
      value: null,
      previous: { value: 60_000, userId: "sam", setAt: 300 },
    },
  ]);
  expect(plan.result.rows[0]!.cells.story).toEqual({
    value: null,
    userId: "dana",
    setAt: 9_000,
    previous: { value: "Added headline", userId: "sam", setAt: 300 },
  });
});

test("restoring a single existing row touches only that row and keeps its server-only fields", () => {
  const prompter: PrompterStateJSON = {
    state: "changed",
    versionId: "v2",
    sentAt: 400,
    sentByUserId: "ana",
  };
  const current = rundown(
    [
      row("r1", "a", { cells: { story: cell("Row 1 live", "sam", 200) } }),
      row("r2", "b", {
        kind: "item",
        unnumbered: true,
        cells: {
          story: cell("Row 2 live", "sam", 200),
          presenter: cell("Sam", "sam", 200),
        },
        durationMs: 55_000,
        prompter,
      }),
    ],
    { rundown: { ...DEFAULT_FIELDS, airDate: "2026-12-01" } },
  );
  const target = rundown(
    [
      row("r2", "a", {
        kind: "script",
        docId: "s2",
        unnumbered: false,
        cells: {
          story: cell("Row 2 old", "ana", 100),
          presenter: cell("Sam", "ana", 100),
        },
        durationMs: 10_000,
        prompter: null,
      }),
      row("r1", "b", { cells: { story: cell("Row 1 old", "ana", 100) } }),
    ],
    { rundown: { ...DEFAULT_FIELDS, airDate: "2026-11-26" } },
  );
  const plan = planRundownRestore(
    current,
    target,
    { kind: "row", rowId: "r2" },
    OPTS,
  );
  expect(plan.ops).toEqual([
    {
      op: "update_row_meta",
      rowId: "r2",
      meta: { kind: "script", docId: "s2", unnumbered: false },
    },
    {
      op: "set_cell",
      rowId: "r2",
      columnId: "story",
      value: "Row 2 old",
      previous: { value: "Row 2 live", userId: "sam", setAt: 200 },
    },
  ]);
  expect(plan.applied).toBe(1);
  // Fields, row order, and r1 are untouched; r2 keeps its server-only fields
  expect(plan.result.rundown.airDate).toBe("2026-12-01");
  expect(plan.result.rows.map((item) => item.id)).toEqual(["r1", "r2"]);
  expect(plan.result.rows[0]!.cells.story?.value).toBe("Row 1 live");
  expect(plan.result.rows[1]!.durationMs).toBe(55_000);
  expect(plan.result.rows[1]!.prompter).toEqual(prompter);
  expect(plan.result.rows[1]!.cells.presenter).toEqual({
    value: "Sam",
    userId: "sam",
    setAt: 200,
    previous: null,
  });
});

test("restoring a single deleted row re-inserts it after its nearest earlier surviving neighbour", () => {
  const current = rundown([row("r1", "a"), row("r3", "c")]);
  const target = rundown([
    row("r1", "a"),
    row("r2", "b", { cells: { story: cell("Restored story", "ana", 100) } }),
    row("r3", "c"),
  ]);
  const plan = planRundownRestore(
    current,
    target,
    { kind: "row", rowId: "r2" },
    OPTS,
  );
  expect(plan.ops).toEqual([
    {
      op: "insert_row",
      after: "r1",
      row: {
        id: "r2",
        kind: "item",
        cells: {
          story: {
            value: "Restored story",
            userId: "dana",
            setAt: 9_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        unnumbered: false,
      },
    },
  ]);
  expect(plan.result.rows.map((item) => item.id)).toEqual(["r1", "r2", "r3"]);
});

test("restoring an already-matching rundown or server-only diff plans zero ops", () => {
  const current = rundown([
    row("r1", "a", {
      cells: { story: cell("Intro", "sam", 200) },
      durationMs: 12_000,
      prompter: {
        state: "on",
        versionId: "v1",
        sentAt: 200,
        sentByUserId: "sam",
      },
    }),
  ]);
  const target = rundown([
    row("r1", "Z", {
      cells: { story: cell("Intro", "ana", 100) },
      durationMs: 99_000,
      prompter: null,
    }),
  ]);
  const plan = planRundownRestore(current, target, { kind: "all" }, OPTS);
  expect(plan.ops).toEqual([]);
  expect(plan.applied).toBe(0);
});

const arbRowKind = fc.constantFrom<RowKind>("header", "item", "script");

const arbRow = (id: string, order: string): fc.Arbitrary<RundownRowJSON> =>
  fc
    .record({
      kind: arbRowKind,
      story: fc.option(fc.string({ maxLength: 10 }), { nil: null }),
      presenter: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
      dur: fc.option(fc.nat({ max: 300_000 }), { nil: null }),
      unnumbered: fc.boolean(),
      durationMs: fc.option(fc.nat({ max: 300_000 }), { nil: null }),
    })
    .map(({ kind, story, presenter, dur, unnumbered, durationMs }) => {
      const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
      if (story !== null) cells.story = cell(story, "sam", 100);
      if (presenter !== null) cells.presenter = cell(presenter, "sam", 100);
      if (dur !== null) cells.dur = cell(dur, "sam", 100);
      return row(id, order, { kind, cells, unnumbered, durationMs });
    });

const arbRundown: fc.Arbitrary<RundownJSON> = fc
  .record({
    ids: fc.uniqueArray(fc.constantFrom("r1", "r2", "r3", "r4", "r5", "r6"), {
      maxLength: 6,
    }),
    airDate: fc.constantFrom("2026-11-26", "2026-11-27"),
    targetMs: fc.option(fc.constantFrom(1_800_000, 3_600_000), { nil: null }),
    useShow: fc.boolean(),
  })
  .chain(({ ids, airDate, targetMs, useShow }) =>
    fc
      .tuple(...ids.map((id, i) => arbRow(id, String.fromCharCode(97 + i))))
      .map((rows) =>
        rundown(rows, {
          rundown: { ...DEFAULT_FIELDS, airDate, targetMs },
          columns: useShow ? [...SHOW_COLUMNS] : [...NEWS_COLUMNS],
        }),
      ),
  );

test("planned restore converges cleanly to target, is idempotent, and preserves server-only fields", () => {
  fc.assert(
    fc.property(
      arbRundown,
      arbRundown,
      fc.constantFrom<RundownRestoreScope>(
        { kind: "all" },
        { kind: "row", rowId: "r1" },
        { kind: "row", rowId: "r3" },
      ),
      (current, target, scope) => {
        const plan = planRundownRestore(current, target, scope, OPTS);
        // Re-assign synthetic ascending order keys to plan.result so compareRundowns reads its row order
        const orderedResult: RundownJSON = {
          ...plan.result,
          rows: plan.result.rows.map((item, i) => ({
            ...item,
            order: String.fromCharCode(65 + i),
          })),
        };
        if (scope.kind === "all") {
          expect(compareRundowns(orderedResult, target).hasChanges).toBe(false);
          const again = planRundownRestore(orderedResult, target, scope, OPTS);
          expect(again.ops).toEqual([]);
          expect(again.applied).toBe(0);
        } else {
          const again = planRundownRestore(orderedResult, target, scope, OPTS);
          expect(again.ops).toEqual([]);
          expect(again.applied).toBe(0);
          expect(orderedResult.rundown).toEqual(current.rundown);
          expect(orderedResult.columns).toEqual(current.columns);
        }
        // Surviving rows never lose their live durationMs or prompter
        const currentById = new Map(
          current.rows.map((item) => [item.id, item]),
        );
        for (const item of orderedResult.rows) {
          const prev = currentById.get(item.id);
          if (prev !== undefined) {
            expect(item.durationMs).toBe(prev.durationMs);
            expect(item.prompter).toEqual(prev.prompter);
          } else {
            expect(item.durationMs).toBeNull();
            expect(item.prompter).toBeNull();
          }
        }
      },
    ),
    { numRuns: 500 },
  );
});
