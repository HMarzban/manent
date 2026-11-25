// What a push to a rundown may write: rights, allowed roots, fields, columns, row shapes, cells and server-only keys.
import {
  STORED_COLUMNS,
  jsonMap,
  readRundownColumns,
  readRundownWrites,
} from "@manent/crdt";
import type { CrdtDoc, RundownWrites, TransactionReport } from "@manent/crdt";
import {
  ROW_KINDS,
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_COLUMN_IDS,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
  isBlockId,
} from "@manent/schema";
import type {
  Issue,
  IssueCode,
  RowKind,
  RundownColumnId,
} from "@manent/schema";
import { isDocId } from "@manent/sync-protocol";
import { isWriterRole } from "../sync/admission.ts";
import type { PushValidator } from "../sync/validate.ts";

const ALLOWED_ROOTS: readonly string[] = Object.freeze([
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_ROWS_ROOT,
]);

const SERVER_ONLY_ROW_KEYS: readonly string[] = Object.freeze([
  "durationMs",
  "prompter",
]);

const ALLOWED_ROW_KEYS: readonly string[] = Object.freeze([
  "id",
  "order",
  "kind",
  "cells",
  "docId",
  "blockId",
  "durationMs",
  "prompter",
  "unnumbered",
]);

const BASE62 = /^[0-9A-Za-z]+$/;

