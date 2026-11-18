import { expect, test } from "bun:test";
import { bootstrapInterval, percentile } from "../stats.ts";

test("percentiles use nearest rank", () => {
  const s = Array.from({ length: 100 }, (_, i) => i + 1);
  expect([percentile(s, 50), percentile(s, 95), percentile(s, 99)]).toEqual([
    50, 95, 99,
  ]);
  expect(percentile([7], 99)).toBe(7);
  expect(percentile([3, 1, 2], 50)).toBe(2);
  expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  expect(percentile([1, 2, 3, 4], 0)).toBe(1);
  expect(() => percentile([], 50)).toThrow(RangeError);
  expect(() => percentile([1], 101)).toThrow(RangeError);
  expect(() => percentile([1], Number.NaN)).toThrow(RangeError);
});

test("the bootstrap interval is deterministic for a seed and brackets the percentile", () => {
  const s = Array.from({ length: 200 }, (_, i) => ((i * 37) % 101) + i / 10);
  for (const p of [50, 95, 99]) {
    const a = bootstrapInterval(s, p, { rounds: 1000, seed: 4747 });
    const b = bootstrapInterval(s, p, { rounds: 1000, seed: 4747 });
    expect(a).toEqual(b);
    const [lo, hi] = a;
    expect(lo).toBeLessThanOrEqual(percentile(s, p));
    expect(hi).toBeGreaterThanOrEqual(percentile(s, p));
    expect(lo).toBeLessThan(hi);
  }
  expect(bootstrapInterval(s, 50, { rounds: 1000, seed: 1 })).not.toEqual(
    bootstrapInterval(s, 50, { rounds: 1000, seed: 4747 }),
  );
  expect(bootstrapInterval([5, 5, 5], 95, { rounds: 100, seed: 4747 })).toEqual(
    [5, 5],
  );
  expect(() => bootstrapInterval([], 50, { rounds: 10, seed: 1 })).toThrow(
    RangeError,
  );
  expect(() => bootstrapInterval([1], 50, { rounds: 0, seed: 1 })).toThrow(
    RangeError,
  );
});
