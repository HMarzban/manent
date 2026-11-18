// bun harness/bench.ts <gate|matrix|fallback|sweep|zoom|breaks|cold> [loads]
// bun harness/bench.ts --summarise <gate|timing> [--dir <dir>]
// Keystroke to next frame, time inside view.dispatch, engine and decoration time, first editable frame, heap,
// scrolling, the frame in which many page breaks move, and cold repagination, under Chromium's CPU throttle.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, BrowserType, CDPSession, Page } from 'playwright'
import { assertFont, INIT, INSTRUMENT, pct, resultsDir, startServer } from './lib.ts'
import { bootstrap, decide, load1, requireTimed } from './timing.ts'
import type { Interval } from './timing.ts'

declare global {
  interface Window {
    __firstEditable?: { seenAt: number; afterFrame: number }
    __bench: { place(where: Position): void; reset(): void; results(): { samples: { pm: number; paint: number }[]; ev: number[] } }
  }
}

const POSITIONS = ['start', 'middle', 'end'] as const
type Position = (typeof POSITIONS)[number]
const WARMUP = 'warmup '
const SENTENCE = 'the quick brown fox jumps over the lazy dog '
const LOAD_TIMEOUT_MS = 180_000
const ATTEMPTS = 3
const BREAK_PRESSES = 20
const COLD_RUNS = 20

/** One page configuration of a suite; a row is written per configuration and throttle. */
interface Config {
  name: string
  measure: 'typing' | 'breaks' | 'cold'
  q: Record<string, string>
  throttles: readonly number[]
  loads: number
  /** Sentences typed at each position after the warm-up; one is 44 keystrokes. */
  sentences: number
  positions: readonly Position[]
  /** Also jump-scroll through the document once per load. */
  scroll: boolean
}

/** A suite's configurations; `interleaved` runs every configuration of one throttle load by load, in turn. */
export interface Suite {
  configs: readonly Config[]
  interleaved: boolean
}

export interface LoadInfo {
  loadStart: number
  loadEnd: number
  firstEditableMs: number
  /** Null outside Chromium, which alone reports it. */
  heapMB: number | null
}

export interface PositionStats {
  n: number
  p50: number | null
  p95: number | null
  p99: number | null
  max: number | null
  runP50s: (number | null)[]
  dispatchP50: number | null
  dispatchP95: number | null
  /** Keystroke to next frame and time inside view.dispatch, in ms, one array per load. */
  frame: number[][]
  dispatch: number[][]
}

interface TypingRow {
  name: string
  throttle: number
  version: string
  baseline: number | null
  loads: LoadInfo[]
  start: PositionStats | null
  middle: PositionStats | null
  end: PositionStats | null
  engine: { p50: number | null; p95: number | null }
  deco: { p50: number | null; p95: number | null }
  /** Engine plus decoration time per keystroke; null with pagination off. */
  engineDeco: { p95: number | null; ci: Interval | null }
  /** Frame times of a jump-scroll through the document in 60 steps, in ms, one array per load. */
  scroll: { p95: number | null; over50Pct: number; frames: number[][] } | null
}

interface BreaksRow {
  name: string
  throttle: number
  version: string
  baseline: number | null
  loads: LoadInfo[]
  /** Per Enter press, one array per load: keystroke to next frame in ms, and the page starts that moved. */
  frame: number[][]
  movedBreaks: number[][]
}

interface ColdRow {
  name: string
  throttle: number
  version: string
  baseline: number | null
  loads: LoadInfo[]
  /** Full repagination from a fresh copy of the blocks, in ms, one array per load. */
  cold: number[][]
  p50: number | null
  p95: number | null
}

/** What one position of one load measured, in ms: per keystroke, and per paginating transaction. */
export interface Sample {
  frame: number[]
  dispatch: number[]
  engineDeco: number[]
  engine: number[]
  deco: number[]
}

interface Measured {
  info: LoadInfo
  typing: Partial<Record<Position, Sample>>
  scroll: number[] | null
  breaks: { frame: number[]; movedBreaks: number[] } | null
  cold: number[] | null
}

const SEC = { wrap: '100', cv: 'auto' }
/**
 * A configuration on 100-block sections with `content-visibility: auto`, typing at every position, 3 loads, unless `q`
 * or `extra` say otherwise.
 */
export const pageConfig = (name: string, q: Record<string, string>, throttles: readonly number[], extra: Partial<Config> = {}): Config =>
  ({ name, measure: 'typing', q: { ...SEC, ...q }, throttles, loads: 3, sentences: 1, positions: POSITIONS, scroll: false, ...extra })

const PAGE_SIZES = [120, 1000, 2000] as const

