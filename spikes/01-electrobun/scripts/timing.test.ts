import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap, decide } from './timing.ts'

const tmp = mkdtempSync(join(tmpdir(), 'manent-spike-01-timing-'))
let files = 0

afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function median (values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function fileHolding (text: string): string {
  const file = join(tmp, `file-${files++}`)
  writeFileSync(file, text)
  return file
}

test('decide needs the whole interval on one side', () => {
  expect(decide({ lo: 1.1, hi: 1.4 }, 1.5)).toBe('within')
  expect(decide({ lo: 1.6, hi: 2.3 }, 1.5)).toBe('over')
  expect(decide({ lo: 1.2, hi: 1.9 }, 1.5)).toBe('inconclusive')
})

test('bootstrap is seeded and brackets the statistic', () => {
  const runs = [[10, 11, 12], [20, 21, 22], [10, 12, 11]]
  const stat = (g: number[][][]): number => median(g[0]!.flat())
  expect(bootstrap([runs], stat)).toEqual(bootstrap([runs], stat))
  const ci = bootstrap([runs], stat)
  expect(ci.lo).toBeLessThanOrEqual(12); expect(ci.hi).toBeGreaterThanOrEqual(11)
})

test('paired groups are resampled together', () => {
  const a = [[300], [330], [360]], b = [[100], [110], [120]] // always 3x, run by run
  const ratio = (g: number[][][]): number => median(g[0]!.flat()) / median(g[1]!.flat())
  expect(bootstrap([a, b], ratio, { paired: true })).toEqual({ lo: 3, hi: 3 })
})

test('timed.sh does not start a run on a busy machine', () => {
  const env = { ...process.env, MANENT_TIMING_LOCK: join(tmp, 'lock'), MANENT_LOAD_WAIT: '0' }
  const busy = Bun.spawnSync(['sh', 'scripts/timed.sh', 'sh', '-c', 'echo ran'], { env: { ...env, MANENT_LOAD_FILE: fileHolding('9.5') } })
  expect(busy.exitCode).toBe(75); expect(busy.stdout.toString()).toBe('')
  const quiet = Bun.spawnSync(['sh', 'scripts/timed.sh', 'sh', '-c', 'echo $MANENT_TIMED $MANENT_LOAD_BASELINE'], { env: { ...env, MANENT_LOAD_FILE: fileHolding('1.5') } })
  expect(quiet.stdout.toString().trim()).toBe('1 1.5')
})
