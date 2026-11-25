// Pure calculations for the Present mode outline mini-map: tick compression, pacing widths, eighths, filtering and labels.
import { DOCUMENT_WORDS, matchesQuery } from "@manent/ui";
import type { OutlineRow } from "../../../state/outline.store.ts";

export interface MiniMapTick {
  readonly row: OutlineRow;
  readonly index: number;
  readonly active: boolean;
  readonly widthClass: string;
  readonly isMilestone: boolean;
}

const DEFAULT_MAX_TICKS = 44;

/** Tailwind width and height classes encoding active state, outline hierarchy and scene length. */
export function tickWidthClass(row: OutlineRow, active: boolean): string {
  if (active) return "w-6 h-[3px]";
  if (row.kind === "act") return "w-5 h-[3px]";
  if (row.kind === "section") return "w-4 h-[2px]";
  if (row.eighths !== null && row.eighths > 12) return "w-4 h-[2px]";
  if (row.eighths !== null && row.eighths > 4) return "w-3 h-[2px]";
  return "w-2 h-[2px]";
}

function toTick(
  row: OutlineRow,
  index: number,
  id: string | null,
): MiniMapTick {
  const active = id !== null && row.blockId === id;
  return {
    row,
    index,
    active,
    widthClass: tickWidthClass(row, active),
    isMilestone: row.kind === "act",
  };
}

/** Compresses outline rows onto the ambient tick rail while preserving every act and the active row in order. */
export function compressTicks(
  rows: readonly OutlineRow[],
  activeBlockId: string | null,
  maxTicks = DEFAULT_MAX_TICKS,
): readonly MiniMapTick[] {
  if (rows.length === 0) return [];
  if (rows.length <= maxTicks)
    return rows.map((r, i) => toTick(r, i, activeBlockId));
  const keep = new Set<number>();
  const rest: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.kind === "act" || row.blockId === activeBlockId) keep.add(i);
    else rest.push(i);
  }
  const budget = Math.max(0, maxTicks - keep.size);
  if (budget >= rest.length) for (const i of rest) keep.add(i);
  else if (budget === 1) keep.add(rest[Math.floor((rest.length - 1) / 2)]!);
  else if (budget > 1) {
    const step = (rest.length - 1) / (budget - 1);
    for (let k = 0; k < budget; k++) keep.add(rest[Math.round(k * step)]!);
  }
  return [...keep]
    .toSorted((a, b) => a - b)
    .map((i) => toTick(rows[i]!, i, activeBlockId));
}

/** Formats a scene length in eighths of a page, or null when absent or non-positive. */
export function formatEighths(eighths: number | null): string | null {
  if (eighths === null || eighths <= 0) return null;
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (whole === 0) return `${rem}/8`;
  return rem === 0 ? `${whole}` : `${whole} ${rem}/8`;
}

/** Counts scenes and resolves the 1-based position of the active scene (0 when there are no scenes). */
export function sceneIndexInfo(
  rows: readonly OutlineRow[],
  activeBlockId: string | null,
): { currentScene: number; totalScenes: number } {
  const totalScenes = rows.filter((r) => r.kind === "scene").length;
  if (totalScenes === 0) return { currentScene: 0, totalScenes: 0 };
  const at =
    activeBlockId === null
      ? -1
      : rows.findIndex((r) => r.blockId === activeBlockId);
  if (at !== -1) {
    let seen = 0;
    for (let i = 0; i <= at; i++) if (rows[i]?.kind === "scene") seen++;
    return { currentScene: seen > 0 ? seen : 1, totalScenes };
  }
  let pos = 0;
  for (const r of rows) {
    if (r.kind !== "scene") continue;
    pos++;
    if (r.current) return { currentScene: pos, totalScenes };
  }
  return { currentScene: 1, totalScenes };
}

/** Accessible and tooltip label for one outline row. */
export function rowLabel(row: OutlineRow): string {
  const num = row.number !== null && row.number !== "" ? row.number : null;
  if (row.omitted)
    return num === null
      ? DOCUMENT_WORDS.omitted
      : `${num} ${DOCUMENT_WORDS.omitted}`;
  return row.kind === "scene" && num !== null
    ? `${num} · ${row.heading}`
    : row.heading;
}

/** Filters scenes by heading, scene number and synopsis; returns all rows while `query` is empty. */
export function filterOutlineRows(
  rows: readonly OutlineRow[],
  query: string,
): readonly OutlineRow[] {
  if (query.trim() === "") return rows;
  return rows.filter(
    (r) =>
      r.kind === "scene" &&
      matchesQuery(query, [r.heading, r.number ?? "", r.synopsis]),
  );
}

/** Resolves the next focused item index for outline keyboard navigation, or -1 when unhandled. */
export function nextOutlineFocus(
  key: string,
  current: number,
  count: number,
  inInput: boolean,
): number {
  if (count <= 0) return -1;
  const last = count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(last, current + 1);
  if (key === "ArrowUp") return current < 0 ? last : Math.max(0, current - 1);
  if (!inInput && key === "Home") return 0;
  return !inInput && key === "End" ? last : -1;
}