export const SUITES = {
  gate: { interleaved: true, configs: [1, 0].map((pg) => pageConfig(`120p-pg${pg}`, { pages: '120', pg: String(pg) }, [6], { loads: 5, sentences: 5 })) },
  matrix: { interleaved: false, configs: PAGE_SIZES.flatMap((pages) => [1, 0].map((pg) => pageConfig(`${pages}p-pg${pg}`, { pages: String(pages), pg: String(pg) }, [1, 4, 6], { scroll: pg === 1 }))) },
  fallback: {
    interleaved: false,
    configs: [
      ...[1000, 2000].map((pages) => pageConfig(`${pages}p-nocv-pg1`, { pages: String(pages), cv: 'none', pg: '1' }, [1, 4, 6])),
      pageConfig('1000p-flat', { pages: '1000', wrap: '0', pg: '0' }, [1, 4, 6]),
      pageConfig('2000p-flat', { pages: '2000', wrap: '0', pg: '0' }, [1, 4]),
      // A key costs a few hundred ms here, so one load.
      pageConfig('2000p-flat', { pages: '2000', wrap: '0', pg: '0' }, [6], { loads: 1 }),
    ],
  },
  sweep: {
    interleaved: false,
    configs: [
      ...[25, 50, 100, 250, 500].map((wrap) => pageConfig(`2000p-wrap${wrap}-pg1`, { pages: '2000', wrap: String(wrap), pg: '1' }, [1, 6], { loads: 2, positions: ['middle'] })),
      pageConfig('2000p-wrap100-over4-pg1', { pages: '2000', over: '4', pg: '1' }, [1, 6], { loads: 2, positions: ['middle'] }),
    ],
  },
  zoom: { interleaved: false, configs: [pageConfig('120p-zoom150-pg1', { pages: '120', zoom: '150', pg: '1' }, [6])] },
  breaks: { interleaved: false, configs: PAGE_SIZES.map((pages) => pageConfig(`${pages}p-breaks`, { pages: String(pages), pg: '1' }, [1, 6], { measure: 'breaks', positions: [] })) },
  cold: { interleaved: false, configs: PAGE_SIZES.map((pages) => pageConfig(`${pages}p-cold`, { pages: String(pages), pg: '1' }, [1, 6], { measure: 'cold', positions: [] })) },
} as const satisfies Record<string, Suite>
type SuiteName = keyof typeof SUITES
const isSuiteName = (s: string | undefined): s is SuiteName => s !== undefined && Object.hasOwn(SUITES, s)

export const round = (n: number, digits: number): number => +n.toFixed(digits)
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

async function readHeapMB(cdp: CDPSession | null): Promise<number | null> {
  if (!cdp) return null
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('Performance.enable')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const used = metrics.find((m) => m.name === 'JSHeapUsedSize')
  return used ? Math.round(used.value / 1048576) : null
}

/** Places the caret at `where`, types the warm-up, then the sentence `sentences` times; the samples after the warm-up. */
export async function typeAt(page: Page, where: Position, sentences: number): Promise<Sample> {
  await page.evaluate((w) => window.__bench.place(w), where)
  await page.waitForTimeout(400)
  await page.keyboard.type(WARMUP, { delay: 50 })
  await page.evaluate(() => { window.__bench.reset(); window.__pg.reset() })
  for (let i = 0; i < sentences; i++) await page.keyboard.type(SENTENCE, { delay: 70 })
  await page.waitForTimeout(300)
  const { samples, stats } = await page.evaluate(() => ({ samples: window.__bench.results().samples, stats: window.__pg.stats() }))
  return {
    frame: samples.map((s) => round(s.paint, 2)),
    dispatch: samples.map((s) => round(s.pm, 2)),
    engine: stats.engineMs.map((ms) => round(ms, 3)),
    deco: stats.decoMs.map((ms) => round(ms, 3)),
    engineDeco: stats.engineMs.map((ms, i) => round(ms + (stats.decoMs[i] ?? 0), 3)),
  }
}

// Caret in the first block at offset 10, then Enter, one press at a time: every page start after it moves.
async function pressBreaks(page: Page): Promise<{ frame: number[]; movedBreaks: number[] }> {
  await page.evaluate(() => window.__risk.setOff(10, true))
  await page.waitForTimeout(400)
  const frame: number[] = []
  const movedBreaks: number[] = []
  for (let i = 0; i < BREAK_PRESSES; i++) {
    await page.evaluate(() => window.__bench.reset())
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__bench.results().samples.length > 0, null, { timeout: LOAD_TIMEOUT_MS })
    const r = await page.evaluate(() => ({ paint: window.__bench.results().samples[0]!.paint, moved: window.__pg.stats().movedBreaks }))
    frame.push(round(r.paint, 2))
    movedBreaks.push(r.moved)
    await page.waitForTimeout(100)
  }
  return { frame, movedBreaks }
}

/**
 * One fresh load of the editor page with `q`: a new context (its own renderer), throttled before navigation, the font
 * checked and the keystroke probe installed before `fn` runs; the context is closed afterwards.
 */
