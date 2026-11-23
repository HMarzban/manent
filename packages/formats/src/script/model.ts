// The format-neutral model every reader makes and every writer reads. Every value is plain JSON.
import type { LockAnchorRecord } from "@manent/pagination";
import type {
  NumberingScheme,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";
import type { BlockJSON, FormatId, ScriptNote } from "@manent/schema";
import type { XmlNode } from "../xml/node.ts";
import type { ImportRecord } from "./record.ts";

export const SOURCE_FORMATS = [
  "fdx",
  "fountain",
  "fdr",
  "text",
  "pdf",
  "docx",
  "ink",
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const FORMAT_ERROR_CODES = [
  "not_this_format",
  "malformed",
  "unsupported",
  "too_large",
] as const;
export type FormatErrorCode = (typeof FORMAT_ERROR_CODES)[number];

/** What a reader throws for input it cannot read; `message` is for a log, never shown. */
export class FormatError extends Error {
  readonly code: FormatErrorCode;

  constructor(
    code: FormatErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FormatError";
    this.code = code;
  }
}

export const KEPT_KINDS = [
  "title_page",
  "document_part",
  "paragraph_part",
  "run_part",
  "element_type",
  "scene_number",
  "note_part",
  "boneyard",
  "fountain_markup",
  "unplaced_lock",
] as const;
export type KeptKind = (typeof KEPT_KINDS)[number];

/** Something the file held that Manent does not show, kept to be written back by the writer of `from`. */
export interface KeptItem {
  /** "k1", "k2" … in reading order; unique in its list. */
  readonly id: string;
  readonly kind: KeptKind;
  readonly from: SourceFormat;
  /** A block id, a note id, or null for the whole script. */
  readonly of: string | null;
  /** The file's own name for it: an FDX element, attribute or Type, a Fountain title key or markup. */
  readonly name: string;
  readonly value: XmlNode | string;
}

export interface ImportedSet {
  /** The file's own name for the set, written back by the FDX writer. */
  readonly sourceName: string;
  /** The nearest of Manent's colours to the file's page colour (paperRgb distance); its name is COLOUR_NAMES[colour]. */
  readonly colour: RevisionColour;
  readonly mark: string;
  readonly fullDraft: boolean;
  /** UTF-16 ranges inside each block's text; `deletedAt` the offsets where text was deleted. */
  readonly blocks: readonly {
    readonly blockId: string;
    readonly inserted: readonly (readonly [number, number])[];
    readonly deletedAt: readonly number[];
  }[];
}

export interface ImportedProduction {
  /** Locked page starts in page order, the first page's included; empty when the file locks no page but has marks. */
  readonly anchors: readonly {
    readonly label: string;
    readonly blockId: string;
    readonly offset: number;
  }[];
  /** Every scene heading's number as the file gives it. */
  readonly sceneNumbers: readonly {
    readonly blockId: string;
    readonly num: string;
  }[];
  readonly numbering: NumberingScheme;
  /** Sets that mark text, in the file's order. */
  readonly sets: readonly ImportedSet[];
}

export interface ImportedScript {
  readonly from: SourceFormat;
  /** The title page's title, null when the file gives none. */
  readonly title: string | null;
  readonly paper: "letter" | "a4" | null;
  /** Document order, every id from the reader's IdSource. */
  readonly blocks: readonly BlockJSON[];
  readonly notes: readonly { readonly id: string; readonly note: ScriptNote }[];
  /** Null when the file locks no page and marks no revision. */
  readonly production: ImportedProduction | null;
  readonly kept: readonly KeptItem[];
  /** Runs whose colour or highlight was not exactly one of Manent's and was mapped to the nearest. */
  readonly coloursMapped: number;
  /** Parts of the file that could not be read at all; empty for every reader that reads its whole file. */
  readonly unread: readonly string[];
}

export interface ScriptForExport {
  readonly title: string;
  readonly format: FormatId;
  /** Document order, without sections. */
  readonly blocks: readonly BlockJSON[];
  readonly notes: readonly { readonly id: string; readonly note: ScriptNote }[];
  /** Null for a script that was never imported. */
  readonly record: ImportRecord | null;
  readonly production: ExportProduction | null;
}

export interface ExportProduction {
  readonly anchors: readonly LockAnchorRecord[];
  /** Every heading's number as shown: issued, else derived. */
  readonly numbers: ReadonlyMap<string, string>;
  readonly numbering: NumberingScheme;
  /** Oldest first, the active one last; each with its marks by block id. */
  readonly sources: readonly RevisionSource[];
}

export interface WrittenFile {
  readonly text: string;
  /** Kept items of another format, which this writer cannot put back: the Export form lists them. */
  readonly leftOut: readonly KeptItem[];
}
