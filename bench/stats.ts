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
