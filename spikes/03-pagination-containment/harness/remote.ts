// bun harness/remote.ts [loads]
// bun harness/remote.ts --summarise [--dir <dir>]
// The editor bound to a Y.Doc through y-prosemirror 1.3.7, with a second peer in the same page, under Chromium's CPU
// throttle: local typing alone and while the peer types near the top, the peer typing at three places, and a burst.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { isRecord, retried, round, typeAt, withLoad } from './bench.ts'
import type { LoadInfo } from './bench.ts'
import { pct, resultsDir, startServer } from './lib.ts'
import { bootstrap, decide, requireTimed } from './timing.ts'
import type { Interval } from './timing.ts'

const SIZES = [120, 1000, 2000] as const
const THROTTLES = [1, 4, 6] as const
// A workload setting, not a threshold: one single-character remote update every 100 ms near the top.
const PEER_EVERY_MS = 100
const PEER_AT = 0.02
const PLACES = ['remoteStart', 'remoteMiddle', 'remoteEnd'] as const
type RemotePlace = (typeof PLACES)[number]
// Where the peer types, as a fraction of all blocks.
const REMOTE_AT: Record<RemotePlace, number> = { remoteStart: 0.02, remoteMiddle: 0.5, remoteEnd: 0.98 }
const REMOTE_KEYS = 25
const DROPPED = 5
const BURST = 20
const BUDGET_MS = 8
const HARD_FAIL_MS = 16

interface Leg {
  p50: number | null
  p95: number | null
  p99: number | null
  runP50s: (number | null)[]
  /** Keystroke to next frame in ms, one array per load. */
  frame: number[][]
}

interface RemoteTiming {
  syncP50: number | null
  syncP95: number | null
  frameP50: number | null
  frameP95: number | null
}

interface Burst {
  separateSyncMs: number
  mergedSyncMs: number
  separateFrameMs: number
  mergedFrameMs: number
}

interface RemoteRow extends Record<RemotePlace, RemoteTiming> {
  pages: number
  throttle: number
  version: string
  baseline: number | null
  loads: LoadInfo[]
  solo: Leg
  withPeer: Leg
  extraP95: number | null
  extraP95CI: Interval
  /** Medians over the loads. */
  burst20: Burst
  /** The most sections whose node changed in one remote transaction. */
  changedSections: number
  /** Section view updates per remote update, over every remote typing update of every load. */
  viewUpdatesPerRemote: number
}

interface LoadResult {
  solo: number[]
  withPeer: number[]
  remote: Record<RemotePlace, { sync: number; frame: number }[]>
  burst: Burst
  changedSections: number
  viewUpdates: number
}

// Solo typing in the middle; the same with the peer typing near the top; the peer typing at three places, its first
// five updates dropped; then the burst.
async function measure(page: Page, sentences: number): Promise<LoadResult> {
  const solo = (await typeAt(page, 'middle', sentences)).frame
  await page.evaluate(([every, at]) => window.__remote.startPeer(every, at), [PEER_EVERY_MS, PEER_AT] as const)
  const withPeer = (await typeAt(page, 'middle', sentences)).frame
  await page.evaluate(() => window.__remote.stopPeer())
  const viewsBefore = await page.evaluate(() => window.__sec.viewUpdates())
  const remote: LoadResult['remote'] = { remoteStart: [], remoteMiddle: [], remoteEnd: [] }
  let changedSections = 0
  for (const place of PLACES) {
    remote[place] = (await page.evaluate(([n, at]) => window.__remote.remoteTyping(n, at), [REMOTE_KEYS, REMOTE_AT[place]] as const)).slice(DROPPED)
    changedSections = Math.max(changedSections, await page.evaluate(() => window.__remote.changedSections()))
  }
  const viewUpdates = (await page.evaluate(() => window.__sec.viewUpdates())) - viewsBefore
  const b = await page.evaluate((k) => window.__remote.remoteBurst(k), BURST)
  const burst = { separateSyncMs: b.separateSyncMs, mergedSyncMs: b.mergedSyncMs, separateFrameMs: b.separateFrameMs, mergedFrameMs: b.mergedFrameMs }
  return { solo, withPeer, remote, burst, changedSections, viewUpdates }
}

const legOf = (frame: number[][]): Leg => ({ p50: pct(frame.flat(), 0.5), p95: pct(frame.flat(), 0.95), p99: pct(frame.flat(), 0.99), runP50s: frame.map((f) => pct(f, 0.5)), frame })
const p95 = (runs: number[][]): number => pct(runs.flat(), 0.95) ?? Number.NaN
const extraOf = (g: number[][][]): number => p95(g[1]!) - p95(g[0]!)

