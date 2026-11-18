// Cold start, idle memory, installer size, typing latency and the editing checks of both installed shells.
// Usage: bun scripts/measure.ts --electrobun <exe> --electrobun-debug <exe> --electron <exe>
//   --installers <electrobun file>,<electron file> --pairs <n> --out <file>
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { cefProfileDir } from '../shared/paths.ts'
import type { Shell } from '../shared/paths.ts'
import { bootstrap, load1, requireTimed } from './timing.ts'
import type { Interval } from './timing.ts'

const SPIKE = join(import.meta.dir, '..')
const SHELLS: readonly Shell[] = ['electrobun', 'electron']
const CHECKS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const
const DEBUG_PORT: Record<Shell, number> = { electrobun: 9334, electron: 9333 }
const IDLE_PAIRS = 5
const IDLE_WAIT_MS = 30_000
const TYPING_LAUNCHES = 5
const START_LIMIT_MS = 60_000
const PORT_LIMIT_MS = 30_000
const QUIT_LIMIT_MS = 10_000
const POLL_MS = 100
const WARMUP = 'warmup '
const SENTENCE = 'the quick brown fox jumps over the lazy dog '

// Keystroke (capture-phase keydown) to the dispatch that changes the document, to a message-channel task after the
// next animation frame. Injected from outside, so that it is the same in both shells.
const INSTRUMENT = `(() => {
  const view = window.__view
  if (!view) throw new Error('no view')
  const samples = []; let lastKey = 0
  document.addEventListener('keydown', () => { lastKey = performance.now() }, true)
  const orig = view.dispatch
  view.dispatch = tr => {
    orig(tr)
    if (tr.docChanged && lastKey) { const k = lastKey; lastKey = 0; requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => samples.push(performance.now() - k); ch.port2.postMessage(0) }) }
  }
  window.__bench = {
    place (where) {
      const st = view.state; const size = st.doc.content.size
      const pos = where === 'start' ? 3 : where === 'middle' ? Math.floor(size / 2) : size - 2
      const sel = st.selection.constructor.near(st.doc.resolve(pos))
      view.dispatch(st.tr.setSelection(sel).scrollIntoView()); view.focus()
    },
    reset () { samples.length = 0 },
    results () { return samples.slice() }
  }
})()`

// What the editing checks read back from the page.
const STATE = `(() => {
  const v = window.__view; const s = v.state.selection
  return { text: s.$from.parent.textContent, blocks: v.state.doc.childCount, head: s.head, selected: s.to - s.from, length: v.state.doc.textContent.length, composing: v.composing }
})()`

type Check = typeof CHECKS[number]
type Input = 'cdp' | 'execCommand'

interface Launch {
  coldStartMs: number
  idleRssBytes?: number
}

interface Pair {
  electrobun: Launch
  electron: Launch
  loadStart: number
  loadEnd: number
  baseline: number | null
}

interface TypingRun {
  shell: Shell
  samples: number[]
  baseline: number | null
}

interface Typing {
  n: number
  p50: number
  p95: number
  p99: number
  runP50s: number[]
  ci: { p50: Interval; p95: Interval; p99: Interval }
}

/** The window the checks ran in; null, with every check `not run`, for a shell that could not be driven. */
interface Editing {
  innerWidth: number | null
  innerHeight: number | null
  devicePixelRatio: number | null
  checks: Record<Check, unknown>
}

interface Measure {
  platform: NodeJS.Platform
  baseline: number | null
  input: Input | null
  installerBytes: Record<Shell, number>
  pairs: Pair[]
  typingRuns: TypingRun[]
  typing: Partial<Record<Shell, Typing>>
  editing: Partial<Record<Shell, Editing>>
}

interface Args {
  apps: { electrobun: string; electrobunDebug: string; electron: string }
  installers: Record<Shell, string>
  pairs: number
  out: string
}

class MeasureFailure extends Error {}

