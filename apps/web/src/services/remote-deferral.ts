// When a preference changed elsewhere lands here: at once, or at the next pause in the person's typing.

/** How long after the last key a change from elsewhere waits. */
const PAUSE_MS = 5000;

/**
 * Runs each `apply` at once while no key was pressed in the last `PAUSE_MS`, otherwise at the next pause
 * of that length after the last key; waiting applies run together, in arrival order.
 */
export function createRemoteDeferral(options: {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  lastKeyAt: () => number | null;
}): (apply: () => void) => void {
  const { now, schedule, lastKeyAt } = options;
  let waiting: (() => void)[] = [];
  let timer: (() => void) | null = null;
  const waitMs = (): number => {
    const last = lastKeyAt();
    return last === null ? 0 : Math.max(0, last + PAUSE_MS - now());
  };
  const flush = (): void => {
    const wait = waitMs();
    if (wait > 0) {
      timer = schedule(flush, wait);
      return;
    }
    timer = null;
    const due = waiting;
    waiting = [];
    for (const apply of due) apply();
  };
  return (apply) => {
    if (waiting.length === 0 && waitMs() === 0) {
      apply();
      return;
    }
    waiting.push(apply);
    timer ??= schedule(flush, waitMs());
  };
}
