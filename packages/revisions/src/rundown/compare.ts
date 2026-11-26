// Two rundown versions compared row by row with LIS minimal-move alignment, per-cell diffs and broadcast field diffs.
import type {
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import { longestIncreasingSubsequence } from "../compare/align.ts";

/** Stored columns whose cell values are compared and restored. */
export const STORED_RUNDOWN_COLUMNS: readonly RundownColumnId[] = Object.freeze(
  ["segment", "story", "writer", "presenter", "type", "dur"] as const,
);

/** Broadcast-level fields on `RundownFieldsJSON`, in declared order. */
export const RUNDOWN_FIELD_KEYS = Object.freeze([
  "airDate",
  "airAt",
  "windowLeadMs",
  "targetMs",
] as const);
export type RundownFieldKey = (typeof RUNDOWN_FIELD_KEYS)[number];

/** Client-owned row metadata fields compared for edit status. */
export const RUNDOWN_ROW_META_KEYS = Object.freeze([
  "kind",
  "docId",
  "blockId",
  "unnumbered",
] as const);
export type RundownRowMetaKey = (typeof RUNDOWN_ROW_META_KEYS)[number];

/** Server-computed row fields excluded from edit status and restore writes. */
export const RUNDOWN_SERVER_KEYS = Object.freeze([
  "durationMs",
  "prompter",
] as const);
export type RundownServerKey = (typeof RUNDOWN_SERVER_KEYS)[number];

/** One stored cell whose value differs between the two rundown versions. */
export interface RundownCellDiff {
  readonly columnId: RundownColumnId;
  readonly before: string | number | null;
  readonly after: string | number | null;
  readonly beforeCell: RundownCellJSON | null;
  readonly afterCell: RundownCellJSON | null;
}

/** One broadcast field on `rundown` whose value differs between the two versions. */
export interface RundownFieldDiff {
  readonly field: RundownFieldKey;
  readonly before: RundownFieldsJSON[RundownFieldKey];
  readonly after: RundownFieldsJSON[RundownFieldKey];
}

/** One row aligned across `before` and `after`. */
export interface RundownRowDiff {
  readonly id: string;
  readonly kind: "unchanged" | "added" | "removed" | "changed";
  /** True when the row sits outside the LIS minimal-move alignment (unchanged or changed only). */
  readonly moved: boolean;
  readonly before: RundownRowJSON | null;
  readonly after: RundownRowJSON | null;
  /** Stored cells whose values changed (changed rows only). */
  readonly cells: readonly RundownCellDiff[];
  /** Client-owned row metadata keys that changed (changed rows only). */
  readonly fields: readonly RundownRowMetaKey[];
  /** Informational diffs on server-only keys; never affect `kind`, `moved`, `counts` or `hasChanges`. */
  readonly serverFields: readonly RundownServerKey[];
  /** Position in `before` (0-based); null for added rows. */
  readonly beforeIndex: number | null;
  /** Position in `after` (0-based); null for removed rows. */
  readonly afterIndex: number | null;
  /** Removed rows only: nearest earlier `before` row that `after` also holds (null at start). */
  readonly afterRowId: string | null;
}

/** Comparison of two rundown versions: rows, broadcast fields, columns and counts. */
export interface RundownComparison {
  readonly v: 1;
  /** In `after` order, each removed row right before the next `before` row that keeps its place. */
  readonly rows: readonly RundownRowDiff[];
  readonly fields: readonly RundownFieldDiff[];
  readonly columnsChanged: boolean;
  readonly counts: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly moved: number;
    readonly fields: number;
  };
  readonly hasChanges: boolean;
}

/** Plain code-unit string comparison matching base-62 order keys. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Returns rows sorted canonically by `order`, then `id`, without mutating the input. */
export function sortRundownRows(
  rows: readonly RundownRowJSON[],
): RundownRowJSON[] {
  return rows.toSorted(
    (a, b) => compareStrings(a.order, b.order) || compareStrings(a.id, b.id),
  );
}

