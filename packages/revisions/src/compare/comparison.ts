// Two versions compared block by block: the entries, their counts and the scenes they touch.
import type { DocJSON } from "@manent/schema";
import { alignedEntries, isSceneHeading } from "./align.ts";
import type { BlockEntry } from "./align.ts";
import type { CompareMode } from "./compare-mode.ts";

export interface Comparison {
  readonly v: 1;
  readonly mode: CompareMode;
  /** Newer's order; each removed entry right after its `after` (after earlier removed ones there). */
  readonly entries: readonly BlockEntry[];
  readonly counts: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly moved: number;
  };
  /** The sceneIds of every entry that is a change, in newer's order, then removed scenes. */
  readonly scenes: readonly string[];
}

/**
 * A comparison grown one entry at a time, in order: its counts and scenes are
 * kept as entries are added, so that each comparison taken costs a copy of
 * the entries, not a recount.
 */
export interface ComparisonBuilder {
  add(entry: BlockEntry): void;
  /** The comparison of the entries added so far. */
  comparison(): Comparison;
}

/** Whether the entry is a change: added, removed, changed, or moved. */
export function isChange(entry: BlockEntry): boolean {
  return entry.kind !== "unchanged" || entry.moved;
}

/** An empty comparison in `options.mode`, ready for its entries. */
export function createComparisonBuilder(options: {
  mode: CompareMode;
}): ComparisonBuilder {
  const entries: BlockEntry[] = [];
  const counts = { added: 0, removed: 0, changed: 0, moved: 0 };
  const touched = new Set<string>();
  const headings = new Set<string>();
  return {
    add(entry) {
      entries.push(entry);
      if (entry.kind !== "unchanged") counts[entry.kind]++;
      if (entry.moved) counts.moved++;
      if (isChange(entry) && entry.sceneId !== null) touched.add(entry.sceneId);
      if (entry.newer !== null && isSceneHeading(entry.newer))
        headings.add(entry.id);
    },
    comparison() {
      return Object.freeze({
        v: 1,
        mode: options.mode,
        // each entry is frozen, the array is not: freezing an array costs time per element (about 7 ms for 45,000 in JavaScriptCore), so each slice would grow with the comparison
        entries: [...entries],
        counts: Object.freeze({ ...counts }),
        scenes: Object.freeze([
          ...[...headings].filter((id) => touched.has(id)),
          ...[...touched].filter((id) => !headings.has(id)),
        ]),
      });
    },
  };
}

function comparisonOf(
  mode: CompareMode,
  entries: Iterable<BlockEntry>,
): Comparison {
  const builder = createComparisonBuilder({ mode });
  for (const entry of entries) builder.add(entry);
  return builder.comparison();
}

/** Every block of `older` and `newer`, aligned by id; full mode unless `options.mode` says otherwise. */
export function compareDocs(
  older: DocJSON,
  newer: DocJSON,
  options: { mode?: CompareMode } = {},
): Comparison {
  const mode = options.mode ?? "full";
  return comparisonOf(mode, alignedEntries(older, newer, mode));
}

/** The entries that are a change; a moved, unchanged block counts once. */
export function changeCount(c: Comparison): number {
  return c.entries.filter(isChange).length;
}

/** The entries of the scenes and the blocks named; null names every one. */
export function filterComparison(
  c: Comparison,
  filter: {
    sceneIds: readonly string[] | null;
    blockIds: readonly string[] | null;
  },
): Comparison {
  const sceneIds = filter.sceneIds === null ? null : new Set(filter.sceneIds);
  const blockIds = filter.blockIds === null ? null : new Set(filter.blockIds);
  const entries = c.entries.filter(
    (entry) =>
      (sceneIds === null ||
        (entry.sceneId !== null && sceneIds.has(entry.sceneId))) &&
      (blockIds === null || blockIds.has(entry.id)),
  );
  const narrowed = comparisonOf(c.mode, entries);
  const touched = new Set(narrowed.scenes);
  return Object.freeze({
    ...narrowed,
    scenes: Object.freeze(c.scenes.filter((id) => touched.has(id))),
  });
}
