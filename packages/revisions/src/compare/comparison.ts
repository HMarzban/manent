// Two versions compared block by block: the entries, their counts and the scenes they touch.
import type { DocJSON } from "@manent/schema";
import { SCENE_HEADINGS, alignedEntries } from "./align.ts";
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

function isChange(entry: BlockEntry): boolean {
  return entry.kind !== "unchanged" || entry.moved;
}

function countsOf(entries: readonly BlockEntry[]): Comparison["counts"] {
  const count = (kind: BlockEntry["kind"]) =>
    entries.filter((entry) => entry.kind === kind).length;
  return Object.freeze({
    added: count("added"),
    removed: count("removed"),
    changed: count("changed"),
    moved: entries.filter((entry) => entry.moved).length,
  });
}

function changedScenes(entries: readonly BlockEntry[]): Set<string> {
  return new Set(
    entries.flatMap((entry) =>
      isChange(entry) && entry.sceneId !== null ? [entry.sceneId] : [],
    ),
  );
}

function isNewerHeading(entry: BlockEntry): boolean {
  return SCENE_HEADINGS.some((type) => type === entry.newer?.attrs?.type);
}

/** The comparison these entries, in order, make. */
export function comparisonOf(
  mode: CompareMode,
  entries: readonly BlockEntry[],
): Comparison {
  const touched = changedScenes(entries);
  const headings = entries.filter(isNewerHeading).map((entry) => entry.id);
  const newerScenes = headings.filter((id) => touched.has(id));
  const shown = new Set(headings);
  return Object.freeze({
    v: 1,
    mode,
    entries: Object.freeze([...entries]),
    counts: countsOf(entries),
    scenes: Object.freeze([
      ...newerScenes,
      ...[...touched].filter((id) => !shown.has(id)),
    ]),
  });
}

/** Every block of `older` and `newer`, aligned by id; full mode unless `options.mode` says otherwise. */
export function compareDocs(
  older: DocJSON,
  newer: DocJSON,
  options: { mode?: CompareMode } = {},
): Comparison {
  const mode = options.mode ?? "full";
  return comparisonOf(mode, [...alignedEntries(older, newer, mode)]);
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
  const touched = changedScenes(entries);
  return Object.freeze({
    ...c,
    entries: Object.freeze(entries),
    counts: countsOf(entries),
    scenes: Object.freeze(c.scenes.filter((id) => touched.has(id))),
  });
}
