// The local node both shells run: the page, a marks log, and a WebSocket that writes one SQLite row per ping.
import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'

export interface NodeOptions {
  dataDir: string
  version: string
  pageDir: string
}

export interface LocalNode {
  port: number
  token: string
  stop(): Promise<void>
}

interface Ping {
  type: 'ping'
  n: number
}

/** The ping a WebSocket message carries, or null for anything else. */
function readPing (message: string | Buffer): Ping | null {
  let value: unknown
  try {
    value = JSON.parse(String(message))
  } catch {
    return null // not JSON: the page never sends it, so it is dropped unanswered
  }
  if (typeof value !== 'object' || value === null || !('type' in value) || !('n' in value)) return null
  return value.type === 'ping' && typeof value.n === 'number' && Number.isInteger(value.n) ? { type: 'ping', n: value.n } : null
}

function openDatabase (dataDir: string): Database {
  const db = new Database(join(dataDir, 'spike.sqlite'), { create: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = FULL')
  if (process.platform === 'darwin') db.run('PRAGMA fullfsync = ON')
  db.run('CREATE TABLE IF NOT EXISTS rounds (n INTEGER, at INTEGER)')
  return db
}

/** The file under `pageDir` that a request path names, or null when it names nothing there. */
function pageFile (pageDir: string, pathname: string): string | null {
  const file = normalize(join(pageDir, pathname === '/' ? 'index.html' : pathname))
  if (!file.startsWith(pageDir + sep) || !existsSync(file)) return null
  return file
}

/**
 * Starts the node on 127.0.0.1 at a port the system picks, and writes `<dataDir>/node.json` once it listens.
 * Every route but `/health` needs the per-launch token as `t` in the query, and answers 401 without it.
 */
export async function startLocalNode (opts: NodeOptions): Promise<LocalNode> {
  mkdirSync(opts.dataDir, { recursive: true })
  const pageDir = normalize(opts.pageDir)
  const token = randomBytes(16).toString('hex')
  const db = openDatabase(opts.dataDir)
  const insert = db.prepare('INSERT INTO rounds (n, at) VALUES (?, ?)')
  const count = db.prepare<{ rows: number }, []>('SELECT count(*) AS rows FROM rounds')
  const marks = join(opts.dataDir, 'marks.jsonl')

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch (req, srv) {
      const url = new URL(req.url)
      if (url.pathname === '/health') return Response.json({ ok: true, version: opts.version, pid: process.pid })
      if (url.searchParams.get('t') !== token) return new Response('unauthorised', { status: 401 })
      if (url.pathname === '/ws') {
        return srv.upgrade(req, { data: undefined }) ? undefined : new Response('expected a WebSocket', { status: 400 })
      }
      if (url.pathname === '/mark') {
        appendFileSync(marks, JSON.stringify({ name: url.searchParams.get('name'), at: Date.now() }) + '\n')
        return new Response(null, { status: 204 })
      }
      const file = pageFile(pageDir, url.pathname)
      return file ? new Response(Bun.file(file)) : new Response('not found', { status: 404 })
    },
    websocket: {
      message (ws, message) {
        const ping = readPing(message)
        if (!ping) return
        insert.run(ping.n, Date.now())
        ws.send(JSON.stringify({ type: 'pong', n: ping.n, rows: count.get()?.rows ?? 0 }))
      }
    }
  })
  const port = server.port
  if (port === undefined) throw new Error('the local node did not get a port')

  const record = join(opts.dataDir, 'node.json')
  writeFileSync(record + '.tmp', JSON.stringify({ port, token, pid: process.pid, version: opts.version, startedAt: Date.now() }))
  renameSync(record + '.tmp', record)

  return {
    port,
    token,
    async stop () {
      await server.stop(true)
      db.close()
    }
  }
}
