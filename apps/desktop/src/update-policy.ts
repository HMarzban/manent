// When an update may be applied, and what the page is told while the app looks for one.
import type { UpdateState } from "@manent/sync-protocol";

/** At launch, the longest wait for the update check before the node starts. */
export const LAUNCH_UPDATE_WAIT_MS = 1000;

/** Quiet periodic background check interval while the desktop app stays open (6 hours). */
export const PERIODIC_UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

export type UpdateMoment = "launch" | "running";

/** Applying quits the app and opens the new version, so it happens only before the node starts. */
export function mayApplyUpdate(moment: UpdateMoment): boolean {
  return moment === "launch";
}

/**
 * Repeats `check()` every `intervalMs` while running, skipping ticks when `canCheck()` is false
 * (for example while offline or after an update is already staged). Calling `stop()` clears any
 * pending timer immediately.
 */
export function createPeriodicUpdateScheduler(options: {
  schedule(fn: () => void, delayMs: number): () => void;
  intervalMs?: number;
  canCheck(): boolean;
  check(): void;
}): { start(): void; stop(): void } {
  const intervalMs = options.intervalMs ?? PERIODIC_UPDATE_CHECK_MS;
  let cancel: (() => void) | null = null;
  let active = false;
  const arm = (): void => {
    if (!active) return;
    cancel = options.schedule(() => {
      cancel = null;
      if (!active) return;
      if (options.canCheck()) options.check();
      arm();
    }, intervalMs);
  };
  return {
    start() {
      if (active) return;
      active = true;
      arm();
    },
    stop() {
      active = false;
      cancel?.();
      cancel = null;
    },
  };
}

/** A check while one runs, or once an update is ready, keeps the state: it starts nothing. */
export function nextUpdateState(
  current: UpdateState | null,
  event: "check" | "none" | "downloaded" | "failed",
): UpdateState {
  switch (event) {
    case "check":
      return current === "checking" || current === "ready"
        ? current
        : "checking";
    case "none":
      return "up_to_date";
    case "downloaded":
      return "ready";
    case "failed":
      return "check_failed";
  }
}
