// The loading rule's times, the same on every surface, and the clock surfaces read them by.
import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";

export const LOADING_QUIET_MS = 150;
export const LOADING_MIN_MS = 0;
export const SPINNER_AFTER_MS = 400;
export const PROGRESS_AFTER_MS = 2000;
export const STILL_WORKING_MS = 5000;
export const CANCEL_AFTER_MS = 10_000;

/** The clock and the timer a surface times itself by; `schedule` returns the function that cancels it. */
export interface Timing {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
}

const TimingContext = createContext<Timing | null>(null);

export function TimingProvider({
  timing,
  children,
}: {
  timing: Timing;
  children: ReactNode;
}): ReactNode {
  return createElement(TimingContext.Provider, { value: timing }, children);
}

/** Throws a TypeError outside a `TimingProvider`. */
export function useTiming(): Timing {
  const timing = useContext(TimingContext);
  if (timing === null)
    throw new TypeError("a surface's timing is read outside a TimingProvider");
  return timing;
}
