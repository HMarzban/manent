// The seed's clock: times written in the seed's notation, read against the moment the seed runs.

export interface SeedTime {
  /** The moment the seed runs, epoch ms. */
  readonly seedAt: number;
  /** The first local hh:00 or hh:30 strictly after `seedAt`, epoch ms. */
  readonly nowAt: number;
  /** The epoch ms of a time written in the seed's notation ("N−2:40", "D−9 16:12"); throws SeedTimeError for any other text. */
  at(spec: string): number;
  /** The local calendar day of `at`, "YYYY-MM-DD". */
  day(at: number): string;
}

/** A time the seed's notation cannot read. */
export class SeedTimeError extends Error {
  readonly code: "bad_time";
  readonly spec: string;

  constructor(spec: string) {
    super(`bad_time: ${JSON.stringify(spec)}`);
    this.name = "SeedTimeError";
    this.code = "bad_time";
    this.spec = spec;
  }
}

/** `zoneOffsetMs` is the local offset east of UTC at `seedAt` (UTC+1 is 3_600_000). */
export function createSeedTime(options: {
  seedAt: number;
  zoneOffsetMs: number;
}): SeedTime {
  return {
    seedAt: options.seedAt,
    nowAt: options.seedAt,
    at: () => options.seedAt,
    day: () => "",
  };
}
