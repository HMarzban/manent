// Front and back timing for a rundown's rows, its total and over/under, and its air window.
import type { RowKind } from "@manent/schema";

/** One rundown row in run order, with its server-computed and manually typed durations in milliseconds. */
export interface ClockRow {
  id: string;
  kind: RowKind;
  durationMs: number | null;
  typedMs: number | null;
  unnumbered: boolean;
}

/** Timing inputs for a rundown: air time in epoch milliseconds, target length, window lead and rows in run order. */
export interface ClockInput {
  airAt: number | null;
  targetMs: number | null;
  windowLeadMs: number;
  rows: readonly ClockRow[];
}

/** Computed numbering and front/back times for one row; every figure is null on a header row. */
export interface RowTiming {
  id: string;
  number: number | null;
  durMs: number | null;
  cumeMs: number | null;
  startAt: number | null;
  backAt: number | null;
}

/** Timing summary for a whole rundown; `overMs` is positive when over target and negative when under. */
export interface RundownClock {
  rows: RowTiming[];
  totalMs: number;
  overMs: number | null;
  airWindow: { startsAt: number; endsAt: number } | null;
}

function isTimedRow(kind: RowKind): boolean {
  switch (kind) {
    case "header":
      return false;
    case "item":
    case "script":
      return true;
  }
}

function rowDurationMs(row: ClockRow): number | null {
  return row.typedMs ?? row.durationMs;
}

function sumTotalMs(rows: readonly ClockRow[]): number {
  let totalMs = 0;
  for (const row of rows) {
    if (!isTimedRow(row.kind)) continue;
    totalMs += rowDurationMs(row) ?? 0;
  }
  return totalMs;
}

/**
 * Computes row numbers, durations, cumulative totals, front-timed start instants, back-timed
 * start instants, overall over/under and the air window for a rundown in run order.
 * Start and back times are null without `airAt`, and back times and `overMs` are null without `targetMs`.
 */
export function timeRundown(input: ClockInput): RundownClock {
  const { airAt, targetMs, windowLeadMs, rows } = input;
  const totalMs = sumTotalMs(rows);
  const overMs = targetMs === null ? null : totalMs - targetMs;
  const airWindow =
    airAt === null
      ? null
      : {
          startsAt: airAt - windowLeadMs,
          endsAt: airAt + Math.max(targetMs ?? 0, totalMs),
        };

  const timedRows: RowTiming[] = [];
  let cumeMs = 0;
  let nextNumber = 1;

  for (const row of rows) {
    if (!isTimedRow(row.kind)) {
      timedRows.push({
        id: row.id,
        number: null,
        durMs: null,
        cumeMs: null,
        startAt: null,
        backAt: null,
      });
      continue;
    }

    const durMs = rowDurationMs(row);
    const beforeMs = cumeMs;
    cumeMs += durMs ?? 0;

    let number: number | null = null;
    if (!row.unnumbered) {
      number = nextNumber;
      nextNumber += 1;
    }

    const startAt = airAt === null ? null : airAt + beforeMs;
    const backAt =
      airAt === null || targetMs === null
        ? null
        : airAt + targetMs - (totalMs - beforeMs);

    timedRows.push({
      id: row.id,
      number,
      durMs,
      cumeMs,
      startAt,
      backAt,
    });
  }

  return { rows: timedRows, totalMs, overMs, airWindow };
}
