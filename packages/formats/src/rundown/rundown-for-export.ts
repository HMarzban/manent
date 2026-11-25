// The rundown shape formats exports from: every cell already formatted by the caller, no words owned here.
import type { Pagination } from "@manent/pagination";
import type { BlockJSON } from "@manent/schema";

export interface RundownExportColumn {
  readonly id: string;
  readonly label: string;
}

export interface RundownExportStory {
  readonly title: string;
  readonly blocks: readonly BlockJSON[];
  readonly pages: Pagination;
}

export interface RundownExportRow {
  readonly number: number | null;
  readonly kind: "story" | "header";
  readonly cells: Readonly<Record<string, string>>;
  readonly story: RundownExportStory | null;
}

export interface RundownForExport {
  readonly title: string;
  /** Local broadcast date in `YYYY-MM-DD` form. */
  readonly airDate: string;
  readonly columns: readonly RundownExportColumn[];
  readonly rows: readonly RundownExportRow[];
}

/** Plain text of a block, joining all runs in order. */
export function blockPlainText(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/** The Segment or Story cell of a row, or an empty string when neither is set. */
export function rowSlugCell(row: RundownExportRow): string {
  const segment = row.cells.segment;
  if (segment !== undefined && segment !== "") return segment;
  const story = row.cells.story;
  if (story !== undefined && story !== "") return story;
  return "";
}

/** Opening line for a story in prompter text and the two-column Variety PDF: row number, two spaces, slug cell. */
export function rowStoryHeading(row: RundownExportRow): string {
  const slug = rowSlugCell(row);
  if (row.number === null) return slug;
  return slug === "" ? String(row.number) : `${row.number}  ${slug}`;
}

/** Whole milliseconds formatted as `m:ss` (rounded to the nearest second, clamped at zero). */
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
