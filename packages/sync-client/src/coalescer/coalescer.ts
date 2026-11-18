// Remote updates, already stored, applied to the bound document at most once a frame and
// never during a composition.
import { mergeUpdates } from "@manent/crdt";
import { FLUSH_FALLBACK_MS } from "../ports/defaults.ts";
import type { Clock, Frames } from "../ports/ports.ts";

/**
 * The first push into an empty buffer asks for a frame and sets a timer of
 * `fallbackMs`; whichever comes first applies the whole buffer, merged, in one
 * call. While held (a composition) nothing is applied or scheduled; the last
 * `release` applies at once. `pending` counts the updates buffered. A push that
 * arrives while `apply` runs waits for the next flush. After `dispose`, `push`
 * throws RangeError.
 */
export interface Coalescer {
  /** An update that is already in the local store. */
  push(update: Uint8Array, throughLocalSeq: number): void;
  /** Holds nest; `release` without a hold throws RangeError. */
  hold(): void;
  release(): void;
  /** Applies what is buffered, unless held. */
  flushNow(): void;
  pending(): number;
  /** Cancels what is scheduled; it applies what is buffered first, unless held. */
  dispose(): void;
}

/** `apply` gets the buffer merged and the highest `throughLocalSeq` pushed into it. */
export function createCoalescer(options: {
  apply(merged: Uint8Array, throughLocalSeq: number): void;
  frames: Frames;
  clock: Clock;
  fallbackMs?: number;
}): Coalescer {
  const { apply, frames, clock } = options;
  const fallbackMs = options.fallbackMs ?? FLUSH_FALLBACK_MS;
  let buffer: { update: Uint8Array; throughLocalSeq: number }[] = [];
  let holds = 0;
  let applying = false;
  let disposed = false;
  let cancelFrame: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;

  const unschedule = (): void => {
    cancelFrame?.();
    cancelTimer?.();
    cancelFrame = null;
    cancelTimer = null;
  };

  const flush = (): void => {
    if (applying) return;
    unschedule();
    if (holds > 0 || buffer.length === 0) return;
    const taken = buffer;
    buffer = [];
    applying = true;
    try {
      apply(
        mergeUpdates(taken.map((entry) => entry.update)),
        taken.reduce((top, entry) => Math.max(top, entry.throughLocalSeq), 0),
      );
    } finally {
      applying = false;
    }
  };

  const schedule = (): void => {
    if (holds > 0 || cancelFrame !== null) return;
    cancelFrame = frames.request(flush);
    cancelTimer = clock.schedule(flush, fallbackMs);
  };

  return {
    push(update, throughLocalSeq) {
      if (disposed)
        throw new RangeError("a coalescer takes no update once disposed");
      buffer.push({ update, throughLocalSeq });
      schedule();
    },
    hold() {
      holds += 1;
      unschedule();
    },
    release() {
      if (holds === 0)
        throw new RangeError("a coalescer is released only after a hold");
      holds -= 1;
      flush();
    },
    flushNow: flush,
    pending: () => buffer.length,
    dispose() {
      flush();
      unschedule();
      buffer = [];
      disposed = true;
    },
  };
}
