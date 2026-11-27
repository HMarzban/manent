// Pure calculations for the Version history change-aware Minimap TOC (Scripts and Rundowns).
import type { Comparison, RundownComparison } from "@manent/revisions";
import type { RundownJSON } from "@manent/schema";
import { DOCUMENT_WORDS, RUNDOWN_WORDS, matchesQuery } from "@manent/ui";
import { rowTitleOf } from "../../rundown/dur-format.ts";
import type { OutlineRow } from "../../state/outline.store.ts";

export interface HistoryMinimapItem {
  readonly id: string;
  readonly kind: "act" | "section" | "scene";
  readonly number: string | null;
  readonly heading: string;
  readonly omitted: boolean;
  readonly changeCount: number;
  readonly targetBlockId: string;
}

export interface HistoryMinimapTick {
  readonly item: HistoryMinimapItem;
  readonly index: number;
  readonly active: boolean;
  readonly changed: boolean;
  readonly widthClass: string;
  readonly isMilestone: boolean;
}

const DEFAULT_MAX_TICKS = 44;

/** Maps script outline rows and an optional active Comparison into change-annotated Minimap TOC entries. */
export function scriptMinimapItems(
  rows: readonly OutlineRow[],
  comparison: Comparison | null,
): readonly HistoryMinimapItem[] {
  const counts = new Map<string, number>();
  const firstChange = new Map<string, string>();
  if (comparison !== null) {
    for (const entry of comparison.entries) {
      if (entry.kind === "unchanged" && !entry.moved) continue;
      const sceneId = entry.sceneId;
      if (sceneId === null) continue;
      counts.set(sceneId, (counts.get(sceneId) ?? 0) + 1);
      if (!firstChange.has(sceneId)) {
        const blockId = entry.kind === "removed" ? entry.after : entry.id;
        firstChange.set(sceneId, blockId ?? sceneId);
      }
    }
  }
  return rows.map((row) => {
    const changeCount = counts.get(row.blockId) ?? 0;
    const kind: HistoryMinimapItem["kind"] =
      row.kind === "act" || row.kind === "section" ? row.kind : "scene";
    return {
      id: row.blockId,
      kind,
      number: row.number,
      heading: row.heading,
      omitted: row.omitted,
      changeCount,
      targetBlockId: firstChange.get(row.blockId) ?? row.blockId,
    };
  });
}

/** Maps a rundown (and optional Comparison) into change-annotated Minimap TOC entries. */
export function rundownMinimapItems(
  rundown: RundownJSON | null,
  comparison: RundownComparison | null,
): readonly HistoryMinimapItem[] {
  if (comparison !== null) {
    return comparison.rows.flatMap((rowDiff, index): HistoryMinimapItem[] => {
      const sample = rowDiff.after ?? rowDiff.before;
      if (sample === null) return [];
      const rowNum = (rowDiff.afterIndex ?? rowDiff.beforeIndex ?? index) + 1;
      const isHeader = sample.kind === "header";
      const heading = rowTitleOf(sample) || RUNDOWN_WORDS.rowFallback(rowNum);
      const changeCount =
        rowDiff.kind === "added" || rowDiff.kind === "removed"
          ? 1
          : rowDiff.cells.length + (rowDiff.moved ? 1 : 0);
      return [
        {
          id: rowDiff.id,
          kind: isHeader ? "act" : "scene",
          number: isHeader ? null : String(rowNum),
          heading,
          omitted: false,
          changeCount,
          targetBlockId: rowDiff.id,
        },
      ];
    });
  }
  if (rundown === null) return [];
  let num = 0;
  return rundown.rows.map((row) => {
    const isHeader = row.kind === "header";
    if (!isHeader) num += 1;
    const heading = rowTitleOf(row) || RUNDOWN_WORDS.rowFallback(num || 1);
    return {
      id: row.id,
      kind: isHeader ? "act" : "scene",
      number: isHeader ? null : String(num),
      heading,
      omitted: false,
      changeCount: 0,
      targetBlockId: row.id,
    };
  });
}

/** Display label for one minimap row. */
export function minimapItemLabel(item: HistoryMinimapItem): string {
  const num = item.number !== null && item.number !== "" ? item.number : null;
  if (item.omitted)
    return num === null
      ? DOCUMENT_WORDS.omitted
      : `${num} ${DOCUMENT_WORDS.omitted}`;
  return item.kind === "scene" && num !== null
    ? `${num} · ${item.heading}`
    : item.heading;
}

/** Filters minimap rows by search query and optional `changedOnly` switch. */
export function filterHistoryMinimapItems(
  items: readonly HistoryMinimapItem[],
  query: string,
  changedOnly: boolean,
): readonly HistoryMinimapItem[] {
  const base = changedOnly
    ? items.filter((item) => item.changeCount > 0)
    : items;
  if (query.trim() === "") return base;
  return base.filter((item) =>
    matchesQuery(query, [item.heading, item.number ?? ""]),
  );
}

/** Width and thickness classes for one ambient tick on the History minimap spine. */
export function historyTickWidthClass(
  item: HistoryMinimapItem,
  active: boolean,
): string {
  if (active) return "w-6 h-[3px]";
  if (item.changeCount > 0) return "w-5 h-[3px]";
  if (item.kind === "act") return "w-4 h-[2.5px]";
  if (item.kind === "section") return "w-3.5 h-[2px]";
  return "w-2 h-[2px]";
}

/**
 * Compresses items onto the ambient tick rail while ALWAYS preserving changed scenes, acts, and the active row
 * so no change cluster ever vanishes on long scripts.
 */
export function compressHistoryTicks(
  items: readonly HistoryMinimapItem[],
  activeId: string | null,
  maxTicks = DEFAULT_MAX_TICKS,
): readonly HistoryMinimapTick[] {
  const toTick = (
    item: HistoryMinimapItem,
    index: number,
  ): HistoryMinimapTick => {
    const active = activeId !== null && item.id === activeId;
    return {
      item,
      index,
      active,
      changed: item.changeCount > 0,
      widthClass: historyTickWidthClass(item, active),
      isMilestone: item.kind === "act",
    };
  };
  if (items.length === 0) return [];
  if (items.length <= maxTicks) return items.map(toTick);
  const keep = new Set<number>();
  const rest: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.changeCount > 0 || item.kind === "act" || item.id === activeId)
      keep.add(i);
    else rest.push(i);
  }
  const budget = Math.max(0, maxTicks - keep.size);
  if (budget >= rest.length) for (const i of rest) keep.add(i);
  else if (budget === 1) keep.add(rest[Math.floor((rest.length - 1) / 2)]!);
  else if (budget > 1) {
    const step = (rest.length - 1) / (budget - 1);
    for (let k = 0; k < budget; k++) keep.add(rest[Math.round(k * step)]!);
  }
  return [...keep].toSorted((a, b) => a - b).map((i) => toTick(items[i]!, i));
}

/** Counts total scenes/rows and how many hold at least one change. */
export function minimapChangeSummary(items: readonly HistoryMinimapItem[]): {
  readonly total: number;
  readonly changedItems: number;
  readonly totalChanges: number;
} {
  let total = 0;
  let changedItems = 0;
  let totalChanges = 0;
  for (const item of items) {
    if (item.kind === "scene") total += 1;
    if (item.changeCount > 0) {
      changedItems += 1;
      totalChanges += item.changeCount;
    }
  }
  return { total, changedItems, totalChanges };
}
