// The upstream clients' clock, chance and frames in Bun: real time, the system's randomness, and no frames.
import type { SyncClientPorts } from "@manent/sync-client";

/** Frames never fire, so a client applies what the server sends at its 50 ms fallback. */
export function bunUpstreamPorts(options: {
  now: () => number;
  random: () => number;
  bytes: (n: number) => Uint8Array;
}): Pick<SyncClientPorts, "clock" | "random" | "frames"> {
  const { now, random, bytes } = options;
  return {
    clock: {
      now,
      schedule(fn, delayMs) {
        const timer = setTimeout(fn, delayMs);
        return () => clearTimeout(timer);
      },
    },
    random: {
      next: random,
      clientId() {
        const drawn = bytes(4);
        return new DataView(drawn.buffer, drawn.byteOffset, 4).getUint32(0);
      },
      bytes,
    },
    frames: { request: () => () => {} },
  };
}