function readArgs (argv: string[]): Args {
  const value = (flag: string): string => {
    const at = argv.indexOf(flag)
    const found = at === -1 ? undefined : argv[at + 1]
    if (!found) throw new MeasureFailure(`${flag} is required`)
    return found
  }
  const installers = value('--installers').split(',')
  if (installers.length !== 2) throw new MeasureFailure('--installers takes two files: <electrobun>,<electron>')
  const pairs = Number(value('--pairs'))
  if (!Number.isInteger(pairs) || pairs < 1) throw new MeasureFailure(`--pairs must be a positive integer, not ${value('--pairs')}`)
  return {
    apps: { electrobun: allowedApp(value('--electrobun')), electrobunDebug: allowedApp(value('--electrobun-debug')), electron: allowedApp(value('--electron')) },
    installers: { electrobun: resolve(installers[0]!), electron: resolve(installers[1]!) },
    pairs,
    out: resolve(value('--out'))
  }
}

/** The folders an installed app may run from: `artifacts/installed/`, and on CI the roots the installers reported. */
function allowedRoots (): string[] {
  const roots = [join(SPIKE, 'artifacts', 'installed')]
  const record = join(SPIKE, 'results', `install-${process.platform}.json`)
  if (!process.env.CI || !existsSync(record)) return roots
  const value: unknown = JSON.parse(readFileSync(record, 'utf8'))
  if (typeof value !== 'object' || value === null) return roots
  for (const key of ['installRoot', 'debugInstallRoot', 'electronInstallRoot']) {
    const root: unknown = Reflect.get(value, key)
    if (typeof root === 'string' && root !== '') roots.push(root)
  }
  return roots
}

function allowedApp (app: string): string {
  if (!existsSync(app)) throw new MeasureFailure(`app not found: ${app}`)
  const real = realpathSync(app)
  const inside = allowedRoots().some(root => existsSync(root) && real.startsWith(realpathSync(root) + sep))
  if (!inside) throw new MeasureFailure(`${app} is not an installed copy; only apps under artifacts/installed/ (or an installer's own folder on CI) are measured`)
  return real
}

/** The folder whose processes belong to an install: the enclosing `.app` on macOS, else the executable's folder. */
export function installRoot (app: string): string {
  const bundle = app.lastIndexOf('.app' + sep)
  return bundle === -1 ? dirname(app) : app.slice(0, bundle + 4)
}

interface Running {
  pid: number
  rssBytes: number
}

function linuxProcess (pid: number, prefix: string): Running[] {
  try {
    if (!readlinkSync(`/proc/${pid}/exe`).startsWith(prefix)) return []
    const kb = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
    return [{ pid, rssBytes: Number(kb ?? 0) * 1024 }]
  } catch {
    return [] // the process ended, or is not ours to read
  }
}

/** Every running process whose executable file is inside `root`, with its resident memory. */
function processesUnder (root: string): Running[] {
  const prefix = root + sep
  if (process.platform === 'linux') {
    return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => linuxProcess(Number(name), prefix))
  }
  const windows = process.platform === 'win32'
  const listing = windows
    ? ['powershell', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.WorkingSetSize) $($_.ExecutablePath)" }']
    : ['ps', '-axo', 'pid=,rss=,comm=']
  return Bun.spawnSync(listing).stdout.toString().split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
    if (!match || !(match[3] ?? '').startsWith(prefix)) return []
    return [{ pid: Number(match[1]), rssBytes: Number(match[2]) * (windows ? 1 : 1024) }]
  })
}

function signal (pids: number[], name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name)
    } catch {
      // it exited between the listing and the signal
    }
  }
}

/** Asks every process of each install to quit, kills what is left, and fails if anything still runs. */
export async function stopAll (roots: string[]): Promise<void> {
  const running = (): number[] => roots.flatMap(root => processesUnder(root).map(p => p.pid))
  signal(running(), 'SIGTERM')
  const deadline = Date.now() + QUIT_LIMIT_MS
  while (running().length > 0 && Date.now() < deadline) await Bun.sleep(POLL_MS)
  signal(running(), 'SIGKILL')
  await Bun.sleep(1000)
  const left = running()
  if (left.length > 0) throw new MeasureFailure(`processes ${left.join(', ')} are still running`)
}

async function waitFor<T> (what: string, limitMs: number, probe: () => Promise<T | null> | T | null): Promise<T> {
  const deadline = Date.now() + limitMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value !== null) return value
    await Bun.sleep(POLL_MS)
  }
  throw new MeasureFailure(`${what} within ${limitMs} ms`)
}

