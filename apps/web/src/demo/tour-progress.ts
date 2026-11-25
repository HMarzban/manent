// Tour progress: kept in the person's private index and mirrored across demo person switches on this browser.
import type { KeyValueMap } from "@manent/settings";
import type { TabStorage } from "../session.ts";

/** Browser-level demo progress mirror so switching between demo people keeps Tour ticks visible. */
export const TOUR_SHARED_KEY = "manent.demo.tour";

/** Per-tab active Tour scenario and step so reloading a tab (as in offline-write) keeps this tab's place. */
export const TOUR_ACTIVE_KEY = "manent.demo.tour.active";

function isMarkedDone(map: KeyValueMap | null, id: string): boolean {
  if (map === null) return false;
  const value = map.get(id);
  return typeof value === "object" && value !== null && "done" in value
    ? value.done === true
    : false;
}

/**
 * Progress over the private index's "tour" map (and an optional shared device map): each scenario ticked is kept under
 * its id as `{ done: true, at }`, `at` when it was ticked (milliseconds since the epoch); unticking clears both maps.
 */
export function createTourProgress(
  map: KeyValueMap,
  shared: KeyValueMap | null = null,
): {
  done(id: string): boolean;
  mark(id: string, done: boolean, at: number): void;
  subscribe(listener: () => void): () => void;
} {
  return {
    done(id) {
      return isMarkedDone(map, id) || isMarkedDone(shared, id);
    },
    mark(id, done, at) {
      // a settings map has no delete: null reads as absent
      const entry = done ? { done: true, at } : null;
      map.set(id, entry);
      shared?.set(id, entry);
    },
    subscribe(listener) {
      const stopMap = map.subscribe(() => listener());
      const stopShared = shared?.subscribe(() => listener()) ?? null;
      return () => {
        stopMap();
        stopShared?.();
      };
    },
  };
}

/** Clears the demo's shared progress mirror and this tab's persisted Tour step when the demo is reset. */
export function clearDemoTourStorage(
  storage: Storage | null,
  tabStorage: TabStorage | null = null,
): void {
  try {
    storage?.removeItem(TOUR_SHARED_KEY);
  } catch {
    // storage that refuses writes holds no persisted demo Tour progress
  }
  try {
    tabStorage?.removeItem(TOUR_ACTIVE_KEY);
  } catch {
    // tab storage that refuses writes holds no persisted Tour step
  }
}
