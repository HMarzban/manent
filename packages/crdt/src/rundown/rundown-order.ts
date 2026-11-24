// Fractional order keys for rundown rows, built over the shared base-62 order-key helper.
import { orderKeyBetween } from "../order-key.ts";

/**
 * A base-62 fractional key that sorts strictly after `before` and before `after`
 * as plain strings; null for the start or the end of the rundown. Concurrent
 * ties are broken by row id.
 */
export function orderBetween(
  before: string | null,
  after: string | null,
): string {
  return orderKeyBetween(before, after);
}

/** Plain code-unit comparison matching the base-62 digit order. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function fillKeys(
  out: string[],
  low: string | null,
  high: string | null,
  count: number,
): void {
  if (count === 0) return;
  const leftCount = Math.floor((count - 1) / 2);
  const rightCount = count - 1 - leftCount;
  const mid = orderBetween(low, high);
  fillKeys(out, low, mid, leftCount);
  out.push(mid);
  fillKeys(out, mid, high, rightCount);
}

/**
 * `count` strictly ascending base-62 keys between `low` and `high`, balanced so
 * batch inserts keep key lengths short.
 */
export function keysBetween(
  low: string | null,
  high: string | null,
  count: number,
): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  fillKeys(out, low, high, count);
  return out;
}
