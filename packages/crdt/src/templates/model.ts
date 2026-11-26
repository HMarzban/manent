// Show and News reusable template models, strict readers and workspace index map helpers.
import { ROW_KINDS, RUNDOWN_COLUMN_IDS } from "@manent/schema";
import type {
  MarkJSON,
  RowKind,
  RundownColumnId,
  TextJSON,
} from "@manent/schema";
import type { CrdtDoc } from "../doc.ts";
import { jsonMap } from "../json-map.ts";
import { STORED_COLUMNS } from "../rundown/rundown-read.ts";

const UTF8 = new TextEncoder();

export const PROJECT_SCRIPT_SKELETON_KEY = "project.scriptSkeleton";
export const PROJECT_RUNDOWN_SKELETON_KEY = "project.rundownSkeleton";

/** Maximum encoded UTF-8 byte size of one stored template entry or skeleton. */
export const TEMPLATE_MAX_BYTES = 128 * 1024;
/** Maximum blocks in a script template or rows in a rundown template. */
export const TEMPLATE_MAX_BLOCKS = 500;
/** Maximum characters in a template's trimmed name. */
export const TEMPLATE_NAME_MAX_CHARS = 120;
const TEMPLATE_ID_MAX_CHARS = 128;

export const TEMPLATE_KINDS = Object.freeze(["script", "rundown"] as const);
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Block attributes stripped when saving a script template and disallowed inside one. */
export const STRIPPED_BLOCK_ATTRS: ReadonlySet<string> = new Set([
  "id",
  "from",
  "num",
  "omitted",
  "suggest",
  "suggestId",
  "suggestAuthorUserId",
  "suggestAt",
  "writerUserId",
  "linkTo",
]);

/** Text marks stripped when saving a script template and disallowed inside one. */
export const STRIPPED_TEMPLATE_MARKS: ReadonlySet<string> = new Set([
  "suggest_insert",
  "suggest_delete",
]);

/** Stored rundown columns preserved in a rundown template (timings in `dur` are cleared). */
export const TEMPLATE_RUNDOWN_CELL_COLUMNS: readonly RundownColumnId[] =
  Object.freeze(STORED_COLUMNS.filter((col) => col !== "dur"));

export interface TemplateBlockJSON {
  type: "block";
  attrs: Record<string, unknown>;
  content?: TextJSON[];
}

export interface ScriptTemplateSkeleton {
  v: 1;
  kind: "script";
  blocks: TemplateBlockJSON[];
}

export interface TemplateRundownRowJSON {
  kind: RowKind;
  cells: Partial<Record<RundownColumnId, string | number | null>>;
  unnumbered: boolean;
}

export interface RundownTemplateSkeleton {
  v: 1;
  kind: "rundown";
  rundown: {
    windowLeadMs: number;
    targetMs: number | null;
  };
  columns: RundownColumnId[];
  rows: TemplateRundownRowJSON[];
}

export type TemplateSkeleton = ScriptTemplateSkeleton | RundownTemplateSkeleton;