/** The `at` of the page's first-frame mark, or null before the page has written it. */
function firstFrameAt (dataDir: string): number | null {
  const file = join(dataDir, 'marks.jsonl')
  if (!existsSync(file)) return null
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith('{"name":"first-frame"'))
  try {
    const mark: unknown = JSON.parse(line ?? 'null')
    const at: unknown = typeof mark === 'object' && mark !== null ? Reflect.get(mark, 'at') : null
    return typeof at === 'number' ? at : null
  } catch {
    return null // caught while the line was being written: read again on the next poll
  }
}

/** The local node's port from `node.json`, or null before it is written. */
function nodePort (dataDir: string): number | null {
  try {
    const record: unknown = JSON.parse(readFileSync(join(dataDir, 'node.json'), 'utf8'))
    const port: unknown = typeof record === 'object' && record !== null ? Reflect.get(record, 'port') : null
    return typeof port === 'number' ? port : null
  } catch {
    return null // not written yet
  }
}

interface Started {
  dataDir: string
  startedAt: number
  firstFrameAt: number
  root: string
}

/** Starts one shell from nothing: no process of any install left, a fresh data folder, no CEF profile. */
async function launch (shell: Shell, app: string, roots: string[], args: string[]): Promise<Started> {
  await stopAll(roots)
  const dataDir = join(SPIKE, 'artifacts', 'measure-data', shell)
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  // only the profile: its parent holds the self-extraction record, without which the next start unpacks again
  rmSync(cefProfileDir(), { recursive: true, force: true })
  mkdirSync(join(SPIKE, 'artifacts', 'logs'), { recursive: true })
  const log = openSync(join(SPIKE, 'artifacts', 'logs', `measure-${shell}-${process.platform}.log`), 'a')
  const startedAt = Date.now()
  Bun.spawn([app, ...args], { env: { ...process.env, MANENT_SPIKE_DATA_DIR: dataDir }, stdout: log, stderr: log })
  closeSync(log)
  const at = await waitFor(`${shell} did not reach its first frame`, START_LIMIT_MS, () => firstFrameAt(dataDir))
  return { dataDir, startedAt, firstFrameAt: at, root: installRoot(app) }
}

async function coldStart (shell: Shell, app: string, roots: string[], idle: boolean): Promise<Launch> {
  const started = await launch(shell, app, roots, [])
  const result: Launch = { coldStartMs: started.firstFrameAt - started.startedAt }
  if (idle) {
    await Bun.sleep(Math.max(0, started.firstFrameAt + IDLE_WAIT_MS - Date.now()))
    result.idleRssBytes = processesUnder(started.root).reduce((sum, p) => sum + p.rssBytes, 0)
  }
  return result
}

async function debugPortAnswers (port: number, startedAt: number): Promise<boolean> {
  while (Date.now() < startedAt + PORT_LIMIT_MS) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return true
    } catch {
      // not listening yet
    }
    await Bun.sleep(POLL_MS)
  }
  return false
}

function debugArgs (shell: Shell): string[] {
  return shell === 'electron' ? [`--remote-debugging-port=${DEBUG_PORT.electron}`] : []
}

function typingApp (shell: Shell, args: Args): string {
  return shell === 'electron' ? args.apps.electron : args.apps.electrobunDebug
}

/** `cdp` when both shells' debugging ports answer within 30 s of launch. */
async function probeInput (args: Args, roots: string[]): Promise<Input> {
  for (const shell of SHELLS) {
    const started = await launch(shell, typingApp(shell, args), roots, debugArgs(shell))
    if (!(await debugPortAnswers(DEBUG_PORT[shell], started.startedAt))) return 'execCommand'
  }
  return 'cdp'
}

function isNumbers (value: unknown): value is number[] {
  return Array.isArray(value) && value.every(x => typeof x === 'number')
}

async function typeSamples (page: Page): Promise<number[]> {
  await page.evaluate(INSTRUMENT)
  await page.evaluate("window.__bench.place('middle')")
  await page.waitForTimeout(400)
  await page.keyboard.type(WARMUP, { delay: 50 })
  await page.evaluate('window.__bench.reset()')
  await page.keyboard.type(SENTENCE.repeat(5), { delay: 70 })
  await page.waitForTimeout(300)
  const samples: unknown = await page.evaluate('window.__bench.results()')
  if (!isNumbers(samples)) throw new MeasureFailure('the page returned no typing samples')
  return samples
}

async function settle (page: Page): Promise<unknown> {
  await page.waitForTimeout(300)
  return page.evaluate<unknown>(STATE)
}

