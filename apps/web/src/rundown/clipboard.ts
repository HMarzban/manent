// Clipboard serialisation, validation and script-copying paste for rundown rows.
import {
  insertRows,
  readRundown,
  setCell,
  setRowUnnumbered,
} from "@manent/crdt";
import type { CrdtDoc, NewRow } from "@manent/crdt";
import type { RundownClock } from "@manent/pagination";
import { ROW_KINDS, randomBlockId } from "@manent/schema";
import type { RowKind, RundownColumnId, RundownRowJSON } from "@manent/schema";
import { LIBRARY_WORDS, formatClockTime, formatDuration } from "@manent/ui";
import { copyDocument } from "../copies/copy-document.ts";
import type { PersonServices } from "../services/ports.ts";
import { STORED_COLUMNS } from "./previous-value-model.ts";
import { openSyncedHandle, resolveRundownPlace } from "./rundown-stories.ts";

/** Custom clipboard MIME type carrying serialised rundown rows as JSON. */
export const RUNDOWN_ROWS_MIME = "application/x-manent-rows";

/** S3-RG-08 message shown when Paste runs without rundown rows on the clipboard. */
export const PASTE_NEEDS_ROWS_TEXT = "Paste needs rows copied from a rundown.";

export interface ClipboardRowPayload {
  readonly kind: RowKind;
  readonly docId: string | null;
  readonly unnumbered: boolean;
  readonly cells: Readonly<
    Partial<Record<RundownColumnId, string | number | null>>
  >;
}

export interface RundownClipboardData {
  readonly version: 1;
  readonly sourceDocId: string;
  readonly rows: readonly ClipboardRowPayload[];
}

interface CachedClipboard {
  readonly data: RundownClipboardData;
  readonly tsv: string;
}

let cachedClipboard: CachedClipboard | null = null;
const clipboardListeners = new Set<() => void>();

function notifyClipboard(): void {
  for (const listener of clipboardListeners) listener();
}

/** Subscribes to in-memory rundown clipboard updates so Paste command state stays current. */
export function subscribeClipboard(listener: () => void): () => void {
  clipboardListeners.add(listener);
  return () => {
    clipboardListeners.delete(listener);
  };
}

/** Stores the most recently copied rundown rows for row-menu Paste and fallback matching. */
export function rememberCopiedRows(
  data: RundownClipboardData,
  tsv: string,
): void {
  cachedClipboard = { data, tsv };
  notifyClipboard();
}

/** Reads the in-memory clipboard rows, optionally checking that plain text still matches. */
export function readCopiedRows(
  plainText?: string,
): RundownClipboardData | null {
  if (cachedClipboard === null) return null;
  if (
    plainText !== undefined &&
    plainText !== "" &&
    plainText !== cachedClipboard.tsv
  ) {
    return null;
  }
  return cachedClipboard.data;
}

/** Clears the in-memory clipboard cache (for test isolation). */
export function clearCopiedRows(): void {
  cachedClipboard = null;
  notifyClipboard();
}

function sanitiseTsvCell(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ");
}

