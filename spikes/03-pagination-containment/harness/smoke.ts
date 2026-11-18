// bun harness/smoke.ts
// The editor page in Chromium: the font, the engine's pages, the break widgets, exact section sizes, the empty and
// the one-tall-block documents, and no pagination work on arrow keys. Exits 1 when a check fails.
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { makeCorpus } from '../src/corpus.ts'
import { paginate, wrap } from '../src/engine.ts'
import { assertFont, startServer } from './lib.ts'

let failed = 0
function record(check: string, pass: boolean, detail: unknown): void {
  if (!pass) failed++
  console.log(`${pass ? 'PASS' : 'FAIL'} ${check} ${JSON.stringify(detail)}`)
}

/** Opens the editor page with `params` over the defaults in a fresh context; throws when the page is not served. */
export async function openEditor(browser: Browser, base: string, params: Record<string, string> = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const response = await page.goto(`${base}/?${new URLSearchParams(params)}`)
  if (!response?.ok()) throw new Error(`the editor page was not served: ${response?.status()}`)
  await page.waitForFunction(() => window.__view)
  return page
}

async function smoke(browser: Browser, base: string): Promise<void> {
  const page = await openEditor(browser, base)
  try {
    await assertFont(page)
    record('S1 the script font is loaded', true, null)
  } catch (e) {
    record('S1 the script font is loaded', false, String(e))
  }

  const pages = await page.evaluate(() => window.__pg.pages())
  const expected = paginate(makeCorpus(120))
  record('S2 the page starts equal the engine in Bun', Bun.deepEquals(pages, expected), { page: pages.length, bun: expected.length })

  const widgets = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.pb')]
    return { pb: all.length, outsideSection: all.filter((e) => !e.closest('.section')).length, mid: document.querySelectorAll('.pb.mid').length }
  })
  const inside = pages.filter((p) => p.startLine > 0).length
  record('S3 one widget per break, all inside sections, one mid-block widget per split', widgets.pb === pages.length - 1 && widgets.outsideSection === 0 && widgets.mid === inside && inside > 0, { ...widgets, pages: pages.length, startInside: inside })

  const sizes = await page.evaluate(() => ({ intrinsic: window.__sec.intrinsic(), dom: window.__sec.domHeights() }))
  const diffs = sizes.intrinsic.map((px, i) => Math.abs(px - (sizes.dom[i] ?? Number.NaN)))
  const largest = Math.max(...diffs)
  record('S4 each section\'s intrinsic size equals its laid-out height', sizes.intrinsic.length === sizes.dom.length && sizes.intrinsic.length > 0 && largest === 0, { sections: sizes.intrinsic.length, largestDifferencePx: largest, differing: diffs.filter((d) => d !== 0).length })

  const before = await page.evaluate(() => { window.__risk.setOff(Math.floor(window.__risk.textLen() / 2), true); return { recomputes: window.__pg.stats().recomputes, headOff: window.__risk.sel().headOff } })
  for (const key of ['ArrowDown', 'ArrowRight']) for (let i = 0; i < 10; i++) await page.keyboard.press(key)
  // ProseMirror reads the moved DOM selection a moment later; wait for it, so the keys' transactions are counted.
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ recomputes: window.__pg.stats().recomputes, headOff: window.__risk.sel().headOff }))
  record('S7 twenty arrow keys cause no pagination work', after.recomputes === before.recomputes && after.headOff > before.headOff, { before, after })
  await page.context().close()

  const empty = await openEditor(browser, base, { pages: '0' })
  const shape = await empty.evaluate(() => ({ sections: window.__sec.count(), blocks: window.__sec.sizes(), text: window.__view.state.doc.textContent, pages: window.__pg.pages().length, pb: document.querySelectorAll('.pb').length }))
  await empty.evaluate(() => window.__view.focus())
  await empty.keyboard.type('a')
  const typed = await empty.evaluate(() => window.__view.state.doc.textContent)
  record('S5 an empty document is one section, one block, one page; typing a gives one character', shape.sections === 1 && shape.blocks.length === 1 && shape.blocks[0] === 1 && shape.text === '' && shape.pages === 1 && shape.pb === 0 && typed === 'a', { ...shape, typed })
  await empty.context().close()

  const tall = await openEditor(browser, base, { corpus: 'tall' })
  const tallPages = await tall.evaluate(() => ({ pages: window.__pg.pages(), text: window.__view.state.doc.textContent }))
  const lines = wrap(tallPages.text, 60).length
  const placesLines = tallPages.pages.every((p, i, all) => {
    const next = all[i + 1] ?? { startBlock: 1, startLine: 0 }
    return next.startBlock > p.startBlock || next.startLine > p.startLine
  })
  record('S6 one 70-line block makes at least two pages, each with a line', lines === 70 && tallPages.pages.length >= 2 && placesLines, { lines, pages: tallPages.pages })
  await tall.context().close()
}

if (import.meta.main) {
  const { server, base } = await startServer()
  const browser = await chromium.launch({ headless: true })
  try {
    await smoke(browser, base)
  } finally {
    await browser.close()
    server.stop(true)
  }
  process.exit(failed ? 1 : 0)
}