interface RundownSide {
  readonly rows: readonly RundownRowJSON[];
  readonly ids: readonly string[];
  readonly at: Map<string, number>;
}

function sideOf(
  rows: readonly RundownRowJSON[],
  label: "before" | "after",
): RundownSide {
  const sorted = sortRundownRows(rows);
  const owned = new Set<string>();
  const at = new Map<string, number>();
  const ids = sorted.map((row, index) => {
    if (owned.has(row.id)) return `#${label}:${index}`;
    owned.add(row.id);
    at.set(row.id, index);
    return row.id;
  });
  return { rows: sorted, ids, at };
}

function diffCells(
  before: RundownRowJSON,
  after: RundownRowJSON,
): RundownCellDiff[] {
  const diffs: RundownCellDiff[] = [];
  for (const columnId of STORED_RUNDOWN_COLUMNS) {
    const beforeCell = before.cells[columnId] ?? null;
    const afterCell = after.cells[columnId] ?? null;
    const beforeVal = beforeCell?.value ?? null;
    const afterVal = afterCell?.value ?? null;
    if (beforeVal !== afterVal) {
      diffs.push(
        Object.freeze({
          columnId,
          before: beforeVal,
          after: afterVal,
          beforeCell,
          afterCell,
        }),
      );
    }
  }
  return diffs;
}

function diffRowMeta(
  before: RundownRowJSON,
  after: RundownRowJSON,
): RundownRowMetaKey[] {
  const changed: RundownRowMetaKey[] = [];
  for (const key of RUNDOWN_ROW_META_KEYS)
    if (before[key] !== after[key]) changed.push(key);
  return changed;
}

function samePrompter(
  a: RundownRowJSON["prompter"],
  b: RundownRowJSON["prompter"],
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.state === b.state &&
    a.versionId === b.versionId &&
    a.sentAt === b.sentAt &&
    a.sentByUserId === b.sentByUserId
  );
}

function diffServerFields(
  before: RundownRowJSON,
  after: RundownRowJSON,
): RundownServerKey[] {
  const changed: RundownServerKey[] = [];
  if (before.durationMs !== after.durationMs) changed.push("durationMs");
  if (!samePrompter(before.prompter, after.prompter)) changed.push("prompter");
  return changed;
}

function diffBroadcastFields(
  before: RundownFieldsJSON,
  after: RundownFieldsJSON,
): RundownFieldDiff[] {
  const diffs: RundownFieldDiff[] = [];
  for (const field of RUNDOWN_FIELD_KEYS) {
    if (before[field] !== after[field]) {
      diffs.push(
        Object.freeze({
          field,
          before: before[field],
          after: after[field],
        }),
      );
    }
  }
  return diffs;
}

