// Launches the installed 0.0.1 with SPIKE_CHECK_UPDATE=1 against a local update host, and waits for the relaunched
// app to report the new version. Usage: bun scripts/update-check.ts --app <installed 0.0.1 executable> --updates <dir>
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { appDataDir } from '../shared/paths.ts'
import { installRoot, stopAll } from './measure.ts'
import { serveUpdates } from './serve-updates.ts'

const SPIKE = join(import.meta.dir, '..')
const PORT = 47471
const FROM = '0.0.1'
const RELAUNCH_LIMIT_MS = 120_000
const POLL_MS = 500
const OS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macos', win32: 'win', linux: 'linux' }
// the updater's statuses after which nothing more happens in this process
const FINAL = new Set(['update-error', 'update-no-update'])

interface UpdateResult {
  platform: NodeJS.Platform
  from: '0.0.1'
  to: string | null
  status: 'applied' | 'failed' | 'not run'
  bytesDownloaded: number | null
  ms: number | null
  statuses: string[]
  notes: string
}

function field (value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function readJson (file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null // missing, or caught half-written: read again on the next poll
  }
}

/** The version the update manifest in `dir` offers, from the v2 manifest or, failing that, the v1 one. */
function offeredVersion (dir: string): string | null {
  const prefix = `stable-${OS[process.platform] ?? process.platform}-${process.arch}`
  for (const name of [`${prefix}-update-v2.json`, `${prefix}-update.json`]) {
    const version = field(readJson(join(dir, name)), 'version')
    if (typeof version === 'string') return version
  }
  return null
}

/** The version an installed Electrobun app was built as: `Resources/version.json` beside its executable's folder. */
function installedVersion (app: string): string | null {
  const version = field(readJson(join(dirname(app), '..', 'Resources', 'version.json')), 'version')
  return typeof version === 'string' ? version : null
}

/** The version `/health` reports for a node whose `node.json` in `dataDir` was written after `since`, else null. */
async function healthVersion (dataDir: string, since: number): Promise<string | null> {
  const record = readJson(join(dataDir, 'node.json'))
  const port = field(record, 'port')
  const startedAt = field(record, 'startedAt')
  if (typeof port !== 'number' || typeof startedAt !== 'number' || startedAt < since) return null
  try {
    const version = field(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), 'version')
    return typeof version === 'string' ? version : null
  } catch {
    return null // that node has stopped, or is not listening yet
  }
}

function parseLine (line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return null // the last line, caught while it is written
  }
}

function markNames (dataDir: string): string[] {
  const file = join(dataDir, 'marks.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').flatMap(line => {
    const name = field(parseLine(line), 'name')
    return typeof name === 'string' ? [name] : []
  })
}

function notRun (to: string | null, notes: string): UpdateResult {
  return { platform: process.platform, from: FROM, to, status: 'not run', bytesDownloaded: null, ms: null, statuses: [], notes }
}

async function check (app: string, updates: string): Promise<UpdateResult> {
  const to = existsSync(updates) ? offeredVersion(updates) : null
  if (!existsSync(app)) return notRun(to, `no installed ${FROM} at ${relative(SPIKE, app)}`)
  if (to === null) return notRun(to, `no update artifacts in ${relative(SPIKE, updates)}`)
  const installed = installedVersion(app)
  if (installed !== FROM) return notRun(to, `the installed app is ${installed ?? 'of no known version'}, not ${FROM}`)

  const root = installRoot(app)
  await stopAll([root])
  const host = serveUpdates({ dir: updates, port: PORT })
  const dataDir = join(SPIKE, 'artifacts', 'update-data')
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  // the relaunch may not inherit this environment, and then its node writes to the default folder
  const watched = [dataDir, appDataDir('electrobun')]
  mkdirSync(join(SPIKE, 'artifacts', 'logs'), { recursive: true })
  const log = openSync(join(SPIKE, 'artifacts', 'logs', `update-${process.platform}.log`), 'w')
  const startedAt = Date.now()
  Bun.spawn([app], { env: { ...process.env, MANENT_SPIKE_DATA_DIR: dataDir, SPIKE_CHECK_UPDATE: '1' }, stdout: log, stderr: log })
  closeSync(log)

  const reportsNew = async (): Promise<boolean> => (await Promise.all(watched.map(dir => healthVersion(dir, startedAt)))).includes(to)
  try {
    let applied = false
    let final = false
    while (!applied && !final && Date.now() < startedAt + RELAUNCH_LIMIT_MS) {
      await Bun.sleep(POLL_MS)
      final = markNames(dataDir).some(name => FINAL.has(name))
      applied = await reportsNew()
    }
    const ms = Date.now() - startedAt
    const names = markNames(dataDir)
    const statuses = names.filter(name => name.startsWith('update-')).map(name => name.slice('update-'.length))
    const errors = names.filter(name => name.startsWith('updater-error-')).map(name => name.slice('updater-error-'.length))
    const notes = applied ? '' : errors.join('; ') || `the relaunched app did not report ${to} within ${RELAUNCH_LIMIT_MS / 1000} s`
    return { platform: process.platform, from: FROM, to, status: applied ? 'applied' : 'failed', bytesDownloaded: host.bytesServed(), ms, statuses, notes }
  } finally {
    await stopAll([root])
    await host.stop()
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const value = (flag: string): string | null => {
    const at = args.indexOf(flag)
    return at === -1 ? null : args[at + 1] ?? null
  }
  const app = value('--app')
  const updates = value('--updates')
  if (!app || !updates) {
    console.error('usage: bun scripts/update-check.ts --app <installed 0.0.1 executable> --updates <dir>')
    process.exit(1)
  }
  const result = await check(resolve(app), resolve(updates))
  writeFileSync(join(SPIKE, 'results', `update-${process.platform}.json`), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
