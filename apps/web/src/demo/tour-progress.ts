// Tour progress, kept in the person's private index so it follows them to their other tabs and devices.
import type { KeyValueMap } from "@manent/settings";

/**
 * Progress over the private index's "tour" map: each scenario done is kept under its id as `{ done: true, at }`, `at`
 * when it was ticked (milliseconds since the epoch); unticking clears it. `subscribe` is told of every change.
 */
export function createTourProgress(map: KeyValueMap): {
  done(id: string): boolean;
  mark(id: string, done: boolean, at: number): void;
  subscribe(listener: () => void): () => void;
} {
  return {
    done(id) {
      const value = map.get(id);
      return typeof value === "object" && value !== null && "done" in value
        ? value.done === true
        : false;
    },
    mark(id, done, at) {
      // a settings map has no delete: null reads as absent
      map.set(id, done ? { done: true, at } : null);
    },
    subscribe: (listener) => map.subscribe(() => listener()),
  };
}
