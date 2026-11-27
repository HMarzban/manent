import { expect, test } from "bun:test";
import { createComparisonBuilder } from "@manent/revisions";
import type { BlockEntry, RundownComparison } from "@manent/revisions";
import type { RundownCellJSON, RundownRowJSON } from "@manent/schema";
import type { OutlineRow } from "../src/state/outline.store.ts";
import {
  compressHistoryTicks,
  filterHistoryMinimapItems,
  minimapChangeSummary,
  rundownMinimapItems,
  scriptMinimapItems,
} from "../src/screens/history/history-minimap-logic.ts";

const scene = (
  blockId: string,
  number: string,
  heading: string,
  kind: OutlineRow["kind"] = "scene",
): OutlineRow => ({
  blockId,
  kind,
  number,
  heading,
  synopsis: "",
  eighths: null,
  omitted: false,
  current: false,
});

const entry = (
  id: string,
  kind: BlockEntry["kind"],
  sceneId: string,
): BlockEntry => ({
  id,
  kind,
  moved: false,
  sceneId,
  older: null,
  newer: null,
  olderIndex: null,
  joinedInto: null,
  after: null,
  attrs: [],
  inline: [],
  splitFrom: null,
});

const cell = (value: string | number | null): RundownCellJSON => ({
  value,
  userId: "u1",
  setAt: 0,
  previous: null,
});

const rundownRow = (
  id: string,
  order: string,
  story: string,
  durationMs: number,
): RundownRowJSON => ({
  id,
  kind: "item",
  order,
  docId: null,
  blockId: null,
  durationMs,
  prompter: null,
  unnumbered: false,
  cells: { story: cell(story) },
});

test("scriptMinimapItems counts changes per scene and targets the first changed block", () => {
  const rows = [
    scene("s1", "1", "INT. KITCHEN - DAY"),
    scene("s2", "2", "EXT. BRIDGE - NIGHT"),
    scene("s3", "3", "INT. ROOM - DAWN"),
  ];
  const builder = createComparisonBuilder({ mode: "full" });
  builder.add(entry("b1", "unchanged", "s1"));
  builder.add(entry("b2", "added", "s2"));
  builder.add(entry("b3", "changed", "s2"));
  const comparison = builder.comparison();

  const items = scriptMinimapItems(rows, comparison);
  expect(
    items.map((item) => [item.id, item.changeCount, item.targetBlockId]),
  ).toEqual([
    ["s1", 0, "s1"],
    ["s2", 2, "b2"],
    ["s3", 0, "s3"],
  ]);
  expect(minimapChangeSummary(items)).toEqual({
    total: 3,
    changedItems: 1,
    totalChanges: 2,
  });
  expect(filterHistoryMinimapItems(items, "", true).map((i) => i.id)).toEqual([
    "s2",
  ]);
  expect(
    filterHistoryMinimapItems(items, "bridge", false).map((i) => i.id),
  ).toEqual(["s2"]);
});

test("compressHistoryTicks always retains changed scenes on long scripts", () => {
  const rows = Array.from({ length: 100 }, (_, i) =>
    scene(`s${i}`, String(i + 1), `INT. SCENE ${i + 1}`),
  );
  const builder = createComparisonBuilder({ mode: "full" });
  for (const [idx, id] of ["s17", "s63", "s88"].entries())
    builder.add(entry(`c-${idx}`, "changed", id));
  const items = scriptMinimapItems(rows, builder.comparison());
  const ticks = compressHistoryTicks(items, "s5", 20);
  const ids = ticks.map((t) => t.item.id);
  expect(ticks.length).toBeLessThanOrEqual(20);
  expect(ids).toContain("s5");
  expect(ids).toContain("s17");
  expect(ids).toContain("s63");
  expect(ids).toContain("s88");
});

test("rundownMinimapItems maps added, removed, edited, and moved rundown rows", () => {
  const comparison: RundownComparison = {
    v: 1,
    fields: [],
    columnsChanged: false,
    counts: { added: 1, removed: 0, changed: 1, moved: 1, fields: 0 },
    hasChanges: true,
    rows: [
      {
        id: "r1",
        kind: "unchanged",
        moved: false,
        beforeIndex: 0,
        afterIndex: 0,
        before: rundownRow("r1", "a0", "Intro", 30_000),
        after: rundownRow("r1", "a0", "Intro", 30_000),
        cells: [],
        fields: [],
        serverFields: [],
        afterRowId: null,
      },
      {
        id: "r2",
        kind: "changed",
        moved: true,
        beforeIndex: 2,
        afterIndex: 1,
        before: rundownRow("r2", "a1", "Weather", 45_000),
        after: rundownRow("r2", "a1", "Storm", 60_000),
        cells: [
          {
            columnId: "story",
            before: "Weather",
            after: "Storm",
            beforeCell: cell("Weather"),
            afterCell: cell("Storm"),
          },
          {
            columnId: "dur",
            before: 45_000,
            after: 60_000,
            beforeCell: cell(45_000),
            afterCell: cell(60_000),
          },
        ],
        fields: [],
        serverFields: [],
        afterRowId: null,
      },
      {
        id: "r3",
        kind: "added",
        moved: false,
        beforeIndex: null,
        afterIndex: 2,
        before: null,
        after: rundownRow("r3", "a2", "Closer", 20_000),
        cells: [],
        fields: [],
        serverFields: [],
        afterRowId: null,
      },
    ],
  };
  const items = rundownMinimapItems(null, comparison);
  expect(
    items.map((item) => [item.id, item.heading, item.changeCount]),
  ).toEqual([
    ["r1", "Intro", 0],
    ["r2", "Storm", 3],
    ["r3", "Closer", 1],
  ]);
});