function rowOf(pages: number, throttle: number, version: string, baseline: number | null, loads: { info: LoadInfo; result: LoadResult }[]): RemoteRow {
  const results = loads.map((l) => l.result)
  const solo = legOf(results.map((r) => r.solo))
  const withPeer = legOf(results.map((r) => r.withPeer))
  const timing = (place: RemotePlace): RemoteTiming => {
    const all = results.flatMap((r) => r.remote[place])
    return { syncP50: pct(all.map((x) => x.sync), 0.5), syncP95: pct(all.map((x) => x.sync), 0.95), frameP50: pct(all.map((x) => x.frame), 0.5), frameP95: pct(all.map((x) => x.frame), 0.95) }
  }
  const medianOf = (key: keyof Burst): number => round(pct(results.map((r) => r.burst[key]), 0.5) ?? Number.NaN, 1)
  return {
    pages, throttle, version, baseline, loads: loads.map((l) => l.info),
    solo, withPeer,
    extraP95: solo.p95 === null || withPeer.p95 === null ? null : round(withPeer.p95 - solo.p95, 1),
    extraP95CI: bootstrap([solo.frame, withPeer.frame], extraOf, { paired: true }),
    remoteStart: timing('remoteStart'), remoteMiddle: timing('remoteMiddle'), remoteEnd: timing('remoteEnd'),
    burst20: { separateSyncMs: medianOf('separateSyncMs'), mergedSyncMs: medianOf('mergedSyncMs'), separateFrameMs: medianOf('separateFrameMs'), mergedFrameMs: medianOf('mergedFrameMs') },
    changedSections: Math.max(...results.map((r) => r.changedSections)),
    viewUpdatesPerRemote: round(results.reduce((n, r) => n + r.viewUpdates, 0) / (results.length * PLACES.length * REMOTE_KEYS), 2),
  }
}

const keyOf = (pages: number, throttle: number): string => `${pages}@${throttle}`

// The fields the summary reads first; the rest of a row is this harness's own output.
const isRemoteRow = (row: unknown): row is RemoteRow =>
  isRecord(row) && typeof row.pages === 'number' && typeof row.throttle === 'number' && isRecord(row.solo) && isRecord(row.withPeer) && isRecord(row.extraP95CI) && isRecord(row.burst20)

function readRows(file: string): RemoteRow[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    const row: unknown = JSON.parse(line)
    if (!isRemoteRow(row)) throw new TypeError(`${file} holds a line that is not a row of this harness`)
    return row
  })
}

async function run(loadsOverride: number | null, baseline: number | null): Promise<void> {
  const file = join(resultsDir(), 'remote.jsonl')
  const written = new Set(readRows(file).map((r) => keyOf(r.pages, r.throttle)))
  const { server, base } = await startServer()
  const browser = await chromium.launch({ headless: true })
  try {
    for (const pages of SIZES) {
      for (const throttle of THROTTLES) {
        if (written.has(keyOf(pages, throttle))) continue
        // The cell nearest the typing criterion gets the criterion's sample size.
        const decisive = pages === 120 && throttle === 6
        const count = loadsOverride ?? (decisive ? 5 : 3)
        const q = { pages: String(pages), wrap: '100', cv: 'auto', pg: '1', y: '1' }
        const loads: { info: LoadInfo; result: LoadResult }[] = []
        for (let i = 0; i < count; i++) {
          const load = await retried(keyOf(pages, throttle), () => withLoad(browser, base, q, throttle, (page) => measure(page, decisive ? 5 : 1)))
          if (!load) break
          loads.push(load)
        }
        if (loads.length < count) continue
        appendFileSync(file, JSON.stringify(rowOf(pages, throttle, browser.version(), baseline, loads)) + '\n')
        process.stderr.write(`${keyOf(pages, throttle)}: written\n`)
      }
    }
  } finally {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))])
    server.stop(true)
  }
}

const ms = (n: number | null): string => (n === null ? '—' : `${round(n, 1)}`)
const baselineOf = (row: RemoteRow): string => (row.baseline === null ? 'none (CI)' : String(row.baseline))

