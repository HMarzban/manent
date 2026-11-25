// A rundown's stored shapes: its fields, its columns and its rows, under the three roots of a rundown document.

/** The root map of a rundown's fields. */
export const RUNDOWN_FIELDS_ROOT = "rundown";
/** The root list of a rundown's columns, in the order they are shown. */
export const RUNDOWN_COLUMNS_ROOT = "columns";
/** The root map of a rundown's rows: one map per row id. */
export const RUNDOWN_ROWS_ROOT = "rows";

export const ROW_KINDS = Object.freeze(["header", "item", "script"] as const);
export type RowKind = (typeof ROW_KINDS)[number];

export const RUNDOWN_COLUMN_IDS = Object.freeze([
  "number",
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
  "cume",
  "start",
  "back",
  "prompter",
] as const);
export type RundownColumnId = (typeof RUNDOWN_COLUMN_IDS)[number];

/** A show's columns, in order. */
export const SHOW_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "number",
  "segment",
  "writer",
  "dur",
  "cume",
  "start",
  "back",
  "prompter",
]);

/** A newscast's columns, in order. */
export const NEWS_COLUMNS: readonly RundownColumnId[] = Object.freeze([
  "number",
  "story",
  "presenter",
  "type",
  "dur",
  "cume",
  "start",
  "back",
  "prompter",
]);

export interface RundownFieldsJSON {
  /** The local date of the broadcast, `YYYY-MM-DD`. */
  airDate: string;
  airAt: number | null;
  /** How long before `airAt` the air window opens; 3600000 by default. */
  windowLeadMs: number;
  targetMs: number | null;
}

export interface RundownCellJSON {
  /** The Dur cell's value is integer milliseconds; a cleared cell holds null. */
  value: string | number | null;
  userId: string;
  setAt: number;
  /** The value this one replaced. */
  previous: {
    value: string | number | null;
    userId: string;
    setAt: number;
  } | null;
}

export interface PrompterStateJSON {
  state: "on" | "changed";
  versionId: string | null;
  sentAt: number;
  sentByUserId: string | null;
}

export interface RundownRowJSON {
  id: string;
  /** A base-62 fractional key. */
  order: string;
  kind: RowKind;
  /** Only the stored columns: segment, story, writer, presenter, type and dur. */
  cells: Partial<Record<RundownColumnId, RundownCellJSON>>;
  docId: string | null;
  blockId: string | null;
  /** Written by the server alone. */
  durationMs: number | null;
  /** Written by the server alone. */
  prompter: PrompterStateJSON | null;
  /** Numbering skips the row. */
  unnumbered: boolean;
}

export interface RundownJSON {
  rundown: RundownFieldsJSON;
  columns: RundownColumnId[];
  /** Sorted by `order`, then `id`. */
  rows: RundownRowJSON[];
}
