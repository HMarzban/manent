// Reads a measure file: Electrobun's cold start against Electron's, and which editing checks differ between the shells.
// Usage: bun scripts/compare.ts <measure file> --out <file>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bootstrap, decide } from './timing.ts'
import type { Interval } from './timing.ts'

const CHECKS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const
const REFERENCE_RATIO = 1.5
const COLD_START = { over: 'over 1.5x', within: 'within 1.5x', inconclusive: 'inconclusive' } as const

type Check = typeof CHECKS[number]

interface Editing {
  innerWidth: unknown
  innerHeight: unknown
  devicePixelRatio: unknown
  checks: Record<Check, unknown>
}

interface Comparison {
  coldStartRatio: number | null
  ratioCI: Interval | null
  coldStart: 'over 1.5x' | 'within 1.5x' | 'inconclusive' | 'not run'
  editingDiffs: Check[]
  notRun: Check[]
  editing: 'differs' | 'same' | 'not run'
}

class CompareFailure extends Error {}

function median (values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Each launch as a run of one sample, so that the paired resampling draws whole pairs. */
function asRuns (ms: number[]): number[][] {
  return ms.map(x => [x])
}

function ratioOfMedians (g: number[][][]): number {
  return median(g[0]!.flat()) / median(g[1]!.flat())
}

function field (value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/** Each pair's cold starts, Electrobun's first; a pair missing either is a malformed file, not a skipped pair. */
function readColdStarts (pairs: unknown): { electrobun: number[]; electron: number[] } {
  if (!Array.isArray(pairs)) throw new CompareFailure('the measure file has no pairs')
  const coldStart = (pair: unknown, shell: string): number => {
    const ms = field(field(pair, shell), 'coldStartMs')
    if (typeof ms !== 'number') throw new CompareFailure(`a pair has no ${shell} cold start`)
    return ms
  }
  return { electrobun: pairs.map(p => coldStart(p, 'electrobun')), electron: pairs.map(p => coldStart(p, 'electron')) }
}

function readEditing (editing: unknown, shell: string): Editing | null {
  const value = field(editing, shell)
  const checks = field(value, 'checks')
  if (typeof checks !== 'object' || checks === null) return null
  const get = (c: Check): unknown => Reflect.get(checks, c) ?? 'not run'
  return {
    innerWidth: field(value, 'innerWidth'),
    innerHeight: field(value, 'innerHeight'),
    devicePixelRatio: field(value, 'devicePixelRatio'),
    checks: { C1: get('C1'), C2: get('C2'), C3: get('C3'), C4: get('C4'), C5: get('C5'), C6: get('C6'), C7: get('C7') }
  }
}

/** A check is compared only when it ran in both shells, in windows of the same size and pixel ratio. */
function compareEditing (a: Editing | null, b: Editing | null): Pick<Comparison, 'editingDiffs' | 'notRun' | 'editing'> {
  if (a === null || b === null) return { editingDiffs: [], notRun: [...CHECKS], editing: 'not run' }
  const sameWindow = (['innerWidth', 'innerHeight', 'devicePixelRatio'] as const).every(k => typeof a[k] === 'number' && a[k] === b[k])
  const comparable = (c: Check): boolean => sameWindow && a.checks[c] !== 'not run' && b.checks[c] !== 'not run'
  const editingDiffs = CHECKS.filter(c => comparable(c) && !Bun.deepEquals(a.checks[c], b.checks[c]))
  const notRun = CHECKS.filter(c => !comparable(c))
  const editing = editingDiffs.length > 0 ? 'differs' : notRun.length > 0 ? 'not run' : 'same'
  return { editingDiffs, notRun, editing }
}

function compare (file: string): Comparison {
  if (!existsSync(file)) return { coldStartRatio: null, ratioCI: null, coldStart: 'not run', editingDiffs: [], notRun: [...CHECKS], editing: 'not run' }
  const m: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const cold = readColdStarts(field(m, 'pairs'))
  const editing = compareEditing(readEditing(field(m, 'editing'), 'electrobun'), readEditing(field(m, 'editing'), 'electron'))
  if (cold.electrobun.length === 0) return { coldStartRatio: null, ratioCI: null, coldStart: 'not run', ...editing }
  const ratioCI = bootstrap([asRuns(cold.electrobun), asRuns(cold.electron)], ratioOfMedians, { paired: true })
  return { coldStartRatio: median(cold.electrobun) / median(cold.electron), ratioCI, coldStart: COLD_START[decide(ratioCI, REFERENCE_RATIO)], ...editing }
}

function table (c: Comparison): string {
  const interval = c.ratioCI ? `${c.ratioCI.lo.toFixed(2)}–${c.ratioCI.hi.toFixed(2)}` : 'not run'
  const rows: Array<[string, string]> = [
    ['cold start ratio (Electrobun ÷ Electron)', c.coldStartRatio === null ? 'not run' : c.coldStartRatio.toFixed(2)],
    ['95 % interval', interval],
    ['cold start', c.coldStart],
    ['editing', c.editing],
    ['checks that differ', c.editingDiffs.join(', ') || 'none'],
    ['checks not compared', c.notRun.join(', ') || 'none']
  ]
  return rows.map(([name, value]) => `${name.padEnd(42)}${value}`).join('\n')
}

if (import.meta.main) {
  const [file, flag, out] = process.argv.slice(2)
  if (!file || flag !== '--out' || !out) {
    console.error('usage: bun scripts/compare.ts <measure file> --out <file>')
    process.exit(1)
  }
  try {
    const c = compare(resolve(file))
    writeFileSync(resolve(out), JSON.stringify(c, null, 2) + '\n')
    console.log(table(c))
  } catch (error) {
    if (!(error instanceof CompareFailure)) throw error
    console.error(`compare: ${error.message}`)
    process.exit(1)
  }
}
