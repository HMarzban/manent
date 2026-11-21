// What an import keeps with the script: where it came from, what it held and what is not shown.
import { KEPT_KINDS, SOURCE_FORMATS } from "./model.ts";
import type { ImportedProduction, KeptItem, SourceFormat } from "./model.ts";

export const IMPORT_RECORD_VERSION = 1;

export interface ImportRecord {
  readonly v: 1;
  readonly from: SourceFormat;
  /** The title the script was given at import: the file's title, else its name without the extension. The Import group's summary is rebuilt from it. */
  readonly title: string;
  readonly fileName: string;
  /** Lower-case hexadecimal SHA-256 of the file's bytes: how the same file is known when it is opened again. */
  readonly fileSha256: string;
  readonly importedAt: number;
  readonly importedByUserId: string;
  readonly counts: {
    readonly pages: number;
    readonly scenes: number;
    readonly notes: number;
  };
  /** Labels of imported pages that hold more than ELASTIC_LINES over and continue on A-pages, at import. */
  readonly overflowing: readonly string[];
  readonly coloursMapped: number;
  readonly kept: readonly KeptItem[];
  readonly unread: readonly string[];
  /** What the authority is asked to lock; null when the file locks nothing. */
  readonly production: ImportedProduction | null;
  /** The import-lock request's key while it waits; null once answered, and for a file with nothing to lock. */
  readonly lockKey: string | null;
}

const SHA256 = /^[0-9a-f]{64}$/;
// a request key's shape, as the wire states it
const REQUEST_KEY = /^[0-9a-f]{32}$/;

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isSourceFormat = (value: unknown): value is SourceFormat =>
  SOURCE_FORMATS.some((format) => format === value);

/** A kept value is a string or an element; the element's children are not looked into. */
const isKeptValue = (value: unknown): boolean =>
  isString(value) ||
  (isFields(value) &&
    isString(value.name) &&
    isFields(value.attributes) &&
    Array.isArray(value.children));

function isKeptItem(value: unknown): value is KeptItem {
  return (
    isFields(value) &&
    isString(value.id) &&
    KEPT_KINDS.some((kind) => kind === value.kind) &&
    isSourceFormat(value.from) &&
    (value.of === null || isString(value.of)) &&
    isString(value.name) &&
    isKeptValue(value.value)
  );
}

const isCounts = (value: unknown): boolean =>
  isFields(value) &&
  isCount(value.pages) &&
  isCount(value.scenes) &&
  isCount(value.notes);

function isImportRecord(value: unknown): value is ImportRecord {
  return (
    isFields(value) &&
    value.v === IMPORT_RECORD_VERSION &&
    isSourceFormat(value.from) &&
    isString(value.title) &&
    isString(value.fileName) &&
    isString(value.fileSha256) &&
    SHA256.test(value.fileSha256) &&
    isCount(value.importedAt) &&
    isString(value.importedByUserId) &&
    isCounts(value.counts) &&
    isStrings(value.overflowing) &&
    isCount(value.coloursMapped) &&
    Array.isArray(value.kept) &&
    value.kept.every(isKeptItem) &&
    isStrings(value.unread) &&
    (value.production === null || isFields(value.production)) &&
    (value.lockKey === null ||
      (isString(value.lockKey) && REQUEST_KEY.test(value.lockKey)))
  );
}

/** The record as stored, when every field has its type; `production` is checked to be an object, and nothing deeper. Null for anything else. */
export function parseImportRecord(value: unknown): ImportRecord | null {
  return isImportRecord(value) ? value : null;
}
