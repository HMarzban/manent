// bun harness/ime.ts
// Composition next to a page break inside a block, in Chromium, through the DevTools input-method events: k, ka, kan,
// then the committed kan, at three carets around the first mid-block break of the 120-page document.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { makeCorpus } from '../src/corpus.ts'
import { paginate, PROFILE, wrap } from '../src/engine.ts'
import type { EngineBlock } from '../src/engine.ts'
import { resultsDir, startServer } from './lib.ts'
import { openEditor } from './smoke.ts'

const CHECKS = ['I1', 'I2', 'I3', 'I4'] as const
type Outcome = 'pass' | 'fail' | 'not run'
// Where the caret sits: in the text just before the break widget, in the text just after it, or mid-line after it.
const CARETS = ['end of the line before the break', 'start of the line after the break', 'mid-line after the break'] as const
type Caret = (typeof CARETS)[number]

interface Break { block: number; line: number; offsetInBlock: number; nextLineEnd: number; blockStartOff: number }

function firstBreak(blocks: readonly EngineBlock[]): Break | null {
  const start = paginate(blocks).find((p) => p.startLine > 0)
  if (!start) return null
  const b = blocks[start.startBlock]!
  const starts = wrap(b.text, PROFILE.elements[b.type].width)
  return {
    block: start.startBlock,
    line: start.startLine,
    offsetInBlock: starts[start.startLine]!,
    nextLineEnd: starts[start.startLine + 1] ?? b.text.length,
    blockStartOff: blocks.slice(0, start.startBlock).reduce((n, x) => n + x.text.length, 0),
  }
}

// The block's children as node names, so a text node or a <br> added beside the widget shows.
const childSignature = (page: Page, block: number): Promise<string[]> => page.evaluate((block) => {
  let n = 0
  let pos = -1
  window.__view.state.doc.descendants((node, p) => { if (pos >= 0) return false; if (node.type.name !== 'block') return true; if (n++ === block) pos = p; return false })
  return [...(window.__view.nodeDOM(pos) as HTMLElement).childNodes].map((c) => c.nodeName)
}, block)

