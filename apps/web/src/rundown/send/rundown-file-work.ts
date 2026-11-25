// Shared input, file naming and font fetching for the six rundown export file types.
import type { RundownForExport } from "@manent/formats";
import type { Paper } from "@manent/pagination";
import { fileName } from "../../send/script-file.ts";
import type { WrittenFile } from "../../send/script-file.ts";

export const RUNDOWN_FILE_TYPE_IDS = Object.freeze([
  "rundown_pdf",
  "rundown_scripts",
  "variety_two_column",
  "prompter_text",
  "brackets_list",
  "rundown_json",
] as const);

export type RundownFileTypeId = (typeof RUNDOWN_FILE_TYPE_IDS)[number];

/** Rundown file types whose output carries story script content and records export versions on those stories. */
export const STORY_HOLDING_FILE_TYPES: ReadonlySet<RundownFileTypeId> = new Set(
  ["rundown_scripts", "variety_two_column", "prompter_text", "brackets_list"],
);

/** Everything a rundown file writer needs to produce one file. */
export interface RundownFileWork {
  readonly rundown: RundownForExport;
  readonly paper: Paper;
  /** Displayed date line on page 1 of the rundown PDF (for example "Tue 17 Nov 2026"). */
  readonly dateLabel: string;
  /** The "Air · Target · Over/Under" heading line on page 1, or null when unset. */
  readonly summaryLine: string | null;
  /** Ticked column IDs for the rundown PDF, in the rundown's column order. */
  readonly columnIds: readonly string[];
  /** Local air time formatted as "hh:mm" for rundown JSON, or null when unset. */
  readonly airAt: string | null;
  /** Target duration formatted as "m:ss" for rundown JSON, or null when unset. */
  readonly target: string | null;
  /** Project title used as the file-name prefix. */
  readonly projectTitle: string;
  /** Air date formatted for file names (for example "17 Nov 2026"), or empty when unset. */
  readonly airDateFileLabel: string;
  readonly now: () => number;
}

export type RundownFileWriter = (work: RundownFileWork) => Promise<WrittenFile>;

export function isRundownFileTypeId(value: string): value is RundownFileTypeId {
  return RUNDOWN_FILE_TYPE_IDS.some((id) => id === value);
}

/** Builds `{project} {date} {suffix}{extension}`, sanitising refused characters through `fileName`. */
export function rundownFileName(
  work: Pick<RundownFileWork, "projectTitle" | "airDateFileLabel">,
  suffix: string,
  extension: string,
): string {
  const parts = [
    work.projectTitle.trim(),
    work.airDateFileLabel.trim(),
    suffix,
  ].filter((part) => part !== "");
  return fileName(parts.join(" "), extension);
}

/** Fetches one bundled script-font `.woff` asset as bytes for pdfkit embedding. */
export async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`the font file ${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Encodes UTF-8 text into a `Uint8Array<ArrayBuffer>` copy suitable for `Blob` downloads. */
export function encodeUtf8File(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text));
}
