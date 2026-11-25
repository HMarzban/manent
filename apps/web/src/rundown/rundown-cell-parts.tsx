// Reusable cell-rendering pieces for the rundown grid: Dur cell, presence badges and corner marks.
import type { RowTiming } from "@manent/pagination";
import type { RundownCellJSON, RundownRowJSON } from "@manent/schema";
import { Avatar, RUNDOWN_WORDS, formatDuration, formatTime } from "@manent/ui";
import type { GridCell, GridCornerMark } from "@manent/ui";
import type { ReactNode } from "react";
import { fullNameOf, nameOf } from "../services/sync/index-entries.ts";

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2)
    return `${parts[0]![0] ?? ""}${parts.at(-1)![0] ?? ""}`.toUpperCase();
  return fullName.slice(0, 2).toUpperCase();
}

export function presenceBadges(
  userIds: readonly string[],
  kind: "cell" | "script",
): ReactNode | undefined {
  if (userIds.length === 0) return undefined;
  const firstNames = userIds.map(nameOf);
  const label =
    kind === "script"
      ? RUNDOWN_WORDS.scriptOpen(firstNames)
      : RUNDOWN_WORDS.editingCell(firstNames);
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex items-center gap-1"
    >
      {userIds.slice(0, 3).map((uid, idx) => {
        const full = fullNameOf(uid);
        return (
          <Avatar
            key={uid}
            name={full}
            initials={initialsOf(full)}
            colour={(idx % 10) + 1}
            size="sm"
            decorative
          />
        );
      })}
    </span>
  );
}

export function cornerMarkOf(
  cell: RundownCellJSON | undefined,
  marked: boolean,
  openPrevious: () => void,
): GridCornerMark | null {
  if (!marked || cell === undefined) return null;
  return {
    label: RUNDOWN_WORDS.changedAt(nameOf(cell.userId), formatTime(cell.setAt)),
    onOpen: openPrevious,
  };
}

export function buildDurCell(options: {
  readonly row: RundownRowJSON;
  readonly timing: RowTiming;
  readonly offlineMissing: boolean;
  readonly liveMs: number | null;
  readonly presence: ReactNode | undefined;
  readonly cornerMark: GridCornerMark | null;
}): GridCell {
  const { row, timing, offlineMissing, liveMs, presence, cornerMark } = options;
  const typedRaw = row.cells.dur?.value;
  const typedMs = typeof typedRaw === "number" ? typedRaw : null;
  const editValue =
    typedMs !== null
      ? formatDuration(typedMs)
      : timing.durMs !== null
        ? formatDuration(timing.durMs)
        : "";
  if (offlineMissing) {
    return {
      value: editValue,
      display: RUNDOWN_WORDS.dash,
      presence,
      cornerMark,
    };
  }
  const formatted = timing.durMs === null ? "" : formatDuration(timing.durMs);
  if (typedMs === null && liveMs !== null) {
    const liveLabel = RUNDOWN_WORDS.liveDuration(formatted);
    return {
      value: editValue,
      display: (
        <span className="inline-flex items-center justify-end gap-1">
          <span>{formatted}</span>
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            aria-hidden="true"
            className="shrink-0 text-fg-accent"
          >
            <circle cx="3" cy="3" r="3" fill="currentColor" />
          </svg>
        </span>
      ),
      accessibleLabel: liveLabel,
      tooltip: liveLabel,
      presence,
      cornerMark,
    };
  }
  const overrideNote =
    typedMs !== null && row.kind === "script" && row.durationMs !== null
      ? RUNDOWN_WORDS.typedOverScript(formatDuration(row.durationMs))
      : undefined;
  return {
    value: formatted,
    tooltip: overrideNote,
    accessibleLabel: overrideNote ? `${formatted}. ${overrideNote}` : undefined,
    presence,
    cornerMark,
  };
}