interface MapLike {
  get(key: string): unknown;
  has(key: string): boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMapLike = (value: unknown): value is MapLike =>
  typeof value === "object" &&
  value !== null &&
  "get" in value &&
  typeof value.get === "function" &&
  "has" in value &&
  typeof value.has === "function";

const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

const isStoredColumn = (value: unknown): value is RundownColumnId =>
  STORED_COLUMNS.some((col) => col === value);

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isNonNegativeInt = (value: unknown): value is number =>
  isSafeInt(value) && value >= 0;

const issue = (path: string, code: IssueCode, message: string): Issue => ({
  path,
  code,
  severity: "reject",
  message,
});

const bad = (path: string, message: string): Issue =>
  issue(path, "bad_attr", message);

const unknownAttr = (path: string, message: string): Issue =>
  issue(path, "unknown_attr", message);

const FIELD_CHECKS: Readonly<Record<string, (value: unknown) => boolean>> = {
  airDate: (value) => typeof value === "string",
  airAt: (value) => value === null || isSafeInt(value),
  windowLeadMs: isNonNegativeInt,
  targetMs: (value) => value === null || isNonNegativeInt(value),
};

function rootIssues(report: TransactionReport): Issue[] {
  const issues = report.maps
    .filter((name) => !ALLOWED_ROOTS.includes(name))
    .map((name) =>
      issue(
        `maps.${name}`,
        "unknown_node",
        `a push wrote the ${name} root, which a rundown does not hold`,
      ),
    );
  const body =
    report.inserted.length > 0 ||
    report.changed.length > 0 ||
    report.removed.length > 0 ||
    report.touched().length > 0;
  if (body)
    issues.push(
      issue(
        "body",
        "unknown_node",
        "a push wrote a script body into a rundown",
      ),
    );
  return issues;
}

function isValidCellValue(columnId: RundownColumnId, value: unknown): boolean {
  if (value === null) return true;
  if (columnId === "dur") return isNonNegativeInt(value);
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isValidPrevious(value: unknown): boolean {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  const { value: inner, userId, setAt } = value;
  const validInner =
    inner === null ||
    typeof inner === "string" ||
    (typeof inner === "number" && Number.isFinite(inner));
  return validInner && typeof userId === "string" && isSafeInt(setAt);
}

function checkFields(doc: CrdtDoc, issues: Issue[]): void {
  for (const [key, value] of Object.entries(
    jsonMap(doc, RUNDOWN_FIELDS_ROOT).entries(),
  )) {
    const check = FIELD_CHECKS[key];
    if (check === undefined)
      issues.push(
        unknownAttr(
          `rundown.${key}`,
          `a push wrote unknown rundown field "${key}"`,
        ),
      );
    else if (!check(value))
      issues.push(bad(`rundown.${key}`, `rundown.${key} has an invalid value`));
  }
}

function checkColumns(doc: CrdtDoc, issues: Issue[]): void {
  const columns = readRundownColumns(doc);
  for (let i = 0; i < columns.length; i += 1) {
    if (!RUNDOWN_COLUMN_IDS.some((col) => col === columns[i]))
      issues.push(
        bad(`columns.${i}`, `columns[${i}] is not a valid rundown column`),
      );
  }
}

function checkRowKeys(
  rowId: string,
  keys: readonly string[],
  issues: Issue[],
): void {
  for (const key of keys) {
    const path = `rows.${rowId}.${key}`;
    if (SERVER_ONLY_ROW_KEYS.includes(key))
      issues.push(
        unknownAttr(
          path,
          `a push wrote server-only key "${key}" on row ${rowId}`,
        ),
      );
    else if (!ALLOWED_ROW_KEYS.includes(key))
      issues.push(
        unknownAttr(path, `a push wrote unknown key "${key}" on row ${rowId}`),
      );
  }
}

function checkRowLinks(rowId: string, rawRow: MapLike, issues: Issue[]): void {
  if (rawRow.has("docId")) {
    const docId = rawRow.get("docId");
    if (docId !== null && (typeof docId !== "string" || !isDocId(docId)))
      issues.push(
        bad(`rows.${rowId}.docId`, `row ${rowId} has an invalid docId`),
      );
  }
  if (rawRow.has("blockId")) {
    const blockId = rawRow.get("blockId");
    if (
      blockId !== null &&
      (typeof blockId !== "string" || !isBlockId(blockId))
    )
      issues.push(
        bad(`rows.${rowId}.blockId`, `row ${rowId} has an invalid blockId`),
      );
  }
  if (rawRow.has("unnumbered") && typeof rawRow.get("unnumbered") !== "boolean")
    issues.push(
      bad(
        `rows.${rowId}.unnumbered`,
        `row ${rowId} unnumbered must be a boolean`,
      ),
    );
}

function checkLiveRow(
  rowId: string,
  rawRow: unknown,
  issues: Issue[],
): MapLike | null {
  if (!isMapLike(rawRow)) {
    issues.push(bad(`rows.${rowId}`, `row ${rowId} is not a map`));
    return null;
  }
  const id = rawRow.get("id");
  if (typeof id !== "string" || id !== rowId || !isBlockId(id))
    issues.push(bad(`rows.${rowId}.id`, `row ${rowId} has an invalid id`));
  if (!isRowKind(rawRow.get("kind")))
    issues.push(bad(`rows.${rowId}.kind`, `row ${rowId} has an invalid kind`));
  const order = rawRow.get("order");
  if (typeof order !== "string" || !BASE62.test(order))
    issues.push(
      bad(
        `rows.${rowId}.order`,
        `row ${rowId} order must be a non-empty base-62 string`,
      ),
    );
  checkRowLinks(rowId, rawRow, issues);
  if (!rawRow.has("cells")) return null;
  const rawCells = rawRow.get("cells");
  if (!isMapLike(rawCells)) {
    issues.push(bad(`rows.${rowId}.cells`, `row ${rowId} cells is not a map`));
    return null;
  }
  return rawCells;
}

function checkCell(
  rowId: string,
  cell: { columnId: string; value: unknown },
  cellsMap: MapLike | null,
  removed: boolean,
  pusherUserId: string,
  issues: Issue[],
): void {
  const { columnId, value } = cell;
  const path = `rows.${rowId}.cells.${columnId}`;
  if (!isStoredColumn(columnId)) {
    issues.push(bad(path, `column "${columnId}" cannot hold a stored cell`));
    return;
  }
  // deleting a cell (for example undoing a first cell write) reports value: null
  if (
    value === null &&
    (removed || (cellsMap !== null && !cellsMap.has(columnId)))
  )
    return;
  if (!isPlainObject(value)) {
    issues.push(bad(path, `cell "${columnId}" is not an object`));
    return;
  }
  if (typeof value.userId !== "string" || value.userId !== pusherUserId)
    issues.push(
      bad(
        `${path}.userId`,
        `cell "${columnId}" names another user as its writer`,
      ),
    );
  if (!isSafeInt(value.setAt))
    issues.push(
      bad(`${path}.setAt`, `cell "${columnId}" has an invalid setAt`),
    );
  if (!isValidCellValue(columnId, value.value))
    issues.push(
      bad(`${path}.value`, `cell "${columnId}" has an invalid value`),
    );
  if (!isValidPrevious(value.previous))
    issues.push(
      bad(
        `${path}.previous`,
        `cell "${columnId}" has an invalid previous value`,
      ),
    );
}

function readWrites(
  doc: CrdtDoc,
  report: TransactionReport,
  issues: Issue[],
): RundownWrites | null {
  try {
    return readRundownWrites(doc, report.update);
  } catch (error) {
    issues.push(
      bad("", error instanceof Error ? error.message : "invalid rundown write"),
    );
    return null;
  }
}

/**
 * Checks a push to a rundown document against the pusher's role and `edit_rundowns`
 * capability, allowed roots, fields, columns, row shapes, cell ownership and server-only keys.
 */
export const validateRundownPush: PushValidator = ({
  report,
  room,
  subscription,
}) => {
  const { peer, access } = subscription;
  if (
    !isWriterRole(access.role) ||
    !access.capabilities.includes("edit_rundowns")
  )
    return [bad("", `${peer.userId} may not edit rundown ${room.docId}`)];
  if (room.doc === null)
    return [
      ...rootIssues(report),
      bad("", `the room of ${room.docId} is not loaded`),
    ];
  const issues = rootIssues(report);
  const writes = readWrites(room.doc, report, issues);
  if (writes === null) return issues;
  if (writes.roots.includes(RUNDOWN_FIELDS_ROOT)) checkFields(room.doc, issues);
  if (writes.roots.includes(RUNDOWN_COLUMNS_ROOT))
    checkColumns(room.doc, issues);
  if (writes.rows.length === 0) return issues;
  const rowsView = jsonMap(room.doc, RUNDOWN_ROWS_ROOT);
  for (const row of writes.rows) {
    checkRowKeys(row.rowId, row.keys, issues);
    const cellsMap = row.removed
      ? null
      : checkLiveRow(row.rowId, rowsView.get(row.rowId), issues);
    for (const cell of row.cells)
      checkCell(row.rowId, cell, cellsMap, row.removed, peer.userId, issues);
  }
  return issues;
};
