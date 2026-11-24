// Air windows for rundowns and their linked stories, refreshed on rundown commits and cached on cold reads.
import { readRundown } from "@manent/crdt";
import { timeRundown } from "@manent/pagination";
import type { ClockRow } from "@manent/pagination";
import type { RundownJSON } from "@manent/schema";
import type { Storage } from "@manent/storage";
import type { Clock, SyncHooks } from "../sync/ports.ts";
import { createStoryLinks, loadStoredDoc } from "./story-links.ts";

interface AirWindow {
  startsAt: number;
  endsAt: number;
}

export interface AirWindows {
  windowOf(docId: string): { startsAt: number; endsAt: number } | null;
  isInside(docId: string, now: number): boolean;
  hooks: SyncHooks;
}

function computeAirWindow(rundown: RundownJSON): AirWindow | null {
  const { airAt, targetMs, windowLeadMs } = rundown.rundown;
  const rows: ClockRow[] = rundown.rows.map((row) => {
    const durValue = row.cells.dur?.value;
    return {
      id: row.id,
      kind: row.kind,
      durationMs: row.durationMs,
      typedMs: typeof durValue === "number" ? durValue : null,
      unnumbered: row.unnumbered,
    };
  });
  return timeRundown({ airAt, targetMs, windowLeadMs, rows }).airWindow;
}

const isWithin = (window: AirWindow | null, now: number): boolean =>
  window !== null && now >= window.startsAt && now <= window.endsAt;

const copyWindow = (window: AirWindow | null): AirWindow | null =>
  window === null ? null : { startsAt: window.startsAt, endsAt: window.endsAt };

/** Picks the active window at `now`, else the soonest upcoming one, else the latest past one. */
function pickWindow(
  windows: readonly AirWindow[],
  now: number,
): AirWindow | null {
  if (windows.length === 0) return null;
  if (windows.length === 1) return windows[0]!;
  let active: AirWindow | null = null;
  let upcoming: AirWindow | null = null;
  let latest: AirWindow = windows[0]!;
  for (const win of windows) {
    if (isWithin(win, now)) {
      if (active === null || win.endsAt > active.endsAt) active = win;
      continue;
    }
    if (win.endsAt >= now) {
      if (upcoming === null || win.startsAt < upcoming.startsAt) upcoming = win;
    }
    if (win.endsAt > latest.endsAt) latest = win;
  }
  return active ?? upcoming ?? latest;
}

/**
 * Tracks each rundown's air window (`timeRundown(…).airWindow`) and projects it onto
 * every story linked by that rundown. An unknown window is read once from stored state
 * and cached; commits refresh the rundown's window and links.
 */
export function createAirWindows(options: {
  clock: Clock;
  storage: Storage;
}): AirWindows {
  const { clock, storage } = options;
  const { directory } = storage;
  const storyLinks = createStoryLinks(storage);
  const windows = new Map<string, AirWindow | null>();

  function rundownWindow(rundownId: string): AirWindow | null {
    if (directory.tombstoneOf(rundownId) !== null) {
      windows.delete(rundownId);
      return null;
    }
    if (windows.has(rundownId)) return windows.get(rundownId) ?? null;
    const place = directory.placeOf(rundownId);
    if (place === null || place.kind !== "rundown") return null;
    const doc = loadStoredDoc(storage, rundownId);
    if (doc === null) return null;
    try {
      const rundown = readRundown(doc);
      const win = computeAirWindow(rundown);
      windows.set(rundownId, win);
      storyLinks.refreshRundown(place.home, rundownId, rundown);
      return win;
    } finally {
      doc.destroy();
    }
  }

  function windowOf(
    docId: string,
  ): { startsAt: number; endsAt: number } | null {
    if (directory.tombstoneOf(docId) !== null) return null;
    const place = directory.placeOf(docId);
    if (place === null) return null;
    if (place.kind === "rundown") return copyWindow(rundownWindow(docId));
    const candidates: AirWindow[] = [];
    for (const rundownId of storyLinks.rundownsOf(docId)) {
      const win = rundownWindow(rundownId);
      if (win !== null) candidates.push(win);
    }
    return copyWindow(pickWindow(candidates, clock.now()));
  }

  function isInside(docId: string, now: number): boolean {
    if (directory.tombstoneOf(docId) !== null) return false;
    const place = directory.placeOf(docId);
    if (place === null) return false;
    if (place.kind === "rundown") return isWithin(rundownWindow(docId), now);
    return storyLinks
      .rundownsOf(docId)
      .some((rundownId) => isWithin(rundownWindow(rundownId), now));
  }

  const hooks: SyncHooks = {
    committed({ room }) {
      if (room.kind !== "rundown" || room.doc === null) return;
      const rundown = readRundown(room.doc);
      windows.set(room.docId, computeAirWindow(rundown));
      storyLinks.refreshRundown(room.home, room.docId, rundown);
    },
    subscribed(docId) {
      const place = directory.placeOf(docId);
      if (place?.kind === "rundown" && !windows.has(docId))
        rundownWindow(docId);
      return null;
    },
  };

  return { windowOf, isInside, hooks };
}
