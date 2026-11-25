// Pure export model for a rundown: row-range validation and filtering, cell formatting, checks and story lists.
import type {
  RundownExportRow,
  RundownExportStory,
  RundownForExport,
} from "@manent/formats";
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import type { Engine, RowTiming, RundownClock } from "@manent/pagination";
import type {
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import {
  EDITOR_WORDS,
  RUNDOWN_SEND_WORDS,
  RUNDOWN_WORDS,
  formatClockTime,
  formatDate,
  formatDay,
  formatDuration,
  formatTime,
  joinNames,
} from "@manent/ui";
import type { MissingStoryRow } from "@manent/ui";
import { parseIsoDate } from "../create-rundown.ts";
import { rowTitleOf } from "../dur-format.ts";

const WHOLE_NUMBER = /^[0-9]+$/;
const MAX_SHOWN_OFF_FONT = 12;

export type RowRangeValidation =
  | { readonly ok: true; readonly from: number; readonly to: number }
  | { readonly ok: false; readonly message: string };

/** Highest numbered row in `clock`, or 0 when the rundown has no numbered rows. */
export function maxRowNumberOf(clock: RundownClock | null): number {
  if (clock === null) return 0;
  let max = 0;
  for (const row of clock.rows) {
    if (row.number !== null && row.number > max) max = row.number;
  }
  return max;
}

/** Validates the `Rows {from} to {to}` fields against `maxRowNumber`. */
export function validateRowRange(
  fromText: string,
  toText: string,
  maxRowNumber: number,
): RowRangeValidation {
  if (maxRowNumber <= 0) return { ok: false, message: "" };
  const fromRaw = fromText.trim();
  const from = WHOLE_NUMBER.test(fromRaw) ? Number(fromRaw) : Number.NaN;
  if (!Number.isSafeInteger(from) || from < 1 || from > maxRowNumber) {
    return {
      ok: false,
      message: RUNDOWN_SEND_WORDS.rowOutOfRange(
        fromRaw === "" ? "0" : fromRaw,
        maxRowNumber,
      ),
    };
  }
  const toRaw = toText.trim();
  const to = WHOLE_NUMBER.test(toRaw) ? Number(toRaw) : Number.NaN;
  if (!Number.isSafeInteger(to) || to < 1 || to > maxRowNumber) {
    return {
      ok: false,
      message: RUNDOWN_SEND_WORDS.rowOutOfRange(
        toRaw === "" ? "0" : toRaw,
        maxRowNumber,
      ),
    };
  }
  if (from > to) {
    return { ok: false, message: RUNDOWN_SEND_WORDS.firstBeforeLast };
  }
  return { ok: true, from, to };
}

/** Filters rundown rows to `range` by row number; header rows between them stay with their section. */
export function filterRundownRows(
  rows: readonly RundownRowJSON[],
  clock: RundownClock,
  range: { readonly from: number; readonly to: number } | null,
): readonly RundownRowJSON[] {
  if (range === null) return rows;
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const num = timingById.get(rows[i]!.id)?.number ?? null;
    if (num === range.from && startIdx === -1) startIdx = i;
    if (num === range.to) endIdx = i;
  }
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return [];
  return rows.slice(startIdx, endIdx + 1);
}

/** Local broadcast date `YYYY-MM-DD` formatted as `"Tue 17 Nov 2026"` for page 1 of the rundown PDF. */
export function formatAirDateFull(airDate: string): string {
  const parsed = parseIsoDate(airDate);
  if (parsed === null) return airDate.trim();
  const at = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    12,
    0,
    0,
  ).getTime();
  return `${formatDay(at)} ${formatDate(at)} ${parsed.year}`;
}

/** Local broadcast date `YYYY-MM-DD` formatted as `"17 Nov 2026"` for exported file names. */
export function formatAirDateFile(airDate: string): string {
  const parsed = parseIsoDate(airDate);
  if (parsed === null) return "";
  const at = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    12,
    0,
    0,
  ).getTime();
  return `${formatDate(at)} ${parsed.year}`;
}

/** The `"Air 18:00 · Target 59:30 · Under 0:21"` heading line for page 1 of the rundown PDF, or null when unset. */
export function summaryLineOf(
  rundown: RundownJSON,
  clock: RundownClock,
): string | null {
  const { airAt, targetMs } = rundown.rundown;
  const { overMs } = clock;
  if (airAt === null || targetMs === null || overMs === null) return null;
  const over =
    overMs < 0 ? `-${formatDuration(-overMs)}` : formatDuration(overMs);
  return RUNDOWN_WORDS.timingLine(
    formatTime(airAt),
    formatDuration(targetMs),
    over,
  );
}

function formattedCellValue(options: {
  readonly row: RundownRowJSON;
  readonly colId: RundownColumnId;
  readonly timing: RowTiming;
  readonly offlineMissing: boolean;
}): string {
  const { row, colId, timing, offlineMissing } = options;
  switch (colId) {
    case "number":
      return timing.number === null ? "" : String(timing.number);
    case "segment":
    case "story":
    case "writer":
    case "presenter":
    case "type": {
      const value = row.cells[colId]?.value;
      return typeof value === "string" ? value : "";
    }
    case "dur":
      return offlineMissing
        ? RUNDOWN_WORDS.dash
        : timing.durMs === null
          ? ""
          : formatDuration(timing.durMs);
    case "cume":
      return offlineMissing
        ? RUNDOWN_WORDS.dash
        : timing.cumeMs === null
          ? ""
          : formatDuration(timing.cumeMs);
    case "start":
      return offlineMissing
        ? RUNDOWN_WORDS.dash
        : timing.startAt === null
          ? ""
          : formatClockTime(timing.startAt);
    case "back":
      return offlineMissing
        ? RUNDOWN_WORDS.dash
        : timing.backAt === null
          ? ""
          : formatClockTime(timing.backAt);
    case "prompter":
      return row.kind === "script" &&
        row.docId !== null &&
        row.prompter !== null
        ? ""
        : RUNDOWN_WORDS.dash;
  }
}

