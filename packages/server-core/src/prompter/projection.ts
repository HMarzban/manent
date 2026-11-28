// Prompter feed projection: run order, split-story slicing, sent-story blocks and feed diffs.
import { readRundown, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { timeRundown } from "@manent/pagination";
import type { ClockRow } from "@manent/pagination";
import { canonicalBlocksOf } from "@manent/revisions";
import { prompterBlocks } from "@manent/schema";
import type {
  BlockJSON,
  RundownCellJSON,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import type { DocFile, Home, PrompterSendRow, Storage } from "@manent/storage";
import type {
  PrompterFeed,
  PrompterPatch,
  PrompterRow,
  PrompterStory,
} from "@manent/sync-protocol";
import { contentAt, materializeVersion } from "../history/content.ts";
import { loadStoredDoc } from "../rundown/story-links.ts";
import { isStorageError } from "../sync/storage-error.ts";

export interface RundownSnapshot {
  readonly home: Home;
  readonly rundown: RundownJSON;
  readonly generation: number;
  readonly headSeq: number;
}

export const isSameHome = (a: Home, b: Home): boolean =>
  a.kind === b.kind && a.id === b.id;

/** True when `storyId` is a placed, non-deleted script living in `home`. */
export function isValidStoryInHome(
  storage: Storage,
  home: Home,
  storyId: string,
): boolean {
  if (storage.directory.tombstoneOf(storyId) !== null) return false;
  const place = storage.directory.placeOf(storyId);
  return (
    place !== null && place.kind === "script" && isSameHome(place.home, home)
  );
}

/**
 * The blocks owned by one rundown row: the whole script when `blockId` is null,
 * otherwise the slug matching `blockId` up to the next slug block.
 */
export function slugBlocksOf(
  blocks: readonly BlockJSON[],
  blockId: string | null,
): readonly BlockJSON[] {
  if (blockId === null) return blocks;
  const start = blocks.findIndex((block) => block.attrs?.id === blockId);
  if (start === -1) return [];
  let end = start + 1;
  while (end < blocks.length && blocks[end]!.attrs?.type !== "slug") end += 1;
  return blocks.slice(start, end);
}

/** Reads the canonical blocks of `storyId` at its current head, without loading a room. */
export function readStoryHeadBlocks(
  storage: Storage,
  home: Home,
  storyId: string,
  liveDoc: CrdtDoc | null,
): BlockJSON[] | null {
  if (!isValidStoryInHome(storage, home, storyId)) return null;
  if (liveDoc !== null)
    return canonicalBlocksOf(scriptBody(liveDoc).materialize());
  const file = storage.open(home);
  const row = file.log.get(storyId);
  if (row === null) return null;
  try {
    const content = contentAt(file, storyId, {
      generation: row.generation,
      seq: row.headSeq,
    });
    return content?.blocks ?? null;
  } catch (error) {
    if (isStorageError(error) && error.code === "corrupt") return null;
    throw error;
  }
}

/** Reads the canonical blocks carried by one recorded send; null if missing or unreadable. */
export function readSendBlocks(
  storage: Storage,
  home: Home,
  file: DocFile,
  send: PrompterSendRow,
): BlockJSON[] | null {
  if (!isValidStoryInHome(storage, home, send.storyId)) return null;
  try {
    if (send.versionId !== null) {
      const version = file.history.get(send.versionId);
      if (version !== null && version.docId === send.storyId) {
        const content = materializeVersion(file, version);
        if (content !== null) return content.blocks;
      }
    }
    const content = contentAt(file, send.storyId, {
      generation: send.generation,
      seq: send.seq,
    });
    return content?.blocks ?? null;
  } catch (error) {
    if (isStorageError(error) && error.code === "corrupt") return null;
    throw error;
  }
}

/** True when `row`'s part of its linked story differs from what was last sent for `row.id`. */
export function isRowChanged(
  storage: Storage,
  home: Home,
  file: DocFile,
  rundownId: string,
  row: RundownRowJSON,
  headBlocks: readonly BlockJSON[],
): boolean {
  if (row.kind !== "script" || row.docId === null) return false;
  const latest = file.prompter.latest(rundownId, row.id);
  if (latest === null || latest.storyId !== row.docId) return true;
  if (row.blockId === null) {
    const storyRow = file.log.get(row.docId);
    if (
      storyRow !== null &&
      latest.generation === storyRow.generation &&
      latest.seq === storyRow.headSeq
    )
      return false;
  }
  const sentBlocks = readSendBlocks(storage, home, file, latest);
  if (sentBlocks === null) return true;
  return (
    JSON.stringify(slugBlocksOf(headBlocks, row.blockId)) !==
    JSON.stringify(slugBlocksOf(sentBlocks, row.blockId))
  );
}

function cellText(cell: RundownCellJSON | undefined): string {
  if (cell === undefined || cell.value === null) return "";
  return String(cell.value);
}

function titleOfRow(row: RundownRowJSON): string {
  const segment = cellText(row.cells.segment);
  if (segment.length > 0) return segment;
  return cellText(row.cells.story);
}

/** Builds the prompter's run order from a rundown's rows and computed row timings. */
export function buildRunOrder(rundown: RundownJSON): PrompterRow[] {
  const { airAt, targetMs, windowLeadMs } = rundown.rundown;
  const clockRows: ClockRow[] = rundown.rows.map((row) => {
    const durValue = row.cells.dur?.value;
    return {
      id: row.id,
      kind: row.kind,
      durationMs: row.durationMs,
      typedMs: typeof durValue === "number" ? durValue : null,
      unnumbered: row.unnumbered,
    };
  });
  const timed = timeRundown({ airAt, targetMs, windowLeadMs, rows: clockRows });
  return rundown.rows.map((row, index) => {
    const timing = timed.rows[index]!;
    return {
      rowId: row.id,
      kind: row.kind === "header" ? "header" : "story",
      number: timing.number,
      title: titleOfRow(row),
      storyId: row.kind === "script" ? row.docId : null,
      durationMs: timing.durMs,
    };
  });
}

/**
 * Builds the prompter snapshot for a rundown from what was last sent for each row.
 * Each story entry is keyed by `row.id` so split stories carry only their own slug's blocks.
 */
export function buildPrompterFeed(
  storage: Storage,
  home: Home,
  rundownId: string,
  rundown: RundownJSON,
): PrompterFeed {
  const runOrder = buildRunOrder(rundown);
  const file = storage.open(home);
  const latestByRow = new Map<string, PrompterSendRow>();
  for (const send of file.prompter.latestOf(rundownId))
    latestByRow.set(send.rowId, send);
  const stories: PrompterStory[] = [];
  for (const row of rundown.rows) {
    if (row.kind !== "script" || row.docId === null) continue;
    if (!isValidStoryInHome(storage, home, row.docId)) continue;
    const latest = latestByRow.get(row.id);
    if (latest === undefined) continue;
    const blocks = readSendBlocks(storage, home, file, latest);
    if (blocks === null) continue;
    stories.push({
      storyId: row.id,
      blocks: prompterBlocks(slugBlocksOf(blocks, row.blockId)),
    });
  }
  return { v: 1, runOrder, stories };
}

/** The minimal patch turning `previous` into `next`; null when nothing the prompter shows changed. */
export function diffPrompterFeed(
  previous: PrompterFeed,
  next: PrompterFeed,
): PrompterPatch | null {
  const runOrderChanged =
    JSON.stringify(previous.runOrder) !== JSON.stringify(next.runOrder);
  const prevStories = new Map<string, string>();
  for (const story of previous.stories)
    prevStories.set(story.storyId, JSON.stringify(story.blocks));
  const nextIds = new Set<string>();
  const stories: PrompterStory[] = [];
  for (const story of next.stories) {
    nextIds.add(story.storyId);
    if (prevStories.get(story.storyId) !== JSON.stringify(story.blocks))
      stories.push(story);
  }
  const removed: string[] = [];
  for (const storyId of prevStories.keys())
    if (!nextIds.has(storyId)) removed.push(storyId);
  if (!runOrderChanged && stories.length === 0 && removed.length === 0)
    return null;
  return {
    v: 1,
    runOrder: runOrderChanged ? next.runOrder : null,
    stories,
    removed,
  };
}

/** Reads a rundown's current state and log head without loading a room. */
export function readRundownSnapshot(
  storage: Storage,
  rundownId: string,
  liveDoc: CrdtDoc | null,
): RundownSnapshot | null {
  if (storage.directory.tombstoneOf(rundownId) !== null) return null;
  const place = storage.directory.placeOf(rundownId);
  if (place === null || place.kind !== "rundown") return null;
  const row = storage.open(place.home).log.get(rundownId);
  if (row === null) return null;
  if (liveDoc !== null) {
    return {
      home: place.home,
      rundown: readRundown(liveDoc),
      generation: row.generation,
      headSeq: row.headSeq,
    };
  }
  const stored = loadStoredDoc(storage, rundownId);
  if (stored === null) return null;
  try {
    return {
      home: place.home,
      rundown: readRundown(stored),
      generation: row.generation,
      headSeq: row.headSeq,
    };
  } finally {
    stored.destroy();
  }
}

/** Caches rundown snapshots by `(generation, headSeq)` to avoid repeated CRDT loads on story commits. */
export function createRundownSnapshotCache(storage: Storage): {
  get(rundownId: string): RundownSnapshot | null;
  put(rundownId: string, snapshot: RundownSnapshot): void;
  clear(): void;
} {
  const cache = new Map<string, RundownSnapshot>();
  return {
    get(rundownId) {
      if (storage.directory.tombstoneOf(rundownId) !== null) {
        cache.delete(rundownId);
        return null;
      }
      const cached = cache.get(rundownId);
      if (cached !== undefined) {
        const head = storage.open(cached.home).log.get(rundownId);
        if (
          head !== null &&
          head.generation === cached.generation &&
          head.headSeq === cached.headSeq
        )
          return cached;
      }
      const fresh = readRundownSnapshot(storage, rundownId, null);
      if (fresh === null) cache.delete(rundownId);
      else cache.set(rundownId, fresh);
      return fresh;
    },
    put(rundownId, snapshot) {
      cache.set(rundownId, snapshot);
    },
    clear() {
      cache.clear();
    },
  };
}