export async function withLoad<T>(browser: Browser, base: string, q: Record<string, string>, throttle: number, fn: (page: Page) => Promise<T>): Promise<{ info: LoadInfo; result: T }> {
  const loadStart = load1()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
    const page = await ctx.newPage()
    await page.addInitScript(INIT)
    const cdp = browser.browserType().name() === 'chromium' ? await ctx.newCDPSession(page) : null
    if (cdp && throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    await page.goto(`${base}/?${new URLSearchParams(q)}`, { timeout: LOAD_TIMEOUT_MS })
    await page.waitForFunction(() => window.__firstEditable, null, { timeout: LOAD_TIMEOUT_MS })
    await assertFont(page)
    const firstEditableMs = Math.round(await page.evaluate(() => window.__firstEditable!.afterFrame))
    await page.evaluate(INSTRUMENT)
    const heapMB = await readHeapMB(cdp)
    const result = await fn(page)
    return { info: { loadStart: round(loadStart, 2), loadEnd: round(load1(), 2), firstEditableMs, heapMB }, result }
  } finally {
    // WebKit sometimes never resolves context.close(); do not wait for it.
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))])
  }
}

async function measureLoad(browser: Browser, base: string, cfg: Config, throttle: number): Promise<Measured> {
  const { info, result } = await withLoad(browser, base, cfg.q, throttle, async (page) => {
    const typing: Partial<Record<Position, Sample>> = {}
    for (const where of cfg.positions) typing[where] = await typeAt(page, where, cfg.sentences)
    const scroll = cfg.scroll ? (await page.evaluate(() => window.__api.scrollProbe())).map((ms) => round(ms, 2)) : null
    const breaks = cfg.measure === 'breaks' ? await pressBreaks(page) : null
    const cold = cfg.measure === 'cold' ? (await page.evaluate((n) => Array.from({ length: n }, () => window.__pg.cold()), COLD_RUNS)).map((ms) => round(ms, 2)) : null
    return { typing, scroll, breaks, cold }
  })
  return { info, ...result }
}

/** The statistics of one position over its loads, with the raw series kept. */
export function positionStats(samples: Sample[]): PositionStats {
  const frame = samples.map((s) => s.frame)
  const all = frame.flat()
  const dispatch = samples.map((s) => s.dispatch)
  return {
    n: all.length, p50: pct(all, 0.5), p95: pct(all, 0.95), p99: pct(all, 0.99), max: pct(all, 1), runP50s: frame.map((f) => pct(f, 0.5)),
    dispatchP50: pct(dispatch.flat(), 0.5), dispatchP95: pct(dispatch.flat(), 0.95), frame, dispatch,
  }
}

const p95Of = (g: number[][][]): number => pct(g[0]!.flat(), 0.95) ?? Number.NaN

function rowOf(cfg: Config, throttle: number, version: string, baseline: number | null, loads: Measured[]): TypingRow | BreaksRow | ColdRow {
  const head = { name: cfg.name, throttle, version, baseline, loads: loads.map((l) => l.info) }
  if (cfg.measure === 'breaks') return { ...head, frame: loads.map((l) => l.breaks!.frame), movedBreaks: loads.map((l) => l.breaks!.movedBreaks) }
  if (cfg.measure === 'cold') {
    const cold = loads.map((l) => l.cold!)
    return { ...head, cold, p50: pct(cold.flat(), 0.5), p95: pct(cold.flat(), 0.95) }
  }
  const at = (where: Position): PositionStats | null => (cfg.positions.includes(where) ? positionStats(loads.map((l) => l.typing[where]!)) : null)
  const perLoad = (key: 'engine' | 'deco' | 'engineDeco'): number[][] => loads.map((l) => Object.values(l.typing).flatMap((s) => s[key]))
  const engineDeco = perLoad('engineDeco')
  const paginated = engineDeco.flat().length > 0
  const scroll = cfg.scroll ? loads.map((l) => l.scroll!) : null
  return {
    ...head,
    start: at('start'), middle: at('middle'), end: at('end'),
    engine: { p50: pct(perLoad('engine').flat(), 0.5), p95: pct(perLoad('engine').flat(), 0.95) },
    deco: { p50: pct(perLoad('deco').flat(), 0.5), p95: pct(perLoad('deco').flat(), 0.95) },
    engineDeco: { p95: pct(engineDeco.flat(), 0.95), ci: paginated ? bootstrap([engineDeco], p95Of) : null },
    scroll: scroll && { p95: pct(scroll.flat(), 0.95), over50Pct: round((100 * scroll.flat().filter((ms) => ms > 50).length) / scroll.flat().length, 2), frames: scroll },
  }
}

export const keyOf = (name: string, throttle: number): string => `${name}@${throttle}`

/** The keys of the rows already in `file`, so that a rerun skips them. */
export function writtenKeys(file: string): Set<string> {
  if (!existsSync(file)) return new Set()
  return new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    const row: unknown = JSON.parse(line)
    if (!isRecord(row) || typeof row.name !== 'string' || typeof row.throttle !== 'number') throw new TypeError(`${file} holds a line that is not a row of this harness`)
    return keyOf(row.name, row.throttle)
  }))
}

