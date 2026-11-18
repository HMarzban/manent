import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startLocalNode } from './node.ts'

const tmp = mkdtempSync(join(tmpdir(), 'manent-spike-01-node-'))
const pageDir = join(import.meta.dir, 'page')
const stops: Array<() => Promise<void>> = []

afterAll(async () => {
  for (const stop of stops) await stop()
  rmSync(tmp, { recursive: true, force: true })
})

function roundTrip (port: number, token: string, n: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'ping', n }))
    ws.onmessage = (e) => { resolve(JSON.parse(String(e.data))); ws.close() }
    ws.onerror = () => reject(new Error('the WebSocket did not open'))
  })
}

test('health, token and one round trip', async () => {
  const node = await startLocalNode({ dataDir: tmp, version: '0.0.1', pageDir })
  stops.push(node.stop)
  expect((await (await fetch(`http://127.0.0.1:${node.port}/health`)).json()).version).toBe('0.0.1')
  expect((await fetch(`http://127.0.0.1:${node.port}/mark?name=x`)).status).toBe(401)
  const pong = await roundTrip(node.port, node.token, 1)
  expect(pong).toEqual({ type: 'pong', n: 1, rows: 1 })
  expect(JSON.parse(readFileSync(join(tmp, 'node.json'), 'utf8')).port).toBe(node.port)
})