/** Builds `RundownForExport` for the chosen rows, leaving offline-missing stories out (`story: null`). */
export function buildRundownForExport(options: {
  readonly title: string;
  readonly rundown: RundownJSON;
  readonly clock: RundownClock;
  readonly rows: readonly RundownRowJSON[];
  readonly allColumns: readonly RundownColumnId[];
  readonly titleColumn: "segment" | "story";
  readonly stories: ReadonlyMap<string, RundownExportStory>;
  readonly missingDocIds: ReadonlySet<string>;
}): RundownForExport {
  const {
    title,
    rundown,
    clock,
    rows,
    allColumns,
    titleColumn,
    stories,
    missingDocIds,
  } = options;
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));

  const exportRows: RundownExportRow[] = rows.map((row) => {
    const timing: RowTiming = timingById.get(row.id) ?? {
      id: row.id,
      number: null,
      durMs: null,
      cumeMs: null,
      startAt: null,
      backAt: null,
    };
    if (row.kind === "header") {
      return {
        number: null,
        kind: "header",
        cells: { [titleColumn]: rowTitleOf(row) },
        story: null,
      };
    }
    const missing =
      row.kind === "script" &&
      row.docId !== null &&
      missingDocIds.has(row.docId);
    const story =
      row.kind === "script" && row.docId !== null && !missing
        ? (stories.get(row.docId) ?? null)
        : null;
    const cells: Record<string, string> = {};
    for (const colId of allColumns) {
      cells[colId] = formattedCellValue({
        row,
        colId,
        timing,
        offlineMissing: missing,
      });
    }
    return {
      number: timing.number,
      kind: "story",
      cells,
      story,
    };
  });

  return {
    title,
    airDate: rundown.rundown.airDate,
    columns: allColumns.map((id) => ({ id, label: RUNDOWN_WORDS.columns[id] })),
    rows: exportRows,
  };
}

/** Stories in `rows` that are not on this device, formatted for `S3-RX-10`. */
export function collectMissingRows(
  rows: readonly RundownRowJSON[],
  clock: RundownClock,
  missingDocIds: ReadonlySet<string>,
): readonly MissingStoryRow[] {
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));
  const missing: MissingStoryRow[] = [];
  for (const row of rows) {
    if (row.kind !== "script" || row.docId === null) continue;
    if (!missingDocIds.has(row.docId)) continue;
    const number = timingById.get(row.id)?.number ?? null;
    if (number !== null) {
      missing.push({ kind: "numbered", number });
    } else {
      missing.push({
        kind: "unnumbered",
        title: rowTitleOf(row) || RUNDOWN_WORDS.dash,
      });
    }
  }
  return missing;
}

function addOffFontClusters(
  engine: Engine,
  text: string,
  found: Set<string>,
): void {
  const runs = engine.offFontRanges(text);
  if (runs.length === 0) return;
  let run = 0;
  for (let at = 0; at < text.length && run < runs.length;) {
    const end = engine.graphemeEnd(text, at);
    while (run < runs.length && runs[run + 1]! <= at) run += 2;
    if (
      run < runs.length &&
      runs[run]! < end &&
      engine.clusterCells(text, at, end, false) > 0
    )
      found.add(text.slice(at, end));
    at = end;
  }
}

/** Collects characters outside the script font across rundown cells and loaded stories; null when none. */
export function collectOutsideFontSentence(
  rundown: RundownForExport,
  dateLabel: string,
  summaryLine: string | null,
): string | null {
  const baseEngine = engineFor(ENGINE_VERSION);
  if (baseEngine === null) return null;
  const found = new Set<string>();
  addOffFontClusters(baseEngine, rundown.title, found);
  addOffFontClusters(baseEngine, dateLabel, found);
  if (summaryLine !== null) addOffFontClusters(baseEngine, summaryLine, found);
  for (const col of rundown.columns) {
    addOffFontClusters(baseEngine, col.label, found);
  }
  for (const row of rundown.rows) {
    for (const value of Object.values(row.cells)) {
      addOffFontClusters(baseEngine, value, found);
    }
    if (row.story !== null) {
      const storyEngine =
        engineFor(row.story.pages.engineVersion) ?? baseEngine;
      for (const block of row.story.pages.blocks) {
        addOffFontClusters(storyEngine, block.text, found);
      }
    }
  }
  if (found.size === 0) return null;
  const shown = [...found].slice(0, MAX_SHOWN_OFF_FONT);
  return EDITOR_WORDS.send.outsideFont(found.size, joinNames(shown));
}

/** Unique story document IDs actually held by `rows` on this device, in run order. */
export function includedStoryIds(
  rows: readonly RundownRowJSON[],
  stories: ReadonlyMap<string, RundownExportStory>,
  missingDocIds: ReadonlySet<string>,
): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "script" || row.docId === null) continue;
    if (missingDocIds.has(row.docId) || !stories.has(row.docId)) continue;
    if (seen.has(row.docId)) continue;
    seen.add(row.docId);
    ids.push(row.docId);
  }
  return ids;
}
