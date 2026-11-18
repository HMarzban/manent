// A clock for tests: time moves only when the test says so.
import type { Clock } from "../ports/ports.ts";

/**
 * `advance` runs every timer that falls due, in order of due time and then of
 * scheduling, including those scheduled while it runs. `jump` moves `now()` and
 * runs nothing, as a machine that slept. `pending` counts the timers neither run
 * nor cancelled.
 */
export interface FakeClock {
  clock: Clock;
  advance(ms: number): void;
  jump(toNow: number): void;
  pending(): number;
}

interface Timer {
  dueAt: number;
  fn: () => void;
}

/** Starts at `startAt`, 0 by default. */
export function createFakeClock(startAt: number = 0): FakeClock {
  let now = startAt;
  // sorted by dueAt; timers due at the same time keep the order they were scheduled in
  const timers: Timer[] = [];

  const schedule = (fn: () => void, delayMs: number): (() => void) => {
    const timer: Timer = { dueAt: now + delayMs, fn };
    const at = timers.findIndex((other) => other.dueAt > timer.dueAt);
    timers.splice(at === -1 ? timers.length : at, 0, timer);
    return () => {
      const index = timers.indexOf(timer);
      if (index !== -1) timers.splice(index, 1);
    };
  };

  const advance = (ms: number): void => {
    const until = now + ms;
    for (let next = timers[0]; next && next.dueAt <= until; next = timers[0]) {
      timers.shift();
      now = Math.max(now, next.dueAt);
      next.fn();
    }
    now = until;
  };

  return {
    clock: { now: () => now, schedule },
    advance,
    jump: (toNow) => {
      now = toNow;
    },
    pending: () => timers.length,
  };
}
