// Pure formatting and parsing helpers for rundown durations, air dates, row titles and column lists.
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import type { RundownColumnId, RundownRowJSON } from "@manent/schema";
import { formatDate, formatDay } from "@manent/ui";
import type { ProjectKind } from "../services/ports.ts";

const MIN_SEC = /^(\d+):(\d{2})$/;
const HOUR_MIN_SEC = /^(\d+):(\d{2}):(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a typed duration (`m:ss` or `h:mm:ss` with two-digit seconds and minutes under 60) into integer
 * milliseconds; returns null for any other input.
 */
export function parseDurationMs(raw: string): number | null {
  const trimmed = raw.trim();
  const hms = HOUR_MIN_SEC.exec(trimmed);
  if (hms !== null) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2]);
    const seconds = Number(hms[3]);
    if (minutes >= 60 || seconds >= 60) return null;
    const ms = (hours * 3600 + minutes * 60 + seconds) * 1000;
    return Number.isSafeInteger(ms) ? ms : null;
  }
  const msMatch = MIN_SEC.exec(trimmed);
  if (msMatch === null) return null;
  const minutes = Number(msMatch[1]);
  const seconds = Number(msMatch[2]);
  if (seconds >= 60) return null;
  const ms = (minutes * 60 + seconds) * 1000;
  return Number.isSafeInteger(ms) ? ms : null;
}

/**
 * Formats a local broadcast date `YYYY-MM-DD` as `Tue 17 Nov` in the current year, or `Tue 17 Nov 2027` outside it;
 * returns an empty string when `airDate` is not a valid calendar date.
 */
export function formatAirDate(airDate: string, now: number): string {
  const match = ISO_DATE.exec(airDate.trim());
  if (match === null) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day, 12, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  )
    return "";
  const at = local.getTime();
  const base = `${formatDay(at)} ${formatDate(at)}`;
  return year === new Date(now).getFullYear() ? base : `${base} ${year}`;
}

/** The text of a row's Segment or Story cell, or an empty string when unset. */
export function rowTitleOf(row: RundownRowJSON): string {
  const segment = row.cells.segment?.value;
  if (typeof segment === "string" && segment !== "") return segment;
  const story = row.cells.story?.value;
  if (typeof story === "string" && story !== "") return story;
  return "";
}

/** Whether the rundown uses News columns rather than Show columns. */
export function isNewsRundown(
  projectKind: ProjectKind | null,
  storedColumns: readonly RundownColumnId[],
): boolean {
  if (projectKind === "news") return true;
  if (projectKind === "show") return false;
  return storedColumns.includes("story");
}

/** Fixed columns for a rundown's kind: Show or News. */
export function columnsForRundown(
  projectKind: ProjectKind | null,
  storedColumns: readonly RundownColumnId[],
): readonly RundownColumnId[] {
  return isNewsRundown(projectKind, storedColumns)
    ? NEWS_COLUMNS
    : SHOW_COLUMNS;
}

/** The stored title column for a rundown's kind: `story` in News, `segment` in Show. */
export function titleColumnOf(
  projectKind: ProjectKind | null,
  storedColumns: readonly RundownColumnId[],
): "story" | "segment" {
  return isNewsRundown(projectKind, storedColumns) ? "story" : "segment";
}
