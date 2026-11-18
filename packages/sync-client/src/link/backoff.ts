// The wait before a reconnect: exponential backoff with full jitter.
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "../ports/defaults.ts";

/**
 * A wait in [0, min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt)), chosen by
 * `random`. Throws RangeError for an attempt that is not a whole number ≥ 0, or
 * a random outside [0, 1).
 */
export function backoffDelayMs(attempt: number, random: number): number {
  if (!Number.isInteger(attempt) || attempt < 0)
    throw new RangeError(
      `a backoff attempt must be a whole number ≥ 0, not ${attempt}`,
    );
  if (!(random >= 0 && random < 1))
    throw new RangeError(`a backoff random must be in [0, 1), not ${random}`);
  return Math.floor(
    random * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt),
  );
}