/**
 * Runs one load up to three times; null when every attempt threw, and then its row is not written, so a summary reads
 * it as not run.
 */
export async function retried<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await load()
    } catch (e) {
      process.stderr.write(`${label}: load attempt ${attempt} of ${ATTEMPTS} did not finish: ${String(e).split('\n')[0]}\n`)
    }
  }
  return null
}

/**
 * Runs `suite` in `browserType` and appends one row per configuration and throttle to `<resultsDir>/<file>.jsonl` as
 * its last load finishes, skipping rows already in the file. `loads` overrides every configuration's load count.
 */
export async function runSuite(file: string, suite: Suite, options: { browserType: BrowserType; loads: number | null; baseline: number | null }): Promise<void> {
  const path = join(resultsDir(), `${file}.jsonl`)
  const written = writtenKeys(path)
  const cells = suite.configs.flatMap((cfg) => cfg.throttles.map((throttle) => ({ cfg, throttle, loads: options.loads ?? cfg.loads })))
  const todo = cells.filter((c) => !written.has(keyOf(c.cfg.name, c.throttle)))
  const throttles = [...new Set(todo.map((c) => c.throttle))]
  const groups = suite.interleaved ? throttles.map((t) => todo.filter((c) => c.throttle === t)) : todo.map((c) => [c])
  const { server, base } = await startServer()
  const browser = await options.browserType.launch({ headless: true })
  try {
    for (const group of groups) {
      const measured = group.map(() => [] as Measured[])
      const failed = new Set<number>()
      const rounds = Math.max(...group.map((c) => c.loads))
      for (let i = 0; i < rounds; i++) {
        for (const [k, c] of group.entries()) {
          if (i >= c.loads || failed.has(k)) continue
          const m = await retried(keyOf(c.cfg.name, c.throttle), () => measureLoad(browser, base, c.cfg, c.throttle))
          if (m) measured[k]!.push(m)
          else failed.add(k)
        }
      }
      for (const [k, c] of group.entries()) {
        if (failed.has(k)) continue
        appendFileSync(path, JSON.stringify(rowOf(c.cfg, c.throttle, browser.version(), options.baseline, measured[k]!)) + '\n')
        process.stderr.write(`${keyOf(c.cfg.name, c.throttle)}: written\n`)
      }
    }
  } finally {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))])
    server.stop(true)
  }
}

function readRows(dir: string, file: string): Record<string, unknown>[] {
  const path = join(dir, file)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => {
    const row: unknown = JSON.parse(line)
    if (!isRecord(row) || typeof row.name !== 'string' || typeof row.throttle !== 'number' || !Array.isArray(row.loads)) throw new TypeError(`${file} holds a line that is not a row of this harness`)
    return row
  })
}

const isTypingRow = (row: Record<string, unknown>): row is Record<string, unknown> & TypingRow => isRecord(row.engine) && 'middle' in row
const isBreaksRow = (row: Record<string, unknown>): row is Record<string, unknown> & BreaksRow => Array.isArray(row.movedBreaks)
const isColdRow = (row: Record<string, unknown>): row is Record<string, unknown> & ColdRow => Array.isArray(row.cold)

const typingRows = (dir: string, file: string): TypingRow[] => readRows(dir, file).filter(isTypingRow)

const ms = (n: number | null): string => (n === null ? '—' : `${round(n, 1)}`)
const span = (ci: Interval | null, unit = ''): string => (ci ? `${ms(ci.lo)}${unit} – ${ms(ci.hi)}${unit}` : '—')
const baselineOf = (row: { baseline: number | null }): string => (row.baseline === null ? 'none (CI)' : String(row.baseline))
const median = (a: readonly number[]): number | null => pct(a, 0.5)

interface Judged {
  value: number
  ci: Interval
  against: string
  outcome: 'within' | 'over' | 'inconclusive'
}

function judge(groups: number[][][], stat: (g: number[][][]) => number, limit: number, hardFail: number): Judged {
  const ci = bootstrap(groups, stat, { paired: true })
  const outcome = decide(ci, limit)
  return { value: stat(groups), ci, outcome, against: decide(ci, hardFail) === 'over' ? `${outcome}; hard fail` : outcome }
}

// Outcome of a set of statistics: pass when all are within, fail when any is over, otherwise inconclusive.
const outcomeOf = (judged: readonly Judged[]): 'pass' | 'fail' | 'inconclusive' =>
  judged.some((j) => j.outcome === 'over') ? 'fail' : judged.every((j) => j.outcome === 'within') ? 'pass' : 'inconclusive'

const presentPositions = (row: TypingRow): PositionStats[] => POSITIONS.map((p) => row[p]).filter((s): s is PositionStats => s !== null)
const largest = (values: number[]): number => Math.max(...values)
const quantileAt = (q: number) => (g: number[][][]): number => largest(g.map((runs) => pct(runs.flat(), q) ?? Number.NaN))

