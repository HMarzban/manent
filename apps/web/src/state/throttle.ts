// Publishing at most once per delay, always from a scheduled callback and so never inside the caller's own work.

import { mark } from "@manent/perf";
import type { Guard } from "./guard.ts";

type Schedule = (fn: () => void, delayMs: number) => () => void;

const THROTTLE_MS = 250;

/** `publish` runs `delayMs` after the first `request` since the last publish, never while `paused()`: a paused publish waits another `delayMs`. */
export function throttle(
  options: { delayMs: number; schedule: Schedule; paused: () => boolean },
  publish: () => void,
): { request(): void; cancel(): void } {
  let cancelTimer: (() => void) | null = null;
  const fire = (): void => {
    if (options.paused()) {
      cancelTimer = options.schedule(fire, options.delayMs);
      return;
    }
    cancelTimer = null;
    publish();
  };
  return {
    request() {
      if (cancelTimer === null)
        cancelTimer = options.schedule(fire, options.delayMs);
    },
    cancel() {
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}

const isShallowEqual = (a: object, b: object): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is(Reflect.get(a, key), Reflect.get(b, key)))
  );
};

/** A list of flat records published every 250 ms at most, the latest at the end, never while `composing()`. An item equal to the one at its index keeps that one's reference, and an unchanged list is not published. Each publish is checked with `guard` under `name`. */
export function createThrottledList<T extends object>(options: {
  name: string;
  markName?: string;
  guard: Guard;
  schedule: Schedule;
  composing: () => boolean;
}): {
  publish(items: readonly T[]): void;
  get(): readonly T[];
  subscribe(listener: () => void): () => void;
} {
  let current: readonly T[] = [];
  let latest: readonly T[] = current;
  const listeners = new Set<() => void>();
  const commit = (): void => {
    const next = latest.map((item, i) => {
      const before = current[i];
      return before !== undefined && isShallowEqual(before, item)
        ? before
        : item;
    });
    if (
      next.length === current.length &&
      next.every((item, i) => item === current[i])
    )
      return;
    options.guard.check(options.name);
    current = next;
    for (const listener of listeners) listener();
  };
  const publishing = throttle(
    {
      delayMs: THROTTLE_MS,
      schedule: options.schedule,
      paused: options.composing,
    },
    () => {
      if (options.markName !== undefined) mark(options.markName, commit);
      else commit();
    },
  );
  return {
    publish(items) {
      latest = items;
      publishing.request();
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
