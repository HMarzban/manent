// Launches an installed shell with a fresh data folder, checks its local node end to end, then stops every
// process the install owns. Usage: bun scripts/smoke.ts <electrobun|electron> --app <executable> [--expect-version <v>]
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { Shell } from '../shared/paths.ts'

const SPIKE = join(import.meta.dir, '..')
const START_LIMIT_MS = 60_000
const QUIT_LIMIT_MS = 10_000
const POLL_MS = 100

interface NodeRecord {
  port: number
  token: string
}

class SmokeFailure extends Error {}

function readArgs (argv: string[]): { shell: Shell; app: string; expectVersion: string | null } {
  const [shell, ...rest] = argv
  if (shell !== 'electrobun' && shell !== 'electron') throw new SmokeFailure('the first argument must be electrobun or electron')
  const value = (flag: string): string | null => {
    const at = rest.indexOf(flag)
    return at === -1 ? null : rest[at + 1] ?? null
  }
  const app = value('--app')
  if (!app) throw new SmokeFailure('--app <installed executable> is required')
  return { shell, app: resolve(app), expectVersion: value('--expect-version') }
}

/** The folder whose processes belong to this install: the enclosing `.app` on macOS, else the executable's folder. */
function installRoot (app: string): string {
  const bundle = app.lastIndexOf('.app' + sep)
  return bundle === -1 ? dirname(app) : app.slice(0, bundle + 4)
}

/** The PIDs of every running process whose executable file is inside `root`. */
function processesUnder (root: string): number[] {
  const prefix = root + sep
  const own = (pid: number, exe: string): number[] => (exe.startsWith(prefix) ? [pid] : [])
  if (process.platform === 'linux') {
    return readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(Number).flatMap(pid => {
      try {
        return own(pid, readlinkSync(`/proc/${pid}/exe`))
      } catch {
        return [] // the process ended, or is not ours to read
      }
    })
  }
  const listing = process.platform === 'win32'
    ? ['powershell', '-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ExecutablePath)" }']
    : ['ps', '-A', '-o', 'pid=,comm=']
  const out = Bun.spawnSync(listing).stdout.toString()
  return out.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
    return match ? own(Number(match[1]), match[2] ?? '') : []
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

async function waitFor<T> (what: string, limitMs: number, probe: () => Promise<T | null> | T | null): Promise<T> {
  const deadline = Date.now() + limitMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value !== null) return value
    await Bun.sleep(POLL_MS)
  }
  throw new SmokeFailure(`${what} within ${limitMs} ms`)
}

/** Asks every process of the install to quit, kills what is left, and fails if anything still runs. */
async function stopAll (root: string): Promise<void> {
  signal(processesUnder(root), 'SIGTERM')
  const deadline = Date.now() + QUIT_LIMIT_MS
  while (processesUnder(root).length > 0 && Date.now() < deadline) await Bun.sleep(POLL_MS)
  const stuck = processesUnder(root)
  if (stuck.length === 0) return
  signal(stuck, 'SIGKILL')
  await Bun.sleep(1000)
  const left = processesUnder(root)
  if (left.length > 0) throw new SmokeFailure(`processes ${left.join(', ')} are still running from ${root}`)
}

function readRecord (dataDir: string): NodeRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dataDir, 'node.json'), 'utf8'))
    if (typeof value !== 'object' || value === null || !('port' in value) || !('token' in value)) return null
    return typeof value.port === 'number' && typeof value.token === 'string' ? { port: value.port, token: value.token } : null
  } catch {
    return null // not written yet
  }
}

function hasMark (dataDir: string, name: string): boolean {
  const file = join(dataDir, 'marks.jsonl')
  if (!existsSync(file)) return false
  return readFileSync(file, 'utf8').split('\n').some(line => line.startsWith(`{"name":"${name}`))
}

/** The row count of a pong, or null when the message is not one. */
function rowsOf (message: string): number | null {
  let pong: unknown
  try {
    pong = JSON.parse(message)
  } catch {
    return null // not JSON, so not a pong
  }
  if (typeof pong !== 'object' || pong === null || !('type' in pong) || !('rows' in pong)) return null
  return pong.type === 'pong' && typeof pong.rows === 'number' ? pong.rows : null
}

/** Sends one ping over a new WebSocket and resolves the row count its pong reports. */
function ping (port: number, token: string, n: number): Promise<number> {
  return new Promise((resolveRows, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`)
    const timer = setTimeout(() => { ws.close(); reject(new SmokeFailure(`no pong for ping ${n}`)) }, 5000)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'ping', n }))
    ws.onmessage = (e) => {
      clearTimeout(timer)
      ws.close()
      const rows = rowsOf(String(e.data))
      if (rows === null) reject(new SmokeFailure(`ping ${n} got ${String(e.data)}`))
      else resolveRows(rows)
    }
    ws.onerror = () => { clearTimeout(timer); reject(new SmokeFailure('the WebSocket did not open')) }
  })
}

async function smoke (shell: Shell, app: string, expectVersion: string | null): Promise<void> {
  if (!existsSync(app)) throw new SmokeFailure(`app not found: ${app}`)
  const root = installRoot(app)
  await stopAll(root)

  const dataDir = join(SPIKE, 'artifacts', 'smoke-data', `${shell}-${process.platform}`)
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(join(SPIKE, 'artifacts', 'logs'), { recursive: true })
  const log = openSync(join(SPIKE, 'artifacts', 'logs', `smoke-${shell}-${process.platform}.log`), 'w')
  const startedAt = Date.now()
  Bun.spawn([app], { env: { ...process.env, MANENT_SPIKE_DATA_DIR: dataDir }, stdout: log, stderr: log })
  closeSync(log)

  try {
    const record = await waitFor('node.json was not written', START_LIMIT_MS, () => readRecord(dataDir))
    const version = await waitFor('/health did not answer', START_LIMIT_MS, async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${record.port}/health`)
        if (!res.ok) return null
        const body: unknown = await res.json()
        return typeof body === 'object' && body !== null && 'version' in body && typeof body.version === 'string' ? body.version : null
      } catch {
        return null // not listening yet
      }
    })
    const healthMs = Date.now() - startedAt
    if (expectVersion !== null && version !== expectVersion) {
      throw new SmokeFailure(`the app reports version ${version}, not ${expectVersion}`)
    }
    await waitFor('the page did not reach its first frame', START_LIMIT_MS, () => (hasMark(dataDir, 'first-frame') ? true : null))
    const before = await ping(record.port, record.token, 1)
    const after = await ping(record.port, record.token, 2)
    if (after !== before + 1) throw new SmokeFailure(`rows went from ${before} to ${after}, not up by one`)

    const result = { shell, platform: process.platform, version, healthMs, wsRoundTrip: true, sqliteRows: after }
    writeFileSync(join(SPIKE, 'results', `smoke-${shell}-${process.platform}.json`), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result))
  } finally {
    await stopAll(root)
  }
}

if (import.meta.main) {
  try {
    const { shell, app, expectVersion } = readArgs(process.argv.slice(2))
    await smoke(shell, app, expectVersion)
  } catch (error) {
    if (!(error instanceof SmokeFailure)) throw error
    console.error(`smoke: ${error.message}`)
    process.exit(1)
  }
}
