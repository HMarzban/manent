// What a push to a rundown may write: rights, allowed roots, row shapes, cells and server-only keys.
import { jsonMap, readRundownWrites } from "@manent/crdt";
import type { CrdtDoc, RundownWrites, TransactionReport } from "@manent/crdt";
import {
  ROW_KINDS,
  RUNDOWN_COLUMNS_ROOT,
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

const STORED_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
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

function checkRowKeys(
  rowId: string,
  keys: readonly string[],
  issues: Issue[],
): void {
  for (const key of keys) {
    if (SERVER_ONLY_ROW_KEYS.includes(key))
      issues.push(
        issue(
          `rows.${rowId}.${key}`,
          "unknown_attr",
          `a push wrote server-only key "${key}" on row ${rowId}`,
        ),
      );
    else if (!ALLOWED_ROW_KEYS.includes(key))
      issues.push(
        issue(
          `rows.${rowId}.${key}`,
          "unknown_attr",
          `a push wrote unknown key "${key}" on row ${rowId}`,
        ),
      );
  }
}

function checkRowLinks(rowId: string, rawRow: MapLike, issues: Issue[]): void {
  if (rawRow.has("docId")) {
    const docId = rawRow.get("docId");
    if (docId !== null && (typeof docId !== "string" || !isDocId(docId)))
      issues.push(
        issue(
          `rows.${rowId}.docId`,
          "bad_attr",
          `row ${rowId} has an invalid docId`,
        ),
      );
  }
  if (rawRow.has("blockId")) {
    const blockId = rawRow.get("blockId");
    if (
      blockId !== null &&
      (typeof blockId !== "string" || !isBlockId(blockId))
    )
      issues.push(
        issue(
          `rows.${rowId}.blockId`,
          "bad_attr",
          `row ${rowId} has an invalid blockId`,
        ),
      );
  }
  if (rawRow.has("unnumbered") && typeof rawRow.get("unnumbered") !== "boolean")
    issues.push(
      issue(
        `rows.${rowId}.unnumbered`,
        "bad_attr",
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
    issues.push(
      issue(`rows.${rowId}`, "bad_attr", `row ${rowId} is not a map`),
    );
    return null;
  }
  const id = rawRow.get("id");
  if (typeof id !== "string" || id !== rowId || !isBlockId(id))
    issues.push(
      issue(`rows.${rowId}.id`, "bad_attr", `row ${rowId} has an invalid id`),
    );
  if (!isRowKind(rawRow.get("kind")))
    issues.push(
      issue(
        `rows.${rowId}.kind`,
        "bad_attr",
        `row ${rowId} has an invalid kind`,
      ),
    );
  const order = rawRow.get("order");
  if (typeof order !== "string" || !BASE62.test(order))
    issues.push(
      issue(
        `rows.${rowId}.order`,
        "bad_attr",
        `row ${rowId} order must be a non-empty base-62 string`,
      ),
    );
  checkRowLinks(rowId, rawRow, issues);
  if (!rawRow.has("cells")) return null;
  const rawCells = rawRow.get("cells");
  if (!isMapLike(rawCells)) {
    issues.push(
      issue(
        `rows.${rowId}.cells`,
        "bad_attr",
        `row ${rowId} cells is not a map`,
      ),
    );
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
    issues.push(
      issue(path, "bad_attr", `column "${columnId}" cannot hold a stored cell`),
    );
    return;
  }
  // deleting a cell (for example undoing a first cell write) reports value: null
  if (
    value === null &&
    (removed || (cellsMap !== null && !cellsMap.has(columnId)))
  )
    return;
  if (!isPlainObject(value)) {
    issues.push(issue(path, "bad_attr", `cell "${columnId}" is not an object`));
    return;
  }
  if (typeof value.userId !== "string" || value.userId !== pusherUserId)
    issues.push(
      issue(
        `${path}.userId`,
        "bad_attr",
        `cell "${columnId}" names another user as its writer`,
      ),
    );
  if (!isSafeInt(value.setAt))
    issues.push(
      issue(
        `${path}.setAt`,
        "bad_attr",
        `cell "${columnId}" has an invalid setAt`,
      ),
    );
  if (!isValidCellValue(columnId, value.value))
    issues.push(
      issue(
        `${path}.value`,
        "bad_attr",
        `cell "${columnId}" has an invalid value`,
      ),
    );
  if (!isValidPrevious(value.previous))
    issues.push(
      issue(
        `${path}.previous`,
        "bad_attr",
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
      issue(
        "",
        "bad_attr",
        error instanceof Error ? error.message : "invalid rundown write",
      ),
    );
    return null;
  }
}

/**
 * Checks a push to a rundown document against the pusher's role and `edit_rundowns`
 * capability, allowed roots, row shapes, cell ownership and server-only keys.
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
    return [
      issue(
        "",
        "bad_attr",
        `${peer.userId} may not edit rundown ${room.docId}`,
      ),
    ];
  if (room.doc === null)
    return [
      ...rootIssues(report),
      issue("", "bad_attr", `the room of ${room.docId} is not loaded`),
    ];
  const issues = rootIssues(report);
  const writes = readWrites(room.doc, report, issues);
  if (writes === null || writes.rows.length === 0) return issues;
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
