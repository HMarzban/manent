// A machine that slept: a tick of the clock that comes much later than it was asked for.
import type { Clock } from "@manent/sync-client";

/** Ticks every `tickMs`; a tick that comes more than `gapMs` late calls `onWake`. Returns stop. */
export function createWakeWatch(options: {
  clock: Clock;
  tickMs: number;
  gapMs: number;
  onWake(): void;
}): () => void {
  const { clock, tickMs, gapMs } = options;
  let last = clock.now();
  let cancel = clock.schedule(tick, tickMs);
  function tick(): void {
    const now = clock.now();
    if (now - last - tickMs > gapMs) options.onWake();
    last = now;
    cancel = clock.schedule(tick, tickMs);
  }
  return () => cancel();
}
