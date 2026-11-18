// A static host on 127.0.0.1 that serves one folder flat, where the installed app looks for its update.
// Usage: bun scripts/serve-updates.ts --dir <dir> --port 47471
import { existsSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

export interface UpdateHost {
  /** Bytes of every file answered with 200 so far. */
  bytesServed(): number
  stop(): Promise<void>
}

/** Serves the files directly inside `dir` by name; any other path, a sub-folder's included, is 404. */
export function serveUpdates (opts: { dir: string; port: number }): UpdateHost {
  const dir = resolve(opts.dir)
  let served = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    fetch (req) {
      const name = decodeURIComponent(new URL(req.url).pathname.slice(1))
      const file = join(dir, name)
      if (name === '' || basename(name) !== name || !existsSync(file) || !statSync(file).isFile()) return new Response('not found', { status: 404 })
      served += statSync(file).size
      return new Response(Bun.file(file))
    }
  })
  return {
    bytesServed: () => served,
    stop: () => server.stop(true)
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const value = (flag: string): string | null => {
    const at = args.indexOf(flag)
    return at === -1 ? null : args[at + 1] ?? null
  }
  const dir = value('--dir')
  const port = Number(value('--port'))
  if (!dir || !Number.isInteger(port) || port < 1) {
    console.error('usage: bun scripts/serve-updates.ts --dir <dir> --port <port>')
    process.exit(1)
  }
  serveUpdates({ dir, port })
  console.log(`serving ${dir} on http://127.0.0.1:${port}/`)
}
