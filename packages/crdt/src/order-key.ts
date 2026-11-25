// Fractional order keys: a key between any two keys, so a move writes one entry and never renumbers the others.

/** The base-62 digits in code-unit order, so keys compare as plain strings. */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY = new RegExp("^[0-9A-Za-z]*[1-9A-Za-z]$");

const digitAt = (key: string, at: number): number =>
  at < key.length ? DIGITS.indexOf(key.charAt(at)) : 0;

/** A key strictly between `low` ("" for the start) and `high` (null for the end); neither ends in "0". */
function between(low: string, high: string | null): string {
  if (high !== null) {
    let shared = 0;
    while (
      shared < high.length &&
      digitAt(low, shared) === digitAt(high, shared)
    )
      shared++;
    if (shared > 0)
      return (
        high.slice(0, shared) + between(low.slice(shared), high.slice(shared))
      );
  }
  const lowDigit = digitAt(low, 0);
  const highDigit = high === null ? DIGITS.length : digitAt(high, 0);
  if (highDigit - lowDigit > 1)
    return DIGITS.charAt(Math.round((lowDigit + highDigit) / 2));
  if (high !== null && high.length > 1) return high.slice(0, 1);
  return DIGITS.charAt(lowDigit) + between(low.slice(1), null);
}

/**
 * A base-62 key that sorts after `before` and before `after` as strings; null
 * for the start or the end of the list. Two entries that concurrent writers gave
 * one key are ordered by their ids. Throws a RangeError for a key that is not
 * base-62 digits ending in one other than "0", or when `before` does not sort
 * before `after`.
 */
export function orderKeyBetween(
  before: string | null,
  after: string | null,
): string {
  for (const key of [before, after])
    if (key !== null && !KEY.test(key))
      throw new RangeError(`an order key must be base-62 digits, not "${key}"`);
  if (before !== null && after !== null && before >= after)
    throw new RangeError(
      `an order key must sort before the next, not "${before}" before "${after}"`,
    );
  return between(before ?? "", after);
}
