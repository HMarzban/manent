// Shared zero-drift running header & footer resolution for screen, print, and PDF.
import { isVersoPage } from "./page-profile.ts";
import type { PageProfile } from "./page-profile.ts";
import type { Pagination } from "./pages.ts";

export type RunningHeaderSlotKind =
  | "none"
  | "page_number"
  | "page_of_total"
  | "date"
  | "title"
  | "section"
  | "duration"
  | "revision_label"
  | "verso_title_recto_chapter";

export type RunningHeaderSlot =
  | { readonly kind: RunningHeaderSlotKind }
  | { readonly kind: "custom"; readonly text: string };

export interface RunningHeaderSlots {
  readonly left: RunningHeaderSlot;
  readonly center: RunningHeaderSlot;
  readonly right: RunningHeaderSlot;
  readonly firstPage: boolean;
  readonly rule: boolean;
  readonly suppressChapterOpenings?: boolean;
}

export type RunningDateFormat = "day_month_year" | "month_day_year" | "iso";

export interface PageRunningContext {
  readonly section: string | null;
  readonly isChapterOpening: boolean;
  readonly isBlank: boolean;
}

export interface RunningBarInput {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageLabel: string | null;
  readonly profile: PageProfile;
  readonly title: string | null;
  readonly section: string | null;
  readonly dateFormat: RunningDateFormat | null;
  readonly revisionLabel: string | null;
  readonly day: string | null;
  readonly durationMs: number | null;
  readonly isChapterOpening?: boolean;
  readonly isBlank?: boolean;
}

export interface ResolvedRunningBar {
  readonly left: string;
  readonly center: string;
  readonly right: string;
  readonly rule: boolean;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats an ISO calendar day ("2026-11-28") according to the project date format. */
export function formatRunningDay(
  day: string | null,
  dateFormat: RunningDateFormat | null,
): string {
  if (day === null || day === "") return "";
  const match = ISO_DAY.exec(day);
  if (match === null) return day;
  const year = match[1]!;
  const monthIndex = Number(match[2]!) - 1;
  const dayNum = Number(match[3]!);
  if (dateFormat === "iso") return day;
  const month = MONTHS[monthIndex] ?? match[2]!;
  if (dateFormat === "month_day_year") return `${month} ${dayNum}, ${year}`;
  return `${dayNum} ${month} ${year}`;
}

const padTwo = (n: number): string => String(n).padStart(2, "0");

/** Formats milliseconds as `m:ss` or `h:mm:ss`. */
export function formatRunningDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${padTwo(minutes)}:${padTwo(seconds)}`
    : `${minutes}:${padTwo(seconds)}`;
}

/** True when `pageIndex` is a non-blank page whose first printed block is a `chapter` opening. */
export function isChapterOpeningPage(
  p: Pagination,
  pageIndex: number,
): boolean {
  const page = p.pages[pageIndex];
  if (page === undefined || page.blank === true) return false;
  return page.line === 0 && p.blocks[page.block]?.type === "chapter";
}

/** Single-pass per-page running section, chapter-opening, and blank-page metadata for `p`. */
export function pageRunningContext(
  p: Pagination,
): readonly PageRunningContext[] {
  const result: PageRunningContext[] = [];
  let current: string | null = null;
  let blockIndex = 0;
  for (let k = 0; k < p.pages.length; k++) {
    const page = p.pages[k]!;
    if (page.blank === true) {
      result.push({ section: current, isChapterOpening: false, isBlank: true });
      continue;
    }
    while (blockIndex <= page.block && blockIndex < p.blocks.length) {
      const block = p.blocks[blockIndex]!;
      if (
        block.type === "chapter" ||
        block.type === "group" ||
        (block.type === "act_break" && block.kind !== "end_of_act")
      ) {
        const text = block.text.trim();
        if (text !== "") current = text;
      }
      blockIndex++;
    }
    const isChapterOpening =
      page.line === 0 && p.blocks[page.block]?.type === "chapter";
    result.push({ section: current, isChapterOpening, isBlank: false });
  }
  return result;
}

/** Resolves one running header/footer slot to display text. */
export function resolveRunningSlot(
  slot: RunningHeaderSlot,
  input: RunningBarInput,
): string {
  const label = input.pageLabel ?? String(input.pageIndex + 1);
  const isBookSerif = input.profile.typography?.kind === "book_serif";
  switch (slot.kind) {
    case "none":
      return "";
    case "page_number":
      return isBookSerif ? label : `${label}.`;
    case "page_of_total":
      return `${label} of ${input.pageCount}`;
    case "date":
      return formatRunningDay(input.day, input.dateFormat);
    case "title":
      return input.title ?? "";
    case "section":
      return input.section ?? "";
    case "verso_title_recto_chapter":
      return isVersoPage(input.pageIndex)
        ? (input.title ?? "")
        : (input.section ?? "");
    case "duration":
      return formatRunningDuration(input.durationMs);
    case "revision_label":
      return input.revisionLabel ?? "";
    case "custom":
      return slot.text;
  }
}

/**
 * Resolves a header or footer bar for one page across screen, print, and PDF.
 * Suppresses completely on blank verso pages, suppresses on Page 1 when `!firstPage`,
 * suppresses headers on chapter-opening pages by default on Engine 3 (`book_serif`),
 * and mirrors left/right slots on verso pages when `geometry.mirrored` is enabled.
 */
export function resolveBarSlots(
  slots: RunningHeaderSlots,
  input: RunningBarInput,
  kind: "header" | "footer",
): ResolvedRunningBar | null {
  if (input.isBlank === true) return null;
  if (!slots.firstPage && input.pageIndex === 0) return null;
  const suppressChapter =
    slots.suppressChapterOpenings ??
    input.profile.typography?.kind === "book_serif";
  if (kind === "header" && suppressChapter && input.isChapterOpening === true)
    return null;

  const mirrorSwap =
    input.profile.geometry.mirrored === true && isVersoPage(input.pageIndex);
  const left = resolveRunningSlot(mirrorSwap ? slots.right : slots.left, input);
  const center = resolveRunningSlot(slots.center, input);
  const right = resolveRunningSlot(
    mirrorSwap ? slots.left : slots.right,
    input,
  );
  if (left === "" && center === "" && right === "" && !slots.rule) return null;
  return { left, center, right, rule: slots.rule };
}
