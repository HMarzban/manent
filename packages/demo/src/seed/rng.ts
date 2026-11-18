// A seeded generator, so that the demo seeds the same content on every machine.
import type { IdSource } from "@manent/schema";

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ID_LENGTH = 16;

export interface Rng {
  /** In [0, 1). */
  next(): number;
  /** An integer from `min` to `maxInclusive`; throws a RangeError unless both are integers and `min <= maxInclusive`. */
  int(min: number, maxInclusive: number): number;
  /** Throws a RangeError for an empty list. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: the same `seed` draws the same numbers everywhere. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, maxInclusive: number): number => {
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(maxInclusive) ||
      maxInclusive < min
    )
      throw new RangeError(
        `an integer range needs integers with min <= max, not ${min} to ${maxInclusive}`,
      );
    return min + Math.floor(next() * (maxInclusive - min + 1));
  };
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0)
        throw new RangeError("cannot pick from an empty list");
      return items[int(0, items.length - 1)]!;
    },
  };
}

/** IDs in the shape of a block ID (16 characters of [A-Za-z0-9_-]), drawn from `rng`. */
export function seededIdSource(rng: Rng): IdSource {
  return () => {
    let id = "";
    for (let i = 0; i < ID_LENGTH; i += 1)
      id += ID_ALPHABET[rng.int(0, ID_ALPHABET.length - 1)];
    return id;
  };
}
