// The seed's clock: times written in the seed's notation, read against the moment the seed runs.

/** 18:00 as ms after midnight: the clock time that `nowAt` stands for in every "D−d hh:mm". */
export const REFERENCE_CLOCK_MS = 64_800_000;
export const HALF_HOUR_MS = 1_800_000;
/** A seeded day is exactly this long, so a daylight-saving change between two days moves a clock time by the change. */
export const DAY_MS = 86_400_000;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

// U+2212 and "-" are both a minus.
/** `N`, `N+h:mm`, `N−h:mm`: hours and minutes after or before `nowAt`. */
const FROM_NOW = new RegExp("^N(?:([+−-])(\\d+):([0-5]\\d))?$");
/** `D hh:mm`, `D+d hh:mm`, `D−d hh:mm`: a clock time on a day after or before `nowAt`'s. */
const ON_DAY = new RegExp("^D(?:([+−-])(\\d+))? ([01]\\d|2[0-3]):([0-5]\\d)$");
/** `D−d`: 18:00, `d` days before `nowAt`. */
const DAYS_BEFORE = new RegExp("^D[−-](\\d+)$");

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

const signOf = (sign: string): number => (sign === "+" ? 1 : -1);

/** The offset from `nowAt` that `spec` names, in ms; null when it is not in the seed's notation. */
function offsetOf(spec: string): number | null {
  const fromNow = FROM_NOW.exec(spec);
  if (fromNow !== null) {
    const [, sign, hours, minutes] = fromNow;
    if (sign === undefined) return 0;
    return (
      signOf(sign) * (Number(hours) * HOUR_MS + Number(minutes) * MINUTE_MS)
    );
  }
  const onDay = ON_DAY.exec(spec);
  if (onDay !== null) {
    const [, sign, days, hours, minutes] = onDay;
    const dayMs = sign === undefined ? 0 : signOf(sign) * Number(days) * DAY_MS;
    return (
      dayMs +
      Number(hours) * HOUR_MS +
      Number(minutes) * MINUTE_MS -
      REFERENCE_CLOCK_MS
    );
  }
  const daysBefore = DAYS_BEFORE.exec(spec);
  if (daysBefore !== null) return -Number(daysBefore[1]) * DAY_MS;
  return null;
}

/** `zoneOffsetMs` is the local offset east of UTC at `seedAt` (UTC+1 is 3_600_000). */
export function createSeedTime(options: {
  seedAt: number;
  zoneOffsetMs: number;
}): SeedTime {
  const { seedAt, zoneOffsetMs } = options;
  const localAt = seedAt + zoneOffsetMs;
  const nowAt =
    (Math.floor(localAt / HALF_HOUR_MS) + 1) * HALF_HOUR_MS - zoneOffsetMs;
  return {
    seedAt,
    nowAt,
    at(spec) {
      const offset = offsetOf(spec);
      if (offset === null) throw new SeedTimeError(spec);
      return nowAt + offset;
    },
    day: (at) => new Date(at + zoneOffsetMs).toISOString().slice(0, 10),
  };
}
