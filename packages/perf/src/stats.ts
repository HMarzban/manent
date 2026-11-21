// Nearest-rank percentiles and bootstrap intervals over samples. Never a mean.

/** Nearest rank on a sorted copy: the smallest sample with at least p % of samples at or below it. */
export function percentile(samples: readonly number[], p: number): number {
  return nearestRank(Float64Array.from(samples).toSorted(), p);
}

function nearestRank(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) throw new RangeError("no samples");
  if (!(p >= 0 && p <= 100))
    throw new RangeError(`a percentile must be from 0 to 100, not ${p}`);
  const rank = Math.max(1, Math.ceil((p * sorted.length) / 100));
  return sorted[rank - 1]!;
}

/** A 32-bit seeded generator (mulberry32), so an interval is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 95 % percentile-bootstrap interval of the p-th percentile. */
export function bootstrapInterval(
  samples: readonly number[],
  p: number,
  options: { rounds: number; seed: number },
): [number, number] {
  if (samples.length === 0) throw new RangeError("no samples");
  if (!Number.isInteger(options.rounds) || options.rounds < 1)
    throw new RangeError(
      `rounds must be a positive integer, not ${options.rounds}`,
    );
  const random = seededRandom(options.seed);
  const n = samples.length;
  const resample = new Float64Array(n);
  const estimates = new Float64Array(options.rounds);
  for (let round = 0; round < options.rounds; round++) {
    for (let i = 0; i < n; i++)
      resample[i] = samples[Math.floor(random() * n)]!;
    estimates[round] = nearestRank(resample.toSorted(), p);
  }
  const sorted = estimates.toSorted();
  return [nearestRank(sorted, 2.5), nearestRank(sorted, 97.5)];
}

/** The resamples and seed of every interval the benchmark and the demo's Timings show. */
export const INTERVAL_OPTIONS = { rounds: 1000, seed: 4747 } as const;

export interface Summary {
  /** How many samples were summarised. */
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  /** The largest sample. */
  max: number;
  intervals: {
    p50: [number, number];
    p95: [number, number];
    p99: [number, number];
  };
}

/** Nearest-rank p50, p95 and p99 with their intervals, and the largest sample. Throws a RangeError on an empty list. */
export function summarise(samples: readonly number[]): Summary {
  const sorted = Float64Array.from(samples).toSorted();
  return {
    samples: sorted.length,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
    max: sorted[sorted.length - 1]!,
    intervals: {
      p50: bootstrapInterval(samples, 50, INTERVAL_OPTIONS),
      p95: bootstrapInterval(samples, 95, INTERVAL_OPTIONS),
      p99: bootstrapInterval(samples, 99, INTERVAL_OPTIONS),
    },
  };
}