async function pressTimes (page: Page, key: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press(key)
}

/** C1–C7, in order, on the page as the typing left it. */
async function editingChecks (page: Page): Promise<Editing> {
  const cdp = await page.context().newCDPSession(page)
  const size: unknown = await page.evaluate('({ innerWidth, innerHeight, devicePixelRatio })')
  const read = (key: string): number => {
    const v: unknown = typeof size === 'object' && size !== null ? Reflect.get(size, key) : null
    if (typeof v !== 'number') throw new MeasureFailure(`the page reported no ${key}`)
    return v
  }
  await page.evaluate("window.__bench.place('middle')")
  await page.keyboard.type(SENTENCE)
  const c1 = await settle(page)
  await page.keyboard.press('Enter')
  const c2Enter = await settle(page)
  await page.keyboard.press('Backspace')
  const c2 = { afterEnter: c2Enter, afterBackspace: await settle(page) }
  await pressTimes(page, 'ArrowDown', 50)
  await pressTimes(page, 'ArrowUp', 50)
  const c3 = await settle(page)
  await pressTimes(page, 'Shift+ArrowRight', 10)
  const c4 = await settle(page)
  const c5Before = await settle(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('x')
  const c5Typed = await settle(page)
  await page.keyboard.press('ControlOrMeta+z')
  const c5 = { before: c5Before, afterTyping: c5Typed, afterUndo: await settle(page) }
  await page.evaluate("window.__bench.place('middle'); window.__comp = { start: 0, end: 0 }; window.__view.dom.addEventListener('compositionstart', () => window.__comp.start++); window.__view.dom.addEventListener('compositionend', () => window.__comp.end++)")
  for (const text of ['k', 'ka', 'kan']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  await cdp.send('Input.insertText', { text: 'kan' })
  const c6 = { state: await settle(page), events: await page.evaluate<unknown>('window.__comp') }
  const before: unknown = await page.evaluate('window.__view.state.doc.textContent')
  await cdp.send('Input.imeSetComposition', { text: 'k', selectionStart: 1, selectionEnd: 1 })
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
  const c7State = await settle(page)
  const after: unknown = await page.evaluate('window.__view.state.doc.textContent')
  const c7 = { unchanged: before === after, state: c7State }
  await cdp.detach()
  return { innerWidth: read('innerWidth'), innerHeight: read('innerHeight'), devicePixelRatio: read('devicePixelRatio'), checks: { C1: c1, C2: c2, C3: c3, C4: c4, C5: c5, C6: c6, C7: c7 } }
}

/** One typing launch over CDP; the first launch of a shell also runs its editing checks. */
async function typingLaunch (shell: Shell, args: Args, roots: string[], withChecks: boolean): Promise<{ samples: number[]; editing: Editing | null }> {
  const started = await launch(shell, typingApp(shell, args), roots, debugArgs(shell))
  if (!(await debugPortAnswers(DEBUG_PORT[shell], started.startedAt))) throw new MeasureFailure(`the debugging port of ${shell} did not answer`)
  const port = nodePort(started.dataDir)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT[shell]}`)
  try {
    const page = await waitFor(`${shell} showed no page of its node`, START_LIMIT_MS, () =>
      browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith(`http://127.0.0.1:${port}/`)) ?? null)
    const samples = await typeSamples(page)
    return { samples, editing: withChecks ? await editingChecks(page) : null }
  } finally {
    await browser.close()
  }
}

/** The value at fraction `p` of the sorted samples, as the earlier harness reads a percentile. */
function percentile (values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Number.NaN
}

function summarise (runs: number[][]): Typing {
  const all = runs.flat()
  const ci = (p: number): Interval => bootstrap([runs], g => percentile(g[0]!.flat(), p))
  return {
    n: all.length,
    p50: percentile(all, 0.5),
    p95: percentile(all, 0.95),
    p99: percentile(all, 0.99),
    runP50s: runs.map(run => percentile(run, 0.5)),
    ci: { p50: ci(0.5), p95: ci(0.95), p99: ci(0.99) }
  }
}