async function compose(browser: Browser, base: string, brk: Break, caret: Caret): Promise<Record<string, unknown>> {
  const page = await openEditor(browser, base)
  const offsetInBlock = caret === 'end of the line before the break' || caret === 'start of the line after the break' ? brk.offsetInBlock : Math.floor((brk.offsetInBlock + brk.nextLineEnd) / 2)
  // Put the DOM caret in the text node on the chosen side of the widget and let ProseMirror read it.
  const placed = await page.evaluate(([block, offsetInBlock, side]) => {
    const view = window.__view
    let n = 0
    let pos = -1
    view.state.doc.descendants((node, p) => { if (pos >= 0) return false; if (node.type.name !== 'block') return true; if (n++ === block) pos = p; return false })
    const dom = view.nodeDOM(pos) as HTMLElement
    const widget = dom.querySelector('.pb.mid')!
    view.focus()
    const sel = getSelection()!
    if (side === 'end of the line before the break') sel.collapse(widget.previousSibling!, widget.previousSibling!.textContent!.length)
    else if (side === 'start of the line after the break') sel.collapse(widget.nextSibling!, 0)
    else sel.collapse(widget.nextSibling!, offsetInBlock - widget.previousSibling!.textContent!.length)
    return { pos: pos + 1 + offsetInBlock }
  }, [brk.block, offsetInBlock, caret] as const)
  await page.waitForTimeout(100)
  const before = await page.evaluate(() => ({ text: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size), head: window.__view.state.selection.head, recomputes: window.__pg.stats().recomputes }))
  const signatureBefore = await childSignature(page, brk.block)
  const cdp = await page.context().newCDPSession(page)
  const during: { text: string; composing: boolean; recomputes: number }[] = []
  for (const text of ['k', 'ka', 'kan']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
    await page.waitForTimeout(50)
    during.push({ text, ...await page.evaluate(() => ({ composing: window.__view.composing, recomputes: window.__pg.stats().recomputes })) })
  }
  await cdp.send('Input.insertText', { text: 'kan' })
  await page.waitForTimeout(100)
  const committed = await page.evaluate(() => ({ composing: window.__view.composing, recomputes: window.__pg.stats().recomputes }))
  // The first transaction after the composition: a plain one, when the commit itself did not recompute.
  let next = committed
  if (committed.recomputes === during[during.length - 1]!.recomputes) {
    next = await page.evaluate(() => { window.__view.dispatch(window.__view.state.tr); return { composing: window.__view.composing, recomputes: window.__pg.stats().recomputes } })
  }
  const after = await page.evaluate((block) => {
    let n = 0
    let pos = -1
    const d = window.__view.state.doc
    d.descendants((node, p) => { if (pos >= 0) return false; if (node.type.name !== 'block') return true; if (n++ === block) pos = p; return false })
    const dom = window.__view.nodeDOM(pos) as HTMLElement
    const widgets = [...dom.querySelectorAll('.pb.mid')]
    const blocks: { type: string; text: string }[] = []
    d.descendants((node) => { if (node.type.name !== 'block') return true; blocks.push({ type: String(node.attrs.type), text: node.textContent }); return false })
    return {
      text: d.textBetween(0, d.content.size),
      widgets: widgets.length,
      textInsideWidget: widgets.some((w) => [...w.childNodes].some((c) => c.nodeType === Node.TEXT_NODE) || w.querySelector('br') !== null),
      brBeside: widgets.some((w) => w.previousSibling?.nodeName === 'BR' || w.nextSibling?.nodeName === 'BR'),
      pages: window.__pg.pages(),
      blocks,
    }
  }, brk.block)
  const signatureAfter = await childSignature(page, brk.block)
  await page.context().close()
  const docOff = brk.blockStartOff + offsetInBlock
  const expected = before.text.slice(0, docOff) + 'kan' + before.text.slice(docOff)
  const cold = paginate(after.blocks as EngineBlock[])
  const quiet = during.every((d) => d.composing && d.recomputes === before.recomputes)
  return {
    caret,
    offsetInBlock,
    docOffset: docOff,
    caretPos: placed.pos,
    headBefore: before.head,
    I1: { pass: after.text === expected, insertedAt: firstDifference(before.text, after.text) },
    I2: { pass: after.widgets === 1 && !after.textInsideWidget && !after.brBeside && signatureAfter.join() === signatureBefore.join(), widgets: after.widgets, textInsideWidget: after.textInsideWidget, brBeside: after.brBeside, childrenBefore: signatureBefore, childrenAfter: signatureAfter },
    I3: { pass: quiet && next.recomputes > before.recomputes, recomputesBefore: before.recomputes, during, committed, firstAfter: next, neededAPlainTransaction: next !== committed },
    I4: { pass: Bun.deepEquals(after.pages, cold), pages: after.pages.length, coldPages: cold.length },
  }
}

function firstDifference(a: string, b: string): number {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return i
}

async function run(): Promise<object> {
  const platform = `${process.platform}-${process.arch}`
  const notRun = (reason: string, version: string | null): object => ({ engine: 'chromium', version, platform, launched: version !== null, reason, break: null, carets: [], outcome: Object.fromEntries(CHECKS.map((c) => [c, 'not run'])) })
  let browser: Browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    return notRun(String(e).split('\n')[0]!, null)
  }
  try {
    const brk = firstBreak(makeCorpus(120))
    if (!brk) return notRun('no page starts inside a block', browser.version())
    const { server, base } = await startServer()
    const carets: Record<string, unknown>[] = []
    for (const caret of CARETS) carets.push(await compose(browser, base, brk, caret))
    server.stop(true)
    const outcome = Object.fromEntries(CHECKS.map((c): [string, Outcome] => [c, carets.every((r) => (r[c] as { pass: boolean }).pass) ? 'pass' : 'fail']))
    return { engine: 'chromium', version: browser.version(), platform, launched: true, reason: null, break: brk, carets, outcome }
  } finally {
    await browser.close()
  }
}

if (import.meta.main) {
  writeFileSync(join(resultsDir(), 'ime-chromium.json'), JSON.stringify(await run(), null, 1) + '\n')
}