interface TypingBudget {
  p50: Judged
  p95: Judged
  p99: Judged
  variation: Judged
  outcome: 'pass' | 'fail' | 'inconclusive'
}

// The typing budget, as the criterion computes it: p50, p95 and p99 at the worst position, and the spread of the
// positions' p50s, each inside every resample, the positions of one load drawn together.
function typingBudget(row: TypingRow): TypingBudget {
  const groups = presentPositions(row).map((s) => s.frame)
  const variation = (g: number[][][]): number => {
    const p50s = g.map((runs) => pct(runs.flat(), 0.5) ?? Number.NaN)
    return (largest(p50s) - Math.min(...p50s)) / Math.min(...p50s)
  }
  const judged = { p50: judge(groups, quantileAt(0.5), 16, 33), p95: judge(groups, quantileAt(0.95), 33, 50), p99: judge(groups, quantileAt(0.99), 50, 100), variation: judge(groups, variation, 0.2, 0.5) }
  return { ...judged, outcome: outcomeOf(Object.values(judged)) }
}

// A Markdown table, or "Not run." when it has no row.
const table = (head: readonly string[], rows: readonly string[]): string[] =>
  rows.length ? [`| ${head.join(' | ')} |`, `|${' --- |'.repeat(head.length)}`, ...rows] : ['Not run.']

const pctText = (n: number): string => `${round(100 * n, 1)} %`

function typingBudgetLines(b: TypingBudget): string[] {
  const line = (label: string, j: Judged, budget: string, unit: (n: number) => string = (n) => `${ms(n)} ms`): string =>
    `| ${label} | ${unit(j.value)} | ${unit(j.ci.lo)} – ${unit(j.ci.hi)} | ${budget} | ${j.against} |`
  return table(['Statistic', 'Value', '95 % interval', 'Budget', 'Against the budget'], [
    line('p50, worst position', b.p50, '≤ 16 ms (hard fail > 33 ms)'),
    line('p95, worst position', b.p95, '≤ 33 ms (hard fail > 50 ms)'),
    line('p99, worst position', b.p99, '≤ 50 ms (hard fail > 100 ms)'),
    line('Variation of p50 across start, middle and end', b.variation, '≤ 20 % (hard fail > 50 %)', pctText),
  ])
}

const INTERVAL_NOTE = 'Each interval is a 95 % percentile bootstrap interval (10,000 resamples, seed 1): loads are drawn first and keystrokes within each drawn load second, and the positions (and configurations) measured in one load are drawn together. A statistic is `within` only when its whole interval is at or under the budget, `over` only when the whole interval is above it, and otherwise `inconclusive`; `hard fail` marks a whole interval above the hard-fail figure.'

function rowTable(rows: readonly TypingRow[]): string[] {
  return table(['Row', 'Throttle', 'Load baseline', 'Loads', 'Position', 'Keystrokes', 'p50', 'p95', 'p99', 'max', 'Per-load p50s', 'Dispatch p50', 'Dispatch p95'],
    rows.flatMap((r) => POSITIONS.filter((p) => r[p]).map((p) => {
      const s = r[p]!
      return `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${r.loads.length} | ${p} | ${s.n} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)} | ${s.runP50s.map(ms).join(', ')} | ${ms(s.dispatchP50)} | ${ms(s.dispatchP95)} |`
    })))
}

