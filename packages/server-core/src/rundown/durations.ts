// Server-computed rundown durations: coalesced per story over 500 ms and written via authorityWrite.
import {
  readRundown,
  readRundownWrites,
  scriptBody,
  writeDurations,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { durationMs, timeScript } from "@manent/pagination";
import type { TimedBlock } from "@manent/pagination";
import { fillBlockAttrs } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import type { Home, Storage } from "@manent/storage";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";
import { createStoryLinks, loadStoredDoc } from "./story-links.ts";

/** How long commits to one story coalesce before its linked rows are timed and written. */
const DURATION_COALESCE_MS = 500;

interface StoryTiming {
  readonly wholeMs: number;
  readonly slugTimes: ReadonlyMap<string, number>;
}

interface PendingRundownRecompute {
  cancel: () => void;
  stories: Set<string>;
  isRetry: boolean;
}

const roundToSecondsMs = (ms: number): number => Math.round(ms / 1000) * 1000;

function timedBlocksOf(doc: CrdtDoc): TimedBlock[] {
  const json = scriptBody(doc).materialize();
  const blocks: TimedBlock[] = [];
  for (const section of json.content ?? []) {
    if (section.type !== "section") continue;
    for (const block of section.content ?? []) {
      if (block.type !== "block") continue;
      const attrs = fillBlockAttrs(block.attrs);
      const text = (block.content ?? []).map((run) => run.text).join("");
      blocks.push({
        id: typeof attrs.id === "string" ? attrs.id : "",
        type: typeof attrs.type === "string" ? attrs.type : "action",
        text,
        noTiming: attrs.noTiming === true,
      });
    }
  }
  return blocks;
}

function computeStoryTiming(doc: CrdtDoc, readRate: number): StoryTiming {
  const { total, slugs } = timeScript(timedBlocksOf(doc));
  const wholeMs = roundToSecondsMs(durationMs([total], readRate));
  const slugTimes = new Map<string, number>();
  for (const slug of slugs)
    if (slug.slugId !== null)
      slugTimes.set(
        slug.slugId,
        roundToSecondsMs(durationMs([slug.total], readRate)),
      );
  return { wholeMs, slugTimes };
}

function linkChangedStories(
  doc: CrdtDoc,
  update: Uint8Array,
  rundown: RundownJSON,
): string[] {
  let writes;
  try {
    writes = readRundownWrites(doc, update);
  } catch {
    // malformed or non-rundown bytes cannot carry valid row links
    return [];
  }
  const byId = new Map(rundown.rows.map((row) => [row.id, row]));
  const stories = new Set<string>();
  for (const rowWrite of writes.rows) {
    if (rowWrite.removed) continue;
    const linkTouched =
      rowWrite.keys.includes("docId") ||
      rowWrite.keys.includes("blockId") ||
      rowWrite.keys.includes("kind");
    if (!linkTouched) continue;
    const live = byId.get(rowWrite.rowId);
    if (live !== undefined && live.kind === "script" && live.docId !== null)
      stories.add(live.docId);
  }
  return [...stories];
}

function writeStoriesDurations(
  doc: CrdtDoc,
  timings: ReadonlyMap<string, StoryTiming>,
): { ok: true } {
  const live = readRundown(doc);
  const updates = new Map<string, number | null>();
  for (const row of live.rows) {
    if (row.kind !== "script" || row.docId === null) continue;
    const timing = timings.get(row.docId);
    if (timing === undefined) continue;
    const next =
      row.blockId === null
        ? timing.wholeMs
        : (timing.slugTimes.get(row.blockId) ?? null);
    if (row.durationMs !== next) updates.set(row.id, next);
  }
  if (updates.size > 0) writeDurations(doc, updates);
  return { ok: true };
}

/**
 * Sync hooks that time each story with linked rundown rows in a coalesced 500 ms window
 * per rundown and write `durationMs` for all dirty stories in one `authorityWrite` per rundown.
 * Rooms in `relay` mode write nothing.
 */
export function createRundownDurations(options: {
  clock: Clock;
  storage: Storage;
  sync: () => SyncService;
  readRateOf: (home: Home) => number;
}): SyncHooks {
  const { clock, storage, sync, readRateOf } = options;
  const storyLinks = createStoryLinks(storage);
  const liveScripts = new Map<string, Room>();
  const pending = new Map<string, PendingRundownRecompute>();

  function timeStory(storyDocId: string, home: Home): StoryTiming | null {
    const readRate = readRateOf(home);
    const live = liveScripts.get(storyDocId);
    if (live !== undefined && live.doc !== null)
      return computeStoryTiming(live.doc, readRate);
    const stored = loadStoredDoc(storage, storyDocId);
    if (stored === null) return null;
    try {
      return computeStoryTiming(stored, readRate);
    } finally {
      stored.destroy();
    }
  }

  function scheduleForRundown(
    rundownId: string,
    storyDocId: string,
    isRetry: boolean,
  ): void {
    const existing = pending.get(rundownId);
    if (existing !== undefined) {
      existing.stories.add(storyDocId);
      if (!isRetry) existing.isRetry = false;
      return;
    }
    const entry: PendingRundownRecompute = {
      cancel: () => {},
      stories: new Set([storyDocId]),
      isRetry,
    };
    pending.set(rundownId, entry);
    entry.cancel = clock.schedule(() => {
      pending.delete(rundownId);
      recomputeRundown(rundownId, entry.stories, entry.isRetry);
    }, DURATION_COALESCE_MS);
  }

  function recomputeRundown(
    rundownId: string,
    stories: ReadonlySet<string>,
    isRetry: boolean,
  ): void {
    if (storage.directory.tombstoneOf(rundownId) !== null) return;
    const timings = new Map<string, StoryTiming>();
    for (const storyDocId of stories) {
      if (storage.directory.tombstoneOf(storyDocId) !== null) continue;
      const place = storage.directory.placeOf(storyDocId);
      if (place === null || place.kind !== "script") continue;
      const linked = storyLinks
        .linksOf(storyDocId)
        .some((link) => link.kind === "script" && link.rundownId === rundownId);
      if (!linked) continue;
      const timing = timeStory(storyDocId, place.home);
      if (timing !== null) timings.set(storyDocId, timing);
    }
    if (timings.size === 0) return;
    void sync()
      .authorityWrite(rundownId, {
        userId: SYSTEM_USER_ID,
        origin: "system",
        edit: (doc) => writeStoriesDurations(doc, timings),
        inTransaction() {},
      })
      .then((result) => {
        if (result.ok) return;
        const retryable =
          result.code === "busy" || result.code === "commit_failed";
        if (retryable && !isRetry)
          for (const storyDocId of timings.keys())
            scheduleForRundown(rundownId, storyDocId, true);
      })
      .catch(() => {
        // the rundown was removed before the write ran: drop until the next commit
      });
  }

  return {
    committed({ room, update }) {
      if (room.kind === "rundown" && room.doc !== null) {
        const rundown = readRundown(room.doc);
        storyLinks.refreshRundown(room.home, room.docId, rundown);
        if (room.mode !== "authority") return;
        for (const storyDocId of linkChangedStories(room.doc, update, rundown))
          scheduleForRundown(room.docId, storyDocId, false);
        return;
      }
      if (room.kind !== "script" || room.mode !== "authority") return;
      liveScripts.set(room.docId, room);
      const rundowns = new Set<string>();
      for (const link of storyLinks.linksOf(room.docId))
        if (link.kind === "script") rundowns.add(link.rundownId);
      for (const rundownId of rundowns)
        scheduleForRundown(rundownId, room.docId, false);
    },
    forgotten(room) {
      liveScripts.delete(room.docId);
      if (room.kind === "rundown") {
        const entry = pending.get(room.docId);
        if (entry === undefined) return;
        entry.cancel();
        pending.delete(room.docId);
        return;
      }
      for (const [rundownId, entry] of pending) {
        entry.stories.delete(room.docId);
        if (entry.stories.size === 0) {
          entry.cancel();
          pending.delete(rundownId);
        }
      }
    },
  };
}
