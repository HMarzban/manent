// What a headless client typed, and how much of it the server has acknowledged.

export interface AckLedger {
  typed(marker: string): void;
  /** The first `count` markers typed are acknowledged; a lower count than before changes nothing. RangeError beyond those typed. */
  acknowledgedThrough(count: number): void;
  acknowledged(): string[];
  all(): string[];
}

export function createAckLedger(): AckLedger {
  const markers: string[] = [];
  let acknowledged = 0;
  return {
    typed(marker) {
      markers.push(marker);
    },
    acknowledgedThrough(count) {
      if (!Number.isInteger(count) || count < 0 || count > markers.length)
        throw new RangeError(
          `an acknowledged count is an integer from 0 to ${markers.length}, not ${count}`,
        );
      acknowledged = Math.max(acknowledged, count);
    },
    acknowledged: () => markers.slice(0, acknowledged),
    all: () => [...markers],
  };
}