function sameColumns(
  a: readonly RundownColumnId[],
  b: readonly RundownColumnId[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const EMPTY_CELLS: readonly RundownCellDiff[] = Object.freeze([]);
const EMPTY_META: readonly RundownRowMetaKey[] = Object.freeze([]);
const EMPTY_SERVER: readonly RundownServerKey[] = Object.freeze([]);

interface Removal {
  readonly beforeIndex: number;
  readonly afterRowId: string | null;
}

/** Whether a row diff represents a user-editable change (added, removed, changed or moved). */
export function isRundownRowChange(row: RundownRowDiff): boolean {
  return row.kind !== "unchanged" || row.moved;
}

/**
 * Compares two rundown snapshots with LIS minimal-move row alignment, per-cell
 * value diffs, client-owned row metadata diffs, broadcast field diffs and
 * column diffs. Server-only `durationMs` and `prompter` never mark a row as
 * edited.
 */
export function compareRundowns(
  before: RundownJSON,
  after: RundownJSON,
): RundownComparison {
  const oldSide = sideOf(before.rows, "before");
  const newSide = sideOf(after.rows, "after");
  const positions = newSide.ids.flatMap((id) => {
    const idx = oldSide.at.get(id);
    return idx === undefined ? [] : [idx];
  });
  const staying = new Set(
    longestIncreasingSubsequence(positions).map((k) => positions[k]!),
  );
  // for each `before` row, the next one after it that stays in relative order
  const reversed: (string | null)[] = [];
  let nextStaying: string | null = null;
  for (let i = oldSide.ids.length - 1; i >= 0; i--) {
    reversed.push(nextStaying);
    if (staying.has(i)) nextStaying = oldSide.ids[i]!;
  }
  const precedes = reversed.toReversed();
  const removedBefore = new Map<string | null, Removal[]>();
  let afterRowId: string | null = null;
  oldSide.ids.forEach((id, i) => {
    if (newSide.at.has(id)) {
      afterRowId = id;
      return;
    }
    const anchor = precedes[i]!;
    const bucket = removedBefore.get(anchor);
    if (bucket === undefined)
      removedBefore.set(anchor, [{ beforeIndex: i, afterRowId }]);
    else bucket.push({ beforeIndex: i, afterRowId });
  });

  const rows: RundownRowDiff[] = [];
  const counts = { added: 0, removed: 0, changed: 0, moved: 0, fields: 0 };

  const pushRemoved = (anchor: string | null): void => {
    for (const removal of removedBefore.get(anchor) ?? []) {
      const id = oldSide.ids[removal.beforeIndex]!;
      rows.push(
        Object.freeze({
          id,
          kind: "removed",
          moved: false,
          before: oldSide.rows[removal.beforeIndex]!,
          after: null,
          cells: EMPTY_CELLS,
          fields: EMPTY_META,
          serverFields: EMPTY_SERVER,
          beforeIndex: removal.beforeIndex,
          afterIndex: null,
          afterRowId: removal.afterRowId,
        }),
      );
      counts.removed++;
    }
  };

  for (let j = 0; j < newSide.ids.length; j++) {
    const id = newSide.ids[j]!;
    const newerRow = newSide.rows[j]!;
    const i = oldSide.at.get(id);
    if (i !== undefined && staying.has(i)) pushRemoved(id);
    if (i === undefined) {
      rows.push(
        Object.freeze({
          id,
          kind: "added",
          moved: false,
          before: null,
          after: newerRow,
          cells: EMPTY_CELLS,
          fields: EMPTY_META,
          serverFields: EMPTY_SERVER,
          beforeIndex: null,
          afterIndex: j,
          afterRowId: null,
        }),
      );
      counts.added++;
      continue;
    }
    const olderRow = oldSide.rows[i]!;
    const cells = diffCells(olderRow, newerRow);
    const meta = diffRowMeta(olderRow, newerRow);
    const serverFields = diffServerFields(olderRow, newerRow);
    const kind = cells.length > 0 || meta.length > 0 ? "changed" : "unchanged";
    const moved = !staying.has(i);
    rows.push(
      Object.freeze({
        id,
        kind,
        moved,
        before: olderRow,
        after: newerRow,
        cells: Object.freeze(cells),
        fields: Object.freeze(meta),
        serverFields: Object.freeze(serverFields),
        beforeIndex: i,
        afterIndex: j,
        afterRowId: null,
      }),
    );
    if (kind === "changed") counts.changed++;
    if (moved) counts.moved++;
  }
  pushRemoved(null);

  const fields = diffBroadcastFields(before.rundown, after.rundown);
  counts.fields = fields.length;
  const columnsChanged = !sameColumns(before.columns, after.columns);
  const hasChanges =
    counts.added > 0 ||
    counts.removed > 0 ||
    counts.changed > 0 ||
    counts.moved > 0 ||
    counts.fields > 0 ||
    columnsChanged;

  return Object.freeze({
    v: 1,
    rows,
    fields: Object.freeze(fields),
    columnsChanged,
    counts: Object.freeze(counts),
    hasChanges,
  });
}