function isRowKind(value: unknown): value is RowKind {
  return (ROW_KINDS as readonly unknown[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredColumn(key: string): key is RundownColumnId {
  return (STORED_COLUMNS as readonly string[]).includes(key);
}

function validateCellValue(
  columnId: RundownColumnId,
  value: unknown,
): value is string | number | null {
  if (value === null) return true;
  if (columnId === "dur") {
    return (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
  }
  return typeof value === "string";
}

function formatRowForTsv(
  row: RundownRowJSON,
  columnIds: readonly RundownColumnId[],
  clock: RundownClock | null,
): string {
  if (row.kind === "header") {
    const title =
      typeof row.cells.segment?.value === "string"
        ? row.cells.segment.value
        : typeof row.cells.story?.value === "string"
          ? row.cells.story.value
          : "";
    return sanitiseTsvCell(title);
  }
  const timing = clock?.rows.find((entry) => entry.id === row.id) ?? null;
  return columnIds
    .map((colId) => {
      switch (colId) {
        case "number":
          return timing?.number === null || timing?.number === undefined
            ? ""
            : String(timing.number);
        case "segment":
        case "story":
        case "writer":
        case "presenter":
        case "type": {
          const val = row.cells[colId]?.value;
          return typeof val === "string" ? sanitiseTsvCell(val) : "";
        }
        case "dur": {
          const typed = row.cells.dur?.value;
          if (typeof typed === "number") return formatDuration(typed);
          const durMs = timing?.durMs ?? row.durationMs;
          return durMs === null ? "" : formatDuration(durMs);
        }
        case "cume":
          return timing?.cumeMs === null || timing?.cumeMs === undefined
            ? ""
            : formatDuration(timing.cumeMs);
        case "start":
          return timing?.startAt === null || timing?.startAt === undefined
            ? ""
            : formatClockTime(timing.startAt);
        case "back":
          return timing?.backAt === null || timing?.backAt === undefined
            ? ""
            : formatClockTime(timing.backAt);
        case "prompter":
          return "";
      }
    })
    .join("\t");
}

/** Serialises `rows` as versioned `application/x-manent-rows` JSON plus tab-separated plain text. */
export function serializeRowsForClipboard(options: {
  readonly sourceDocId: string;
  readonly rows: readonly RundownRowJSON[];
  readonly columnIds: readonly RundownColumnId[];
  readonly clock: RundownClock | null;
}): {
  readonly data: RundownClipboardData;
  readonly json: string;
  readonly tsv: string;
} {
  const { sourceDocId, rows, columnIds, clock } = options;
  const payloads: ClipboardRowPayload[] = rows.map((row) => {
    const cells: Partial<Record<RundownColumnId, string | number | null>> = {};
    for (const col of STORED_COLUMNS) {
      const stored = row.cells[col];
      if (stored !== undefined) cells[col] = stored.value;
    }
    return {
      kind: row.kind,
      docId: row.docId,
      unnumbered: row.unnumbered,
      cells,
    };
  });
  const data: RundownClipboardData = {
    version: 1,
    sourceDocId,
    rows: payloads,
  };
  const tsv = rows
    .map((row) => formatRowForTsv(row, columnIds, clock))
    .join("\n");
  return { data, json: JSON.stringify(data), tsv };
}

/** Validates raw JSON from `application/x-manent-rows`; returns null on any malformed or empty payload. */
export function parseClipboardRows(raw: string): RundownClipboardData | null {
  if (raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // untrusted clipboard string is not JSON
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== 1 || typeof parsed.sourceDocId !== "string")
    return null;
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
  const rows: ClipboardRowPayload[] = [];
  for (const entry of parsed.rows) {
    if (!isRecord(entry) || !isRowKind(entry.kind)) return null;
    if (entry.docId !== null && typeof entry.docId !== "string") return null;
    if (typeof entry.unnumbered !== "boolean") return null;
    if (!isRecord(entry.cells)) return null;
    const cells: Partial<Record<RundownColumnId, string | number | null>> = {};
    for (const [key, value] of Object.entries(entry.cells)) {
      if (!isStoredColumn(key) || !validateCellValue(key, value)) return null;
      cells[key] = value;
    }
    rows.push({
      kind: entry.kind,
      docId: entry.docId,
      unnumbered: entry.unnumbered,
      cells,
    });
  }
  return { version: 1, sourceDocId: parsed.sourceDocId, rows };
}

function payloadTitle(row: ClipboardRowPayload): string {
  const seg = row.cells.segment;
  if (typeof seg === "string" && seg !== "") return seg;
  const story = row.cells.story;
  if (typeof story === "string" && story !== "") return story;
  return "";
}

export interface PasteResult {
  readonly insertedIds: readonly string[];
  readonly copiedScriptIds: readonly string[];
  readonly workspaceId: string | null;
  readonly steps: number;
}

/**
 * Pastes `data.rows` into `doc` after `afterRowId`, copying every script row's story into a new document via
 * `copyDocument` and returning the exact transaction count for single-step undo plus copied script ids for cleanup.
 */
export async function pasteRundownRows(options: {
  readonly docId: string;
  readonly doc: CrdtDoc;
  readonly data: RundownClipboardData;
  readonly afterRowId: string | null;
  readonly titleColumn: "segment" | "story";
  readonly services: PersonServices;
  readonly now: () => number;
  readonly schedule: (fn: () => void, delayMs: number) => () => void;
}): Promise<PasteResult> {
  const { docId, doc, data, afterRowId, titleColumn, services, now, schedule } =
    options;
  const hasScripts = data.rows.some(
    (row) => row.kind === "script" && row.docId !== null,
  );
  const place = hasScripts
    ? await resolveRundownPlace(services, docId, schedule)
    : null;

  const newRows: NewRow[] = [];
  const copiedScriptIds: string[] = [];

  for (const row of data.rows) {
    const id = randomBlockId();
    if (row.kind === "script" && row.docId !== null && place !== null) {
      const title = payloadTitle(row) || LIBRARY_WORDS.untitledScript;
      const made = await copyDocument({
        source: { docId: row.docId, versionId: null },
        target: {
          workspaceId: place.workspaceId,
          projectId: place.projectId,
          kind: place.kind,
          title,
          format: null,
          entry: { rundownId: docId },
        },
        library: services.library,
        history: services.history,
        open: (targetId) => openSyncedHandle(services, targetId, schedule),
        ids: randomBlockId,
      });
      if (made.ok) {
        copiedScriptIds.push(made.docId);
        newRows.push({ id, kind: "script", docId: made.docId, blockId: null });
        continue;
      }
      newRows.push({ id, kind: "item", docId: null, blockId: null });
      continue;
    }
    newRows.push({
      id,
      kind: row.kind === "script" ? "item" : row.kind,
      docId: null,
      blockId: null,
    });
  }

  const currentRows = readRundown(doc).rows;
  const safeAfter =
    afterRowId !== null && currentRows.some((row) => row.id === afterRowId)
      ? afterRowId
      : (currentRows.at(-1)?.id ?? null);
  insertRows(doc, newRows, safeAfter);
  let steps = 1;
  const by = { userId: services.userId, now };
  const otherTitleCol = titleColumn === "segment" ? "story" : "segment";

  for (let i = 0; i < data.rows.length; i++) {
    const source = data.rows[i]!;
    const target = newRows[i]!;
    for (const col of STORED_COLUMNS) {
      const value = source.cells[col];
      if (value === undefined) continue;
      // remap title cell when pasting across Show (segment) and News (story) rundowns
      const destCol =
        col === otherTitleCol && source.cells[titleColumn] === undefined
          ? titleColumn
          : col;
      setCell(doc, target.id, destCol, value, by);
      steps += 1;
    }
    if (source.unnumbered && target.kind !== "header") {
      setRowUnnumbered(doc, target.id, true);
      steps += 1;
    }
  }

  return {
    insertedIds: newRows.map((row) => row.id),
    copiedScriptIds,
    workspaceId: place?.workspaceId ?? null,
    steps,
  };
}