function summarise(dir: string): string {
  const rows = readRows(join(dir, 'remote.jsonl'))
  const against = (ci: Interval): string => {
    const outcome = decide(ci, BUDGET_MS)
    return decide(ci, HARD_FAIL_MS) === 'over' ? `${outcome}; hard fail` : outcome
  }
  const wholly = rows.filter((r) => decide(r.extraP95CI, BUDGET_MS) === 'over').map((r) => `${r.pages} pages at ${r.throttle}x`)
  const missing = SIZES.flatMap((p) => THROTTLES.map((t) => keyOf(p, t))).filter((k) => !rows.some((r) => keyOf(r.pages, r.throttle) === k))
  const table = (head: readonly string[], lines: readonly string[]): string[] =>
    lines.length ? [`| ${head.join(' | ')} |`, `|${' --- |'.repeat(head.length)}`, ...lines] : ['Not run.']
  return [
    '# Typing with a remote editor through y-prosemirror 1.3.7',
    '',
    'Written by `bun harness/remote.ts --summarise` from `remote.jsonl`. 100-block sections with `content-visibility: auto` and pagination, bound to a Y.Doc, a second peer in the same page whose edits arrive as remote updates; Chromium on this machine under its CPU throttle. Per fresh load, in the middle of the document: local typing alone (solo), then the same typing while the peer inserts one character every 100 ms near the top (with peer). 3 loads × 44 keystrokes per leg; 5 loads × 220 keystrokes at 120 pages and 6x. Times are in ms.',
    '',
    `Rows not run: ${missing.length ? missing.map((k) => `\`${k.replace('@', ' pages at ')}x\``).join(', ') : 'none'}.`,
    '',
    '## Extra keystroke-to-frame p95 with a remote editor',
    '',
    'With-peer p95 minus solo p95, and its 95 % percentile bootstrap interval (10,000 resamples, seed 1; the same loads drawn for both legs, then keystrokes within each). The project\'s budget for typing with remote editors: extra p95 over solo ≤ 8 ms (hard fail > 16 ms). Not a pass criterion here: an interval wholly over the budget is the signal that the binding needs replacing.',
    '',
    ...table(['Pages', 'Throttle', 'Load baseline', 'Loads', 'Solo p50 / p95 / p99', 'With peer p50 / p95 / p99', 'Extra p95', '95 % interval', 'Against the budget'],
      rows.map((r) => `| ${r.pages} | ${r.throttle}x | ${baselineOf(r)} | ${r.loads.length} | ${ms(r.solo.p50)} / ${ms(r.solo.p95)} / ${ms(r.solo.p99)} | ${ms(r.withPeer.p50)} / ${ms(r.withPeer.p95)} / ${ms(r.withPeer.p99)} | ${ms(r.extraP95)} | ${ms(r.extraP95CI.lo)} – ${ms(r.extraP95CI.hi)} | ${against(r.extraP95CI)} |`)),
    '',
    wholly.length
      ? `The interval is wholly over the budget at ${wholly.join(', ')}: the signal that the binding needs replacing.`
      : 'No interval is wholly over the budget: nothing here signals that the binding needs replacing.',
    '',
    '## Remote update cost against document size',
    '',
    'The peer types 25 characters, one per frame, at 2 %, 50 % and 98 % of the blocks; the first five of each are dropped. Sync: applying the update through the binding and the pagination plugin, to the end of the transaction. Frame: to the next frame after it. For comparison, an earlier flat document (no sections) bound the same way cost about 9 ms per remote update at 1,000 pages, 1x, growing with the whole document.',
    '',
    ...table(['Pages', 'Throttle', 'Load baseline', 'Sync p50 / p95 at the start', 'in the middle', 'at the end', 'Frame p95 at the start', 'in the middle', 'at the end'],
      rows.map((r) => `| ${r.pages} | ${r.throttle}x | ${baselineOf(r)} | ${ms(r.remoteStart.syncP50)} / ${ms(r.remoteStart.syncP95)} | ${ms(r.remoteMiddle.syncP50)} / ${ms(r.remoteMiddle.syncP95)} | ${ms(r.remoteEnd.syncP50)} / ${ms(r.remoteEnd.syncP95)} | ${ms(r.remoteStart.frameP95)} | ${ms(r.remoteMiddle.frameP95)} | ${ms(r.remoteEnd.frameP95)} |`)),
    '',
    '## A burst of 20 remote edits, and how much of the view each update touches',
    '',
    'The burst: 20 peer inserts in 20 blocks spread over the document, applied back to back (separate), then 20 more merged into one update (merged); medians over the loads. Changed sections: the most sections whose node changed in one remote transaction. View updates per remote: section views updated per remote typing update. Both are expected to be 1.',
    '',
    ...table(['Pages', 'Throttle', 'Load baseline', 'Separate: sync / frame', 'Merged: sync / frame', 'Changed sections', 'View updates per remote'],
      rows.map((r) => `| ${r.pages} | ${r.throttle}x | ${baselineOf(r)} | ${ms(r.burst20.separateSyncMs)} / ${ms(r.burst20.separateFrameMs)} | ${ms(r.burst20.mergedSyncMs)} / ${ms(r.burst20.mergedFrameMs)} | ${r.changedSections} | ${r.viewUpdatesPerRemote} |`)),
    '',
  ].join('\n')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args[0] === '--summarise') {
    const dirAt = args.indexOf('--dir')
    const dir = dirAt >= 0 ? args[dirAt + 1]! : resultsDir()
    writeFileSync(join(dir, 'remote-summary.md'), summarise(dir))
  } else {
    const loads = args[0] === undefined ? null : Number.parseInt(args[0], 10)
    if (loads !== null && !(loads > 0)) {
      console.error('Usage: bun harness/remote.ts [loads] | --summarise [--dir <dir>]')
      process.exit(2)
    }
    const { baseline } = requireTimed()
    await run(loads, baseline)
  }
}