function summariseGate(dir: string): string {
  const rows = typingRows(dir, 'gate.jsonl')
  const on = rows.find((r) => r.name === '120p-pg1' && r.throttle === 6)
  const off = rows.find((r) => r.name === '120p-pg0' && r.throttle === 6)
  const out = [
    '# Pagination cost and typing at 120 pages under 6x CPU throttle',
    '',
    'Written by `bun harness/bench.ts --summarise gate` from `gate.jsonl`: 120 pages in 100-block sections with `content-visibility: auto`, pagination on (`pg=1`) and off (`pg=0`), the two loaded in turn, load by load. In each load, at the start, the middle and the end of the document: the warm-up once, then the 44-keystroke sentence five times with no pause. Times are in ms.',
    '',
    INTERVAL_NOTE,
    '',
  ]
  if (!on || !off) return [...out, 'Criterion 1 (pagination adds no more than 4 ms p95 of main-thread time per keystroke): **not run**.', '', 'Criterion 2 (typing is inside the typing budget): **not run**.', ''].join('\n')
  const dispatchGroups = [...presentPositions(on), ...presentPositions(off)].map((s) => s.dispatch)
  const frameGroups = [...presentPositions(on), ...presentPositions(off)].map((s) => s.frame)
  const positions = presentPositions(on).length
  const added = (g: number[][][]): number => largest(Array.from({ length: positions }, (_, p) => (pct(g[p]!.flat(), 0.95) ?? Number.NaN) - (pct(g[p + positions]!.flat(), 0.95) ?? Number.NaN)))
  const cost = judge(dispatchGroups, added, 4, 8)
  const frameDiff = bootstrap(frameGroups, added, { paired: true })
  const absolute = bootstrap(dispatchGroups.slice(0, positions), quantileAt(0.95), { paired: true })
  const typing = typingBudget(on)
  return [
    ...out,
    ...rowTable([on, off]),
    '',
    '## Criterion 1: pagination adds no more than 4 ms (p95) of main-thread time per keystroke',
    '',
    'Inside each resample, at each position, the p95 of the time inside `view.dispatch` with pagination minus the same without; the largest of the three positions.',
    '',
    ...table(['Statistic', 'Value', '95 % interval', 'Budget', 'Against the budget'], [
      `| Added dispatch p95, worst position | ${ms(cost.value)} ms | ${span(cost.ci, ' ms')} | ≤ 4 ms (hard fail > 8 ms) | ${cost.against} |`,
    ]),
    '',
    'Reported beside it, not deciding:',
    '',
    ...table(['Statistic', 'Value', '95 % interval'], [
      `| Engine plus decoration time per keystroke, p95 | ${ms(on.engineDeco.p95)} ms | ${span(on.engineDeco.ci, ' ms')} |`,
      `| Dispatch p95 with pagination, worst position | ${ms(quantileAt(0.95)(dispatchGroups.slice(0, positions)))} ms | ${span(absolute, ' ms')} |`,
      `| Added keystroke-to-frame p95, worst position | ${ms(added(frameGroups))} ms | ${span(frameDiff, ' ms')} |`,
    ]),
    '',
    `Criterion 1: **${outcomeOf([cost])}**.`,
    '',
    '## Criterion 2: typing is inside the typing budget',
    '',
    'Keystroke to next frame, the `120p-pg1` row.',
    '',
    ...typingBudgetLines(typing),
    '',
    `Criterion 2: **${typing.outcome}**.`,
    '',
  ].join('\n')
}

// The smallest, the median and the largest of a list, for one cell of a table.
const spread = (a: readonly number[], f: (n: number | null) => string = ms): string => (a.length ? `${f(Math.min(...a))} / ${f(median(a))} / ${f(largest([...a]))}` : '—')
const seconds = (n: number | null): string => (n === null ? '—' : `${round(n / 1000, 2)}`)

const BUDGETS_BY_PAGES = {
  cold: { 120: '≤ 10 ms (hard fail > 30 ms)', 1000: 'no threshold', 2000: '≤ 150 ms (hard fail > 400 ms)' },
  firstEditable: { 120: '≤ 1.0 s (hard fail > 2.0 s)', 1000: 'no threshold', 2000: '≤ 6.0 s (hard fail > 12 s)' },
  heap: { 120: '≤ 150 MB (hard fail > 400 MB)', 1000: 'no threshold', 2000: '≤ 600 MB (hard fail > 1.5 GB)' },
} as const

const pagesOf = (name: string): 120 | 1000 | 2000 => {
  const pages = Number.parseInt(name, 10)
  if (pages !== 120 && pages !== 1000 && pages !== 2000) throw new RangeError(`a row name must start with 120, 1000 or 2000 pages, not ${name}`)
  return pages
}

// The comfort limit: the largest size whose 6x row is within the typing budget on all four statistics; 120 when none
// is, or when no row ran.
function comfortLimit(rows: readonly (TypingRow | undefined)[], budgets: ReadonlyMap<TypingRow, TypingBudget>): string {
  const ran = rows.filter((r): r is TypingRow => r !== undefined)
  if (!ran.length) return '120 (the rows were not run)'
  const within = ran.filter((r) => budgets.get(r)?.outcome === 'pass').map((r) => pagesOf(r.name))
  const missing = rows.length > ran.length ? 'a row was not run' : null
  if (!within.length) return `120 (not even 120 pages is within${missing ? `; ${missing}` : ''})`
  return missing ? `${largest(within)} (${missing})` : String(largest(within))
}

const at6 = (rows: readonly TypingRow[], name: string): TypingRow | undefined => rows.find((r) => r.name === name && r.throttle === 6)

function typingSection(rows: readonly TypingRow[]): string[] {
  return [
    '## Typing rows',
    '',
    'Keystroke to next frame at each position, 44 keystrokes per load and position after the warm-up. Sources: `matrix.jsonl`, `fallback.jsonl`, `sweep.jsonl`, `zoom.jsonl`.',
    '',
    ...rowTable(rows),
    '',
  ]
}

const cellOf = (j: Judged, f: (n: number) => string): string => `${f(j.value)} (${f(j.ci.lo)} – ${f(j.ci.hi)}) ${j.against}`