/** What an earlier run of this command wrote to `out`, so that a rerun continues after its last row. */
function readProgress (out: string): Pick<Measure, 'baseline' | 'input' | 'pairs' | 'typingRuns' | 'editing'> | null {
  if (!existsSync(out)) return null
  const value: unknown = JSON.parse(readFileSync(out, 'utf8'))
  if (typeof value !== 'object' || value === null) throw new MeasureFailure(`${out} is not a measure file`)
  const pairs: unknown = Reflect.get(value, 'pairs')
  const typingRuns: unknown = Reflect.get(value, 'typingRuns')
  const editing: unknown = Reflect.get(value, 'editing')
  const input: unknown = Reflect.get(value, 'input')
  const baseline: unknown = Reflect.get(value, 'baseline')
  if (!Array.isArray(pairs) || !Array.isArray(typingRuns) || typeof editing !== 'object' || editing === null) throw new MeasureFailure(`${out} is not a measure file`)
  if (input !== null && input !== 'cdp' && input !== 'execCommand') throw new MeasureFailure(`${out} holds an unknown input ${String(input)}`)
  return { baseline: typeof baseline === 'number' ? baseline : null, input, pairs, typingRuns, editing }
}

function write (out: string, m: Measure): void {
  const typing: Partial<Record<Shell, Typing>> = {}
  for (const shell of SHELLS) {
    const runs = m.typingRuns.filter(r => r.shell === shell).map(r => r.samples)
    if (runs.length > 0) typing[shell] = summarise(runs)
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out + '.tmp', JSON.stringify({ ...m, typing }, null, 2) + '\n')
  renameSync(out + '.tmp', out)
}

function notRun (): Record<Check, 'not run'> {
  return { C1: 'not run', C2: 'not run', C3: 'not run', C4: 'not run', C5: 'not run', C6: 'not run', C7: 'not run' }
}

async function measure (args: Args, baseline: number | null): Promise<void> {
  const done = readProgress(args.out)
  const m: Measure = {
    platform: process.platform,
    baseline: done?.baseline ?? baseline,
    input: done?.input ?? null,
    installerBytes: { electrobun: statSync(args.installers.electrobun).size, electron: statSync(args.installers.electron).size },
    pairs: done?.pairs ?? [],
    typingRuns: done?.typingRuns ?? [],
    typing: {},
    editing: done?.editing ?? {}
  }
  const roots = [args.apps.electrobun, args.apps.electrobunDebug, args.apps.electron].map(installRoot)
  const coldApp: Record<Shell, string> = { electrobun: args.apps.electrobun, electron: args.apps.electron }
  for (let i = m.pairs.length; i < args.pairs; i++) {
    const loadStart = load1()
    const order = i % 2 === 0 ? SHELLS : SHELLS.toReversed()
    const launches: Partial<Record<Shell, Launch>> = {}
    for (const shell of order) launches[shell] = await coldStart(shell, coldApp[shell], roots, i < IDLE_PAIRS)
    await stopAll(roots)
    m.pairs.push({ electrobun: launches.electrobun!, electron: launches.electron!, loadStart, loadEnd: load1(), baseline })
    write(args.out, m)
    console.log(`pair ${i + 1}: electrobun ${launches.electrobun!.coldStartMs} ms, electron ${launches.electron!.coldStartMs} ms`)
  }
  m.input ??= await probeInput(args, roots)
  write(args.out, m)
  if (m.input === 'execCommand') {
    // no real key events reach a shell without a debugging port, and the page carries no self-test probe
    for (const shell of SHELLS) m.editing[shell] ??= { innerWidth: null, innerHeight: null, devicePixelRatio: null, checks: notRun() }
    write(args.out, m)
    await stopAll(roots)
    return
  }
  for (let i = m.typingRuns.length; i < TYPING_LAUNCHES * SHELLS.length; i++) {
    const shell = SHELLS[i % SHELLS.length]!
    const result = await typingLaunch(shell, args, roots, m.editing[shell] === undefined)
    m.typingRuns.push({ shell, samples: result.samples, baseline })
    if (result.editing) m.editing[shell] = result.editing
    write(args.out, m)
    console.log(`typing ${i + 1}: ${shell}, ${result.samples.length} samples`)
  }
  await stopAll(roots)
}

if (import.meta.main) {
  const { baseline } = requireTimed()
  try {
    await measure(readArgs(process.argv.slice(2)), baseline)
  } catch (error) {
    if (!(error instanceof MeasureFailure)) throw error
    console.error(`measure: ${error.message}`)
    process.exit(1)
  }
}
