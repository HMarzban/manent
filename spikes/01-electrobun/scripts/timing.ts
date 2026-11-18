// The timing lock's handshake, the machine's load, and the bootstrap interval every compared statistic carries.
import { loadavg } from 'node:os'

const RESAMPLES = 10_000
const SEED = 1

export interface Interval {
  lo: number
  hi: number
}

/**
 * Exits 1 with "not under the timing lock" unless `timed.sh` started this process, and returns the load baseline
 * it sampled. On a CI runner it never exits and the baseline is null, because a runner's load is not controlled.
 */
export function requireTimed (): { baseline: number | null } {
  if (process.env.CI) return { baseline: null }
  const baseline = Number.parseFloat(process.env.MANENT_LOAD_BASELINE ?? '')
  if (process.env.MANENT_TIMED !== '1' || !Number.isFinite(baseline)) {
    console.error('not under the timing lock')
    process.exit(1)
  }
  return { baseline }
}

/** The machine's 1-minute load average. */
export function load1 (): number {
  return loadavg()[0] ?? 0
}

/** A 32-bit generator, so that every interval is the same on every run. */
function seeded (seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T> (values: T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]!
}

function resampleRun (run: number[], within: boolean, random: () => number): number[] {
  return within ? run.map(() => pick(run, random)) : run
}

/**
 * The 95 % percentile interval of `stat` over 10,000 resamples (seed 1). Each group is a list of runs; whole runs are
 * drawn first, then, unless `within` is false, the samples inside each drawn run. `paired` draws the same run indices
 * in every group, for runs that were measured together, so every group must then hold the same number of runs.
 */
export function bootstrap (groups: number[][][], stat: (resampled: number[][][]) => number, opts?: { paired?: boolean; within?: boolean }): Interval {
  const paired = opts?.paired ?? false
  const within = opts?.within ?? true
  const runs = groups[0]?.length ?? 0
  if (paired && groups.some(group => group.length !== runs)) throw new RangeError('paired groups must hold the same number of runs')
  const random = seeded(SEED)
  const stats: number[] = []
  for (let r = 0; r < RESAMPLES; r++) {
    const shared = paired ? Array.from({ length: runs }, () => Math.floor(random() * runs)) : null
    const resampled = groups.map(group => {
      const indices = shared ?? group.map(() => Math.floor(random() * group.length))
      return indices.map(i => resampleRun(group[i]!, within, random))
    })
    stats.push(stat(resampled))
  }
  stats.sort((a, b) => a - b)
  return { lo: stats[Math.floor(0.025 * RESAMPLES)]!, hi: stats[Math.ceil(0.975 * RESAMPLES) - 1]! }
}

/** `within` when the whole interval is at or under `limit`, `over` when it is wholly above, otherwise `inconclusive`. */
export function decide (ci: Interval, limit: number): 'within' | 'over' | 'inconclusive' {
  if (ci.hi <= limit) return 'within'
  if (ci.lo > limit) return 'over'
  return 'inconclusive'
}