function budgetSection(paginated: readonly TypingRow[], fallback: readonly TypingRow[]): string[] {
  const budgetRows = [...paginated, ...fallback.filter((r) => r.name.includes('-nocv-'))]
  const budgets = new Map(budgetRows.map((r) => [r, typingBudget(r)]))
  return [
    '## Typing budget by size',
    '',
    `Each paginated row against the typing budget (p50 / p95 / p99 ≤ 16 / 33 / 50 ms at the worst position; variation across positions ≤ 20 %), computed as the gate computes it. ${INTERVAL_NOTE}`,
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'p50 (interval)', 'p95 (interval)', 'p99 (interval)', 'Variation (interval)', 'Outcome'],
      budgetRows.map((r) => {
        const b = budgets.get(r)!
        return `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${cellOf(b.p50, ms)} | ${cellOf(b.p95, ms)} | ${cellOf(b.p99, ms)} | ${cellOf(b.variation, pctText)} | ${b.outcome} |`
      })),
    '',
    `Comfort limit from the 6x rows with containment (\`matrix\`): **${comfortLimit(PAGE_SIZES.map((p) => at6(paginated, `${p}p-pg1`)), budgets)}** pages.`,
    `Comfort limit without containment (\`fallback\` \`nocv\` rows at 1,000 and 2,000 pages, \`matrix\` at 120): **${comfortLimit([at6(paginated, '120p-pg1'), at6(fallback, '1000p-nocv-pg1'), at6(fallback, '2000p-nocv-pg1')], budgets)}** pages.`,
    '',
  ]
}

function engineSection(paginated: readonly TypingRow[]): string[] {
  return [
    '## Engine work per keystroke',
    '',
    'From `matrix.jsonl`, the paginated rows; all positions and loads together. Budget for the engine: ≤ 0.5 ms (hard fail > 2 ms).',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'Engine p50', 'Engine p95', 'Decorations p50', 'Decorations p95', 'Engine plus decorations p95 (interval)'],
      paginated.map((r) => `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${ms(r.engine.p50)} | ${ms(r.engine.p95)} | ${ms(r.deco.p50)} | ${ms(r.deco.p95)} | ${ms(r.engineDeco.p95)} (${span(r.engineDeco.ci)}) |`)),
    '',
  ]
}

function coldSection(cold: readonly ColdRow[]): string[] {
  return [
    '## Full cold repagination',
    '',
    'From `cold.jsonl`: `__pg.cold()` 20 times per load, a fresh copy of the blocks each time.',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'Loads', 'p50', 'p95', 'Budget'],
      cold.map((r) => `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${r.loads.length} | ${ms(r.p50)} | ${ms(r.p95)} | ${BUDGETS_BY_PAGES.cold[pagesOf(r.name)]} |`)),
    '',
  ]
}

function breaksSection(breaks: readonly BreaksRow[]): string[] {
  return [
    '## The frame in which many breaks move',
    '',
    'From `breaks.jsonl`: the caret in the first block at offset 10, Enter 20 times; the largest keystroke-to-frame value of all presses, and the page starts that moved in that press. Budget: ≤ 50 ms (hard fail > 100 ms).',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'Loads', 'Largest keystroke to frame', 'Page starts moved in that press', 'p50 of all presses'],
      breaks.map((r) => {
        const frames = r.frame.flat()
        const worst = frames.indexOf(largest(frames))
        return `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${r.loads.length} | ${ms(frames[worst] ?? null)} | ${r.movedBreaks.flat()[worst] ?? '—'} | ${ms(median(frames))} |`
      })),
    '',
  ]
}

function loadSection(paginated: readonly TypingRow[]): string[] {
  return [
    '## First editable frame and heap',
    '',
    'From `matrix.jsonl`, the paginated rows: per load, smallest / median / largest.',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'First editable, s', 'Budget', 'Heap, MB', 'Budget'],
      paginated.map((r) => {
        const pages = pagesOf(r.name)
        const heap = r.loads.map((l) => l.heapMB).filter((h): h is number => h !== null)
        return `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${spread(r.loads.map((l) => l.firstEditableMs), seconds)} | ${BUDGETS_BY_PAGES.firstEditable[pages]} | ${spread(heap)} | ${BUDGETS_BY_PAGES.heap[pages]} |`
      })),
    '',
  ]
}

function scrollSection(paginated: readonly TypingRow[]): string[] {
  return [
    '## Scrolling',
    '',
    'From `matrix.jsonl`, the paginated rows: a jump-scroll through the whole document in 60 steps per load. Budget: frame p95 ≤ 16.7 ms and frames over 50 ms ≤ 1 % (hard fail > 33 ms and > 5 %).',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'Frames', 'Frame p95', 'Frames over 50 ms'],
      paginated.filter((r) => r.scroll).map((r) => `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${r.scroll!.frames.flat().length} | ${ms(r.scroll!.p95)} | ${r.scroll!.over50Pct} % |`)),
    '',
  ]
}

