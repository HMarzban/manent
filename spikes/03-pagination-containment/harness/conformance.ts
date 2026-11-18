// bun harness/conformance.ts <chromium|firefox|webkit|all>
// Renders the 120-page corpus and the edge matrix in each engine and compares every block's line starts with the
// wrapper's, at several zoom levels and device scale factors, under pre-wrap and break-spaces.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import type { Browser } from 'playwright'
import { assertFont, resultsDir, startServer } from './lib.ts'

const ENGINES = { chromium, firefox, webkit }
type Engine = keyof typeof ENGINES

const WHITE_SPACES = ['pre-wrap', 'break-spaces'] as const
const SETS = ['corpus', 'edge'] as const
// App zoom is a CSS scale on the page; the device scale factor stands in for browser zoom and display density.
const VIEWS = [
  { zoom: 50, dpr: 1 }, { zoom: 100, dpr: 1 }, { zoom: 150, dpr: 1 }, { zoom: 300, dpr: 1 },
  { zoom: 100, dpr: 0.8 }, { zoom: 100, dpr: 1.25 }, { zoom: 100, dpr: 1.5 }, { zoom: 100, dpr: 2 },
] as const

const NOTE = 'Device scale factors 0.8 and 1.25 approximate browser zoom at 80 % and 125 %; they are not browser zoom.'

async function rowsFor(browser: Browser, base: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (const whiteSpace of WHITE_SPACES) {
    for (const { zoom, dpr } of VIEWS) {
      for (const set of SETS) {
        const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 800 } })
        const page = await ctx.newPage()
        await page.goto(`${base}/conformance?${new URLSearchParams({ set, ws: whiteSpace, zoom: String(zoom) })}`)
        await assertFont(page)
        const result = await page.evaluate(() => window.__conformance.compare())
        await ctx.close()
        rows.push({ whiteSpace, zoom, dpr, set, ...result })
        process.stderr.write(`${browser.browserType().name()} ${whiteSpace} zoom ${zoom} dpr ${dpr} ${set}: ${result.mismatched}/${result.blocks}\n`)
      }
    }
  }
  return rows
}

async function reportFor(engine: Engine, base: string): Promise<object> {
  let browser: Browser
  try {
    browser = await ENGINES[engine].launch({ headless: true })
  } catch (e) {
    return { engine, version: null, launched: false, reason: String(e).split('\n')[0], note: NOTE, rows: [] }
  }
  try {
    return { engine, version: browser.version(), launched: true, reason: null, note: NOTE, rows: await rowsFor(browser, base) }
  } finally {
    await browser.close()
  }
}

if (import.meta.main) {
  const arg = process.argv[2]
  const engines: Engine[] = arg === 'all' ? ['chromium', 'firefox', 'webkit'] : arg === 'chromium' || arg === 'firefox' || arg === 'webkit' ? [arg] : []
  if (!engines.length) {
    console.error('Usage: bun harness/conformance.ts <chromium|firefox|webkit|all>')
    process.exit(2)
  }
  const { server, base } = await startServer()
  for (const engine of engines) {
    const report = await reportFor(engine, base)
    writeFileSync(join(resultsDir(), `conformance-${engine}.json`), JSON.stringify(report, null, 1) + '\n')
  }
  server.stop(true)
}
