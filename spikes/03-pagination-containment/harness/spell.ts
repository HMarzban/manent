// bun harness/spell.ts
// The browser's spellcheck while typing, in a headed Google Chrome, because headless builds do not run it: spell=1
// against spell=0 at 120 and 2,000 pages, loaded in turn, typing in the middle of the document. Each spellcheck load
// then types a misspelt word and saves a screenshot of it, the evidence that spellcheck ran.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { keyOf, positionStats, retried, typeAt, withLoad, writtenKeys } from './bench.ts'
import type { LoadInfo, PositionStats, Sample } from './bench.ts'
import { resultsDir, startServer } from './lib.ts'
import { requireTimed } from './timing.ts'

const SIZES = [120, 2000] as const
const THROTTLES = [1, 6] as const
const SPELL = [1, 0] as const
const LOADS = 3
const MISSPELT = ' recieve teh '
const DICTIONARY_WAIT_MS = 5000
const CLIP_HEIGHT_PX = 140

interface SpellRow {
  name: string
  throttle: number
  version: string
  baseline: number | null
  loads: LoadInfo[]
  middle: PositionStats
  /** The screenshot of the misspelt word, beside this file; null with spellcheck off. */
  screenshot: string | null
}

const nameOf = (pages: number, spell: number): string => `${pages}p-spell${spell}`

// A screenshot clip must lie inside the viewport, so the caret is brought on screen before the dictionary wait.
async function misspelt(page: Page, file: string): Promise<void> {
  await page.keyboard.type(MISSPELT, { delay: 50 })
  await page.evaluate(() => window.__view.dispatch(window.__view.state.tr.scrollIntoView()))
  await page.waitForTimeout(DICTIONARY_WAIT_MS)
  const caret = await page.evaluate(() => window.__risk.caret())
  if ('error' in caret) throw new Error(`no caret to photograph: ${caret.error}`)
  const { width, height } = page.viewportSize() ?? { width: 1280, height: 800 }
  const y = Math.min(Math.max(0, caret.top - 60), height - CLIP_HEIGHT_PX)
  await page.screenshot({ path: join(resultsDir(), file), clip: { x: 0, y, width, height: CLIP_HEIGHT_PX } })
}

if (import.meta.main) {
  const { baseline } = requireTimed()
  const file = join(resultsDir(), 'spell.jsonl')
  const written = writtenKeys(file)
  const { server, base } = await startServer()
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-backgrounding-occluded-windows'] })
  try {
    for (const pages of SIZES) {
      for (const throttle of THROTTLES) {
        const todo = SPELL.filter((spell) => !written.has(keyOf(nameOf(pages, spell), throttle)))
        const loads = new Map<(typeof SPELL)[number], { info: LoadInfo; result: Sample }[]>(todo.map((spell) => [spell, []]))
        for (let i = 0; i < LOADS; i++) {
          for (const spell of todo) {
            const screenshot = spell === 1 ? `spell-${pages}.png` : null
            const q = { pages: String(pages), wrap: '100', cv: 'auto', pg: '1', spell: String(spell) }
            const load = await retried(keyOf(nameOf(pages, spell), throttle), () => withLoad(browser, base, q, throttle, async (page) => {
              const sample = await typeAt(page, 'middle', 1)
              if (screenshot) await misspelt(page, screenshot)
              return sample
            }))
            if (load) loads.get(spell)!.push(load)
          }
        }
        for (const spell of todo) {
          const done = loads.get(spell)!
          if (done.length < LOADS) continue
          const row: SpellRow = {
            name: nameOf(pages, spell), throttle, version: browser.version(), baseline, loads: done.map((l) => l.info),
            middle: positionStats(done.map((l) => l.result)),
            screenshot: spell === 1 ? `spell-${pages}.png` : null,
          }
          appendFileSync(file, JSON.stringify(row) + '\n')
          process.stderr.write(`${keyOf(row.name, throttle)}: written\n`)
        }
      }
    }
  } finally {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))])
    server.stop(true)
  }
}