function sweepSection(sweep: readonly TypingRow[]): string[] {
  const lowest = sweep.filter((r) => r.throttle === 6 && !r.name.includes('over')).toSorted((a, b) => (a.middle?.p95 ?? Infinity) - (b.middle?.p95 ?? Infinity))[0]
  return [
    '## Section size',
    '',
    'From `sweep.jsonl`: 2,000 pages, the middle of the document, 2 loads (below the sample size that decides). No threshold.',
    '',
    ...table(['Row', 'Throttle', 'Load baseline', 'p50', 'p95', 'Dispatch p95', 'Engine plus decorations p95'],
      sweep.map((r) => `| ${r.name} | ${r.throttle}x | ${baselineOf(r)} | ${ms(r.middle?.p50 ?? null)} | ${ms(r.middle?.p95 ?? null)} | ${ms(r.middle?.dispatchP95 ?? null)} | ${ms(r.engineDeco.p95)} |`)),
    '',
    ...(lowest ? [`Lowest 6x p95: \`${lowest.name}\`.`] : []),
    ...[1, 6].flatMap((t) => {
      const over = sweep.find((r) => r.name === '2000p-wrap100-over4-pg1' && r.throttle === t)?.middle?.p95
      const base = sweep.find((r) => r.name === '2000p-wrap100-pg1' && r.throttle === t)?.middle?.p95
      return over != null && base != null ? [`A section four times its target, ${t}x: p95 ${ms(over)} against ${ms(base)} (${ms(over - base)} more).`] : []
    }),
    '',
  ]
}

function xbrowserSection(xbrowser: readonly { engine: string; rows: readonly TypingRow[] }[]): string[] {
  return [
    '## WebKit and Firefox',
    '',
    'From `xbrowser-webkit.jsonl` and `xbrowser-firefox.jsonl`: 2,000 pages, the middle of the document, no CPU throttle (these engines have none). Engines that tick animation frames on a fixed clock add the wait for the next tick to keystroke to frame, so the dispatch share is shown beside it.',
    '',
    ...table(['Engine', 'Version', 'Row', 'Load baseline', 'Loads', 'p50', 'p95', 'p99', 'Dispatch p95', 'First editable, s'],
      xbrowser.flatMap(({ engine, rows }) => (rows.length ? rows : [null]).map((r) => (r
        ? `| ${engine} | ${r.version} | ${r.name} | ${baselineOf(r)} | ${r.loads.length} | ${ms(r.middle?.p50 ?? null)} | ${ms(r.middle?.p95 ?? null)} | ${ms(r.middle?.p99 ?? null)} | ${ms(r.middle?.dispatchP95 ?? null)} | ${spread(r.loads.map((l) => l.firstEditableMs), seconds)} |`
        : `| ${engine} | — | not run | — | — | — | — | — | — | — |`)))),
    '',
  ]
}

function summariseTiming(dir: string): string {
  const matrix = typingRows(dir, 'matrix.jsonl')
  const fallback = typingRows(dir, 'fallback.jsonl')
  const sweep = typingRows(dir, 'sweep.jsonl')
  const zoom = typingRows(dir, 'zoom.jsonl')
  const paginated = matrix.filter((r) => r.name.endsWith('-pg1'))
  return [
    '# Timing figures beside the budgets',
    '',
    'Written by `bun harness/bench.ts --summarise timing`. Chromium on this machine under its CPU throttle unless a table says otherwise; 100-block sections with `content-visibility: auto` and pagination on unless the row says otherwise (`nocv`: the same sections without containment; `flat`: no sections, no pagination). Each figure stands beside the project\'s budget where one exists; none of them is a pass criterion. Times are in ms unless stated.',
    '',
    ...typingSection([...matrix, ...fallback, ...sweep, ...zoom]),
    ...budgetSection(paginated, fallback),
    ...engineSection(paginated),
    ...coldSection(readRows(dir, 'cold.jsonl').filter(isColdRow)),
    ...breaksSection(readRows(dir, 'breaks.jsonl').filter(isBreaksRow)),
    ...loadSection(paginated),
    ...scrollSection(paginated),
    ...sweepSection(sweep),
    ...xbrowserSection(['webkit', 'firefox'].map((engine) => ({ engine, rows: typingRows(dir, `xbrowser-${engine}.jsonl`) }))),
  ].join('\n')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dirAt = args.indexOf('--dir')
  const dir = dirAt >= 0 ? args[dirAt + 1]! : resultsDir()
  if (args[0] === '--summarise' && args[1] === 'gate') writeFileSync(join(dir, 'gate-summary.md'), summariseGate(dir))
  else if (args[0] === '--summarise' && args[1] === 'timing') writeFileSync(join(dir, 'timing-summary.md'), summariseTiming(dir))
  else if (isSuiteName(args[0])) {
    const { baseline } = requireTimed()
    const loads = args[1] === undefined ? null : Number.parseInt(args[1], 10)
    if (loads !== null && !(loads > 0)) {
      console.error(`Usage: the number of loads must be a positive integer, not ${args[1]}`)
      process.exit(2)
    }
    await runSuite(args[0], SUITES[args[0]], { browserType: chromium, loads, baseline })
  } else {
    console.error(`Usage: bun harness/bench.ts <${Object.keys(SUITES).join('|')}> [loads] | --summarise <gate|timing> [--dir <dir>]`)
    process.exit(2)
  }
}
