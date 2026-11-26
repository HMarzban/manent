// Rundown version summaries, per-row/cell author attribution and changedSince helpers.
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  readRundown,
  readRundownWrites,
} from "@manent/crdt";
import {
  STORED_RUNDOWN_COLUMNS,
  compareRundowns,
  isRundownRowChange,
} from "@manent/revisions";
import type {
  RundownCellJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import type { DocFile, DocumentRow, VersionSummary } from "@manent/storage";
import type {
  SinceResponse,
  VersionAuthor,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import { corruptError } from "./chunks.ts";

/** Empty rundown baseline used when comparing the very first version of a rundown. */
export const EMPTY_RUNDOWN: RundownJSON = Object.freeze({
  rundown: Object.freeze({
    airDate: "",
    airAt: null,
    windowLeadMs: 3_600_000,
    targetMs: null,
  }),
  columns: [],
  rows: [],
});

/** One row or cell's last change on a rundown. */
export interface RundownLastChange {
  userId: string;
  at: number;
  previous: string | null;
  exact: boolean;
}

const isAtOrBefore = (at: VersionPosition, since: VersionPosition): boolean =>
  at.generation < since.generation ||
  (at.generation === since.generation && at.seq <= since.seq);

const formatCellVal = (value: string | number | null): string | null =>
  value === null ? null : String(value);

/** The cell on `row` with the most recent `setAt`, breaking ties by stored column order. */
export function latestRundownCell(row: RundownRowJSON): RundownCellJSON | null {
  let best: RundownCellJSON | null = null;
  for (const col of STORED_RUNDOWN_COLUMNS) {
    const cell = row.cells[col];
    if (cell === undefined) continue;
    if (best === null || cell.setAt > best.setAt) best = cell;
  }
  return best;
}

/** The last known writer of `row` from its stored cells, or null when no cell has been written. */
export function rundownRowAuthor(row: RundownRowJSON): VersionAuthor | null {
  const cell = latestRundownCell(row);
  return cell === null ? null : { userId: cell.userId, at: cell.setAt };
}

/**
 * Per-row authors for a rundown snapshot: the latest cell author on each row,
 * falling back to `previous` when unchanged or `fallback` otherwise.
 */
export function carryRundownAuthors(
  rundown: RundownJSON,
  previous: VersionContent | null,
  fallback: VersionAuthor | null,
): Record<string, VersionAuthor> {
  const prevAuthors = previous?.authors ?? {};
  const changedIds = new Set(
    previous?.rundown === undefined
      ? rundown.rows.map((row) => row.id)
      : compareRundowns(previous.rundown, rundown)
          .rows.filter(isRundownRowChange)
          .map((entry) => entry.id),
  );
  const authors = new Map<string, VersionAuthor>();
  for (const row of rundown.rows) {
    const fromCells = rundownRowAuthor(row);
    if (fromCells !== null) authors.set(row.id, fromCells);
    else if (!changedIds.has(row.id) && Object.hasOwn(prevAuthors, row.id))
      authors.set(row.id, prevAuthors[row.id]!);
    else if (fallback !== null) authors.set(row.id, fallback);
  }
  return Object.fromEntries(authors);
}

/** What `content` changed in a rundown since `previous` (null: empty rundown). */
export function summarizeRundownVersion(
  previous: VersionContent | null,
  content: VersionContent,
  authorIds: string[],
): VersionSummary {
  const comparison = compareRundowns(
    previous?.rundown ?? EMPTY_RUNDOWN,
    content.rundown ?? EMPTY_RUNDOWN,
  );
  const blockIds = [
    ...comparison.rows.filter(isRundownRowChange).map((entry) => entry.id),
    ...comparison.fields.map((diff) => `#field:${diff.field}`),
    ...(comparison.columnsChanged ? ["#columns"] : []),
  ];
  return { authorIds, blockIds, sceneIds: [] };
}

/** Whether `content` holds no user-editable changes compared to `previous`. */
export function isContentUnchanged(
  previous: { content: VersionContent | null } | null,
  content: VersionContent,
  summary: VersionSummary,
): boolean {
  if (previous === null || previous.content === null) return false;
  if (content.rundown !== undefined) {
    if (previous.content.rundown === undefined) return false;
    return !compareRundowns(previous.content.rundown, content.rundown)
      .hasChanges;
  }
  return (
    summary.blockIds.length === 0 &&
    JSON.stringify(previous.content.settings) ===
      JSON.stringify(content.settings)
  );
}

function cellChangeOf(cell: RundownCellJSON): RundownLastChange {
  return {
    userId: cell.userId,
    at: cell.setAt,
    previous:
      cell.previous === null ? null : formatCellVal(cell.previous.value),
    exact: true,
  };
}

function lookupHeadRundown(
  rundown: RundownJSON,
  id: string,
): RundownLastChange | null {
  const sep = id.indexOf(":");
  if (sep !== -1) {
    const rowId = id.slice(0, sep);
    const colId = id.slice(sep + 1);
    const row = rundown.rows.find((r) => r.id === rowId);
    const cell =
      row === undefined
        ? undefined
        : row.cells[colId as keyof RundownRowJSON["cells"]];
    return cell === undefined ? null : cellChangeOf(cell);
  }
  const row = rundown.rows.find((r) => r.id === id);
  if (row === undefined) return null;
  const cell = latestRundownCell(row);
  return cell === null ? null : cellChangeOf(cell);
}

/**
 * Per-row or `rowId:columnId` last change after `since` (null: ever) for a rundown,
 * combining exact log tail inspection (`readRundownWrites`) with stored cell attribution.
 */
export function rundownLastChanges(
  file: DocFile,
  row: DocumentRow,
  wanted: ReadonlySet<string>,
  since: VersionPosition | null,
): Map<string, RundownLastChange> {
  const { id: docId, generation } = row;
  const checkpoint = file.checkpoints.newest(docId, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const found = new Map<string, RundownLastChange>();
  try {
    const tail = file.log.tail(docId, generation, checkpoint?.seq ?? 0, {
      quarantine: false,
    });
    if (tail.corrupt.length > 0) throw corruptError();
    for (const { seq, update, userId, createdAt } of tail.rows) {
      doc.applyUpdate(update, ORIGIN_LOAD);
      if (userId === SYSTEM_USER_ID) continue;
      if (since !== null && isAtOrBefore({ generation, seq }, since)) continue;
      let writes;
      try {
        writes = readRundownWrites(doc, update);
      } catch {
        continue;
      }
      for (const rw of writes.rows) {
        const clientKeys = rw.keys.filter(
          (k) => k !== "durationMs" && k !== "prompter",
        );
        if (
          wanted.has(rw.rowId) &&
          (rw.removed || rw.cells.length > 0 || clientKeys.length > 0)
        ) {
          found.set(rw.rowId, {
            userId,
            at: createdAt,
            previous: null,
            exact: true,
          });
        }
        for (const c of rw.cells) {
          const cellKey = `${rw.rowId}:${c.columnId}`;
          if (wanted.has(cellKey))
            found.set(cellKey, {
              userId,
              at: createdAt,
              previous: null,
              exact: true,
            });
        }
      }
    }
    const head = readRundown(doc);
    for (const id of wanted) {
      const fromCell = lookupHeadRundown(head, id);
      const fromLog = found.get(id);
      if (fromLog !== undefined) {
        if (fromCell !== null)
          found.set(id, { ...fromLog, previous: fromCell.previous });
      } else if (since === null && fromCell !== null) {
        found.set(id, fromCell);
      }
    }
    return found;
  } finally {
    doc.destroy();
  }
}

/** Changes made by users other than `userId` to a rundown after `position`. */
export function rundownChangedSince(
  file: DocFile,
  row: DocumentRow,
  userId: string,
  position: VersionPosition,
  then: VersionContent,
  head: VersionContent | null,
): SinceResponse {
  const comparison = compareRundowns(
    then.rundown ?? EMPTY_RUNDOWN,
    head?.rundown ?? EMPTY_RUNDOWN,
  );
  const changedIds = comparison.rows
    .filter(isRundownRowChange)
    .map((entry) => entry.id);
  const rowChanges = rundownLastChanges(
    file,
    row,
    new Set(changedIds),
    position,
  );
  const others: string[] = [];
  for (const id of changedIds) {
    const change = rowChanges.get(id);
    if (change !== undefined && change.userId !== userId)
      others.push(change.userId);
  }
  const metaChanges =
    comparison.fields.length + (comparison.columnsChanged ? 1 : 0);
  if (metaChanges > 0 && position.generation === row.generation) {
    const { rows: logRows } = file.log.tail(
      row.id,
      row.generation,
      position.seq,
      { quarantine: false },
    );
    const metaAuthors = logRows
      .map((entry) => entry.userId)
      .filter((author) => author !== SYSTEM_USER_ID && author !== userId);
    const lastAuthor = metaAuthors.at(-1);
    if (lastAuthor !== undefined)
      for (let i = 0; i < metaChanges; i++) others.push(lastAuthor);
  }
  return {
    changes: others.length,
    authorUserIds: [...new Set(others)].toSorted(),
  };
}
