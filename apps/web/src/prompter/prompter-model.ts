// Pure helpers for resolving the target rundown row, row titles and per-row send trails.
import type { RundownJSON, RundownRowJSON } from "@manent/schema";
import { RUNDOWN_WORDS } from "@manent/ui";
import type { BesideOpen } from "../beside/open-beside.ts";
import { rowTitleOf } from "../rundown/dur-format.ts";
import type { RundownViewState } from "../rundown/rundown-view-store.ts";

export interface SendTrailEntry {
  readonly sentAt: number;
  readonly versionId: string | null;
}

/** Picks the row matching `beside` when a story is open beside its rundown. */
export function findRowForBeside(
  rundown: RundownJSON,
  beside: BesideOpen,
): RundownRowJSON | null {
  if (beside.kind !== "story") return null;
  if (beside.at !== null) {
    const exact = rundown.rows.find(
      (row) =>
        row.kind === "script" &&
        row.docId === beside.docId &&
        row.blockId === beside.at?.blockId,
    );
    if (exact !== undefined) return exact;
  }
  return (
    rundown.rows.find(
      (row) => row.kind === "script" && row.docId === beside.docId,
    ) ?? null
  );
}

/**
 * Resolves the script row targeted by `prompter.send` / `prompter.sendPrevious`:
 * the story open Beside first, then an inline-Send override row, then the selected or active script row.
 */
export function resolveTargetRow(
  view: RundownViewState | null,
  beside: BesideOpen | null,
  overrideRowId: string | null,
): RundownRowJSON | null {
  if (view === null || view.rundown === null) return null;
  const { rows } = view.rundown;
  if (beside !== null && beside.kind === "story") {
    return findRowForBeside(view.rundown, beside);
  }
  if (overrideRowId !== null) {
    const override = rows.find(
      (row) =>
        row.id === overrideRowId && row.kind === "script" && row.docId !== null,
    );
    if (override !== undefined) return override;
  }
  if (view.selectedRowIds.size > 0) {
    return (
      rows.find(
        (row) =>
          view.selectedRowIds.has(row.id) &&
          row.kind === "script" &&
          row.docId !== null,
      ) ?? null
    );
  }
  const activeRowId = view.activeCell?.rowId ?? null;
  if (activeRowId === null) return null;
  return (
    rows.find(
      (row) =>
        row.id === activeRowId && row.kind === "script" && row.docId !== null,
    ) ?? null
  );
}

/** Display title for a row's messages and accessible names: Segment/Story cell, else fallback row number. */
export function titleForRow(
  view: RundownViewState | null,
  rowId: string,
): string {
  const rows = view?.rundown?.rows ?? [];
  const index = rows.findIndex((candidate) => candidate.id === rowId);
  const row = index >= 0 ? rows[index] : undefined;
  if (row !== undefined) {
    const text = rowTitleOf(row);
    if (text !== "") return text;
  }
  const timing = view?.clock?.rows.find((entry) => entry.id === rowId);
  return RUNDOWN_WORDS.rowFallback(
    timing?.number ?? (index >= 0 ? index + 1 : 1),
  );
}

/** Stable selection signature so changing cell/selection/beside clears an inline-Send row override. */
export function selectionSignature(
  view: RundownViewState | null,
  beside: BesideOpen | null,
): string {
  const active =
    view?.activeCell === null || view?.activeCell === undefined
      ? ""
      : `${view.activeCell.rowId}:${view.activeCell.columnId}`;
  const selected =
    view === null ? "" : [...view.selectedRowIds].toSorted().join(",");
  const besideKey =
    beside === null
      ? ""
      : `${beside.kind}:${beside.docId}:${beside.at?.blockId ?? ""}`;
  return `${active}|${selected}|${besideKey}`;
}

/** Appends `entry` to `trail` if its timestamp is newer than the last recorded entry. */
export function recordTrailEntry(
  trails: Map<string, SendTrailEntry[]>,
  rowId: string,
  entry: SendTrailEntry,
): void {
  const list = trails.get(rowId) ?? [];
  if (list.some((item) => item.sentAt === entry.sentAt)) return;
  trails.set(
    rowId,
    [...list, entry].toSorted((a, b) => a.sentAt - b.sentAt),
  );
}

/** Finds when the restored version was originally sent from the local trail, and trims the popped head when matched. */
export function resolvePreviousFirstSentAt(
  trails: Map<string, SendTrailEntry[]>,
  rowId: string,
  versionId: string | null,
): number | null {
  const list = trails.get(rowId);
  if (list === undefined || list.length === 0) return null;
  if (versionId !== null) {
    const index = list.findIndex((item) => item.versionId === versionId);
    if (index >= 0) {
      const matched = list[index]!;
      trails.set(rowId, list.slice(0, index + 1));
      return matched.sentAt;
    }
  }
  if (list.length >= 2) {
    const previous = list[list.length - 2]!;
    trails.set(rowId, list.slice(0, list.length - 1));
    return previous.sentAt;
  }
  return null;
}
