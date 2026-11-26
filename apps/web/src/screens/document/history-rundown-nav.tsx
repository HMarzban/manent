// Rundown History change-navigation builder, cell formatters, and As-it-was read-only historical grid.
import type { RundownComparison, RundownRowDiff } from "@manent/revisions";
import type {
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import {
  RUNDOWN_HISTORY_WORDS,
  RUNDOWN_WORDS,
  formatClockTime,
  formatDuration,
} from "@manent/ui";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { columnMenuLabel } from "../../rundown/columns.tsx";
import { rowTitleOf } from "../../rundown/dur-format.ts";
import { buildRundownClock } from "../../rundown/rundown-access.ts";

export interface RundownNavChange {
  readonly key: string;
  readonly rowId: string;
  readonly columnId: RundownColumnId | null;
  readonly announce: (index: number, total: number) => string;
}

export function formatRundownCellValue(
  columnId: RundownColumnId,
  value: string | number | null,
): string {
  if (value === null || value === "") return RUNDOWN_HISTORY_WORDS.emptyValue;
  if (columnId === "dur" && typeof value === "number")
    return formatDuration(value);
  return String(value);
}

export function rundownCellText(
  row: RundownRowJSON,
  colId: RundownColumnId,
): string {
  const stored = row.cells[colId];
  if (colId === "dur") {
    if (typeof stored?.value === "number") return formatDuration(stored.value);
    return row.durationMs === null ? "" : formatDuration(row.durationMs);
  }
  return typeof stored?.value === "string" ? stored.value : "";
}

export function rowDisplayNum(
  row: RundownRowDiff,
  fallbackIndex: number,
): number {
  return (row.afterIndex ?? row.beforeIndex ?? fallbackIndex) + 1;
}

/** Builds ordered navigable changes for `Previous change` / `Next change` and screen-reader announcements. */
export function buildRundownNavChanges(
  comparison: RundownComparison,
): readonly RundownNavChange[] {
  const list: RundownNavChange[] = [];
  comparison.rows.forEach((rowDiff, idx) => {
    const sample = rowDiff.after ?? rowDiff.before;
    if (sample === null) return;
    const rowNum = rowDisplayNum(rowDiff, idx);
    const title = rowTitleOf(sample) || RUNDOWN_WORDS.rowFallback(rowNum);
    if (rowDiff.kind === "added") {
      list.push({
        key: `${rowDiff.id}:added`,
        rowId: rowDiff.id,
        columnId: null,
        announce: (i, n) =>
          RUNDOWN_HISTORY_WORDS.rowAddedAnnouncement(i, n, rowNum, title),
      });
      return;
    }
    if (rowDiff.kind === "removed") {
      list.push({
        key: `${rowDiff.id}:removed`,
        rowId: rowDiff.id,
        columnId: null,
        announce: (i, n) =>
          RUNDOWN_HISTORY_WORDS.rowRemovedAnnouncement(i, n, rowNum, title),
      });
      return;
    }
    if (rowDiff.cells.length > 0) {
      for (const cell of rowDiff.cells) {
        const colLabel = columnMenuLabel(cell.columnId);
        const oldVal = formatRundownCellValue(cell.columnId, cell.before);
        const newVal = formatRundownCellValue(cell.columnId, cell.after);
        list.push({
          key: `${rowDiff.id}:${cell.columnId}`,
          rowId: rowDiff.id,
          columnId: cell.columnId,
          announce: (i, n) =>
            RUNDOWN_HISTORY_WORDS.changeAnnouncement(
              i,
              n,
              rowNum,
              title,
              colLabel,
              oldVal,
              newVal,
            ),
        });
      }
      return;
    }
    if (rowDiff.moved) {
      const fromNum = (rowDiff.beforeIndex ?? idx) + 1;
      list.push({
        key: `${rowDiff.id}:moved`,
        rowId: rowDiff.id,
        columnId: null,
        announce: (i, n) =>
          RUNDOWN_HISTORY_WORDS.rowMovedAnnouncement(
            i,
            n,
            rowNum,
            title,
            fromNum,
          ),
      });
    }
  });
  return list;
}

/** Read-only historical rundown grid (`As it was`) with historical timing clock. */
export function AsItWasGrid(props: {
  readonly rundown: RundownJSON;
  readonly columns: readonly RundownColumnId[];
}): ReactNode {
  const clock = useMemo(
    () => buildRundownClock(props.rundown, () => null),
    [props.rundown],
  );
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));
  return (
    <div role="grid" className="divide-y divide-line text-ui">
      <div
        role="row"
        className="mn-table-head flex items-center gap-2 border-b border-line bg-chrome px-3 py-1.5 text-micro font-medium text-fg-muted"
      >
        {props.columns.map((col) => (
          <span
            key={col}
            role="columnheader"
            className="min-w-14 flex-1 truncate"
          >
            {RUNDOWN_WORDS.columns[col]}
          </span>
        ))}
      </div>
      {props.rundown.rows.map((row) => {
        const timing = timingById.get(row.id);
        return (
          <div
            key={row.id}
            role="row"
            className="flex items-center gap-2 px-3 py-1.5"
          >
            {props.columns.map((col) => {
              let text = "";
              if (col === "number")
                text = timing?.number == null ? "" : String(timing.number);
              else if (col === "cume")
                text =
                  timing?.cumeMs == null ? "" : formatDuration(timing.cumeMs);
              else if (col === "start")
                text =
                  timing?.startAt == null
                    ? ""
                    : formatClockTime(timing.startAt);
              else if (col === "back")
                text =
                  timing?.backAt == null ? "" : formatClockTime(timing.backAt);
              else text = rundownCellText(row, col);
              return (
                <div
                  key={col}
                  role="gridcell"
                  className="min-w-14 flex-1 truncate text-fg"
                >
                  {text}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