export interface WorkspaceTemplateEntry {
  id: string;
  name: string;
  kind: TemplateKind;
  createdAt: number;
  createdByUserId: string;
  updatedAt: number;
  skeleton: TemplateSkeleton;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

const isColumnId = (value: unknown): value is RundownColumnId =>
  RUNDOWN_COLUMN_IDS.some((col) => col === value);

const isTemplateCellColumn = (value: unknown): value is RundownColumnId =>
  TEMPLATE_RUNDOWN_CELL_COLUMNS.some((col) => col === value);

const isTemplateKind = (value: unknown): value is TemplateKind =>
  TEMPLATE_KINDS.some((kind) => kind === value);

/** UTF-8 encoded JSON byte length; returns Infinity if not serialisable. */
export function templateByteSize(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    return text === undefined
      ? Number.POSITIVE_INFINITY
      : UTF8.encode(text).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function readMark(value: unknown): MarkJSON | null {
  if (!isFields(value) || typeof value.type !== "string") return null;
  if (STRIPPED_TEMPLATE_MARKS.has(value.type)) return null;
  if (value.attrs === undefined) return { type: value.type };
  if (!isFields(value.attrs)) return null;
  return { type: value.type, attrs: { ...value.attrs } };
}

function readRun(value: unknown): TextJSON | null {
  if (!isFields(value) || value.type !== "text") return null;
  if (typeof value.text !== "string") return null;
  if (value.marks === undefined) return { type: "text", text: value.text };
  if (!Array.isArray(value.marks)) return null;
  const marks: MarkJSON[] = [];
  for (const raw of value.marks) {
    const mark = readMark(raw);
    if (mark === null) return null;
    marks.push(mark);
  }
  return marks.length === 0
    ? { type: "text", text: value.text }
    : { type: "text", text: value.text, marks };
}

function readTemplateBlock(value: unknown): TemplateBlockJSON | null {
  if (!isFields(value) || value.type !== "block" || !isFields(value.attrs))
    return null;
  if (typeof value.attrs.type !== "string" || value.attrs.type === "")
    return null;
  for (const key of Object.keys(value.attrs))
    if (STRIPPED_BLOCK_ATTRS.has(key)) return null;
  const block: TemplateBlockJSON = {
    type: "block",
    attrs: { ...value.attrs },
  };
  if (value.content === undefined) return block;
  if (!Array.isArray(value.content)) return null;
  const content: TextJSON[] = [];
  for (const raw of value.content) {
    const run = readRun(raw);
    if (run === null) return null;
    content.push(run);
  }
  if (content.length > 0) block.content = content;
  return block;
}

/** Validates a stripped script template skeleton (shape, stripped fields, <= 500 blocks, <= 128 KB). */
export function readScriptTemplateSkeleton(
  value: unknown,
): ScriptTemplateSkeleton | null {
  if (
    !isFields(value) ||
    value.v !== 1 ||
    value.kind !== "script" ||
    !Array.isArray(value.blocks)
  )
    return null;
  if (value.blocks.length > TEMPLATE_MAX_BLOCKS) return null;
  if (templateByteSize(value) > TEMPLATE_MAX_BYTES) return null;
  const blocks: TemplateBlockJSON[] = [];
  for (const raw of value.blocks) {
    const block = readTemplateBlock(raw);
    if (block === null) return null;
    blocks.push(block);
  }
  return { v: 1, kind: "script", blocks };
}

function readTemplateRow(value: unknown): TemplateRundownRowJSON | null {
  if (!isFields(value) || !isRowKind(value.kind)) return null;
  if (typeof value.unnumbered !== "boolean" || !isFields(value.cells))
    return null;
  const cells: Partial<Record<RundownColumnId, string | number | null>> = {};
  for (const [colId, rawVal] of Object.entries(value.cells)) {
    if (!isTemplateCellColumn(colId)) return null;
    const validVal =
      rawVal === null ||
      typeof rawVal === "string" ||
      (typeof rawVal === "number" && Number.isFinite(rawVal));
    if (!validVal) return null;
    cells[colId] = rawVal;
  }
  return { kind: value.kind, cells, unnumbered: value.unnumbered };
}

/** Validates a stripped rundown template skeleton (shape, stripped timings/dates, <= 500 rows, <= 128 KB). */
export function readRundownTemplateSkeleton(
  value: unknown,
): RundownTemplateSkeleton | null {
  if (!isFields(value) || value.v !== 1 || value.kind !== "rundown")
    return null;
  if (!isFields(value.rundown)) return null;
  const { windowLeadMs, targetMs } = value.rundown;
  if (!isNonNegativeInt(windowLeadMs)) return null;
  if (targetMs !== null && !isNonNegativeInt(targetMs)) return null;
  if (!Array.isArray(value.columns)) return null;
  const columns = value.columns.filter(isColumnId);
  if (columns.length !== value.columns.length) return null;
  if (!Array.isArray(value.rows) || value.rows.length > TEMPLATE_MAX_BLOCKS)
    return null;
  if (templateByteSize(value) > TEMPLATE_MAX_BYTES) return null;
  const rows: TemplateRundownRowJSON[] = [];
  for (const raw of value.rows) {
    const row = readTemplateRow(raw);
    if (row === null) return null;
    rows.push(row);
  }
  return {
    v: 1,
    kind: "rundown",
    rundown: { windowLeadMs, targetMs },
    columns,
    rows,
  };
}

/** Validates one workspace `"templates"` map entry (metadata, matching skeleton kind, <= 128 KB, <= 500 blocks/rows). */
export function readWorkspaceTemplate(
  value: unknown,
): WorkspaceTemplateEntry | null {
  if (!isFields(value)) return null;
  const { id, name, kind, createdAt, createdByUserId, updatedAt } = value;
  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    [...id].length > TEMPLATE_ID_MAX_CHARS
  )
    return null;
  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    [...name.trim()].length > TEMPLATE_NAME_MAX_CHARS
  )
    return null;
  if (!isTemplateKind(kind)) return null;
  if (!isNonNegativeInt(createdAt) || !isNonNegativeInt(updatedAt)) return null;
  if (typeof createdByUserId !== "string" || createdByUserId === "")
    return null;
  if (templateByteSize(value) > TEMPLATE_MAX_BYTES) return null;
  const skeleton =
    kind === "script"
      ? readScriptTemplateSkeleton(value.skeleton)
      : readRundownTemplateSkeleton(value.skeleton);
  if (skeleton === null) return null;
  return {
    id,
    name: name.trim(),
    kind,
    createdAt,
    createdByUserId,
    updatedAt,
    skeleton,
  };
}

/** Reads every valid workspace template keyed by its own id from the workspace index's `"templates"` map. */
export function readWorkspaceTemplates(
  doc: CrdtDoc,
): Map<string, WorkspaceTemplateEntry> {
  const result = new Map<string, WorkspaceTemplateEntry>();
  for (const [key, raw] of Object.entries(
    jsonMap(doc, "templates").entries(),
  )) {
    const entry = readWorkspaceTemplate(raw);
    if (entry !== null && entry.id === key) result.set(key, entry);
  }
  return result;
}

/** Stores a workspace template under its own id in the workspace index's `"templates"` map. */
export function writeWorkspaceTemplate(
  doc: CrdtDoc,
  entry: WorkspaceTemplateEntry,
): void {
  jsonMap(doc, "templates").set(entry.id, entry);
}
