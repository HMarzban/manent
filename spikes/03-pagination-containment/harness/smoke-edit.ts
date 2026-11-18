// bun harness/smoke-edit.ts
// Editing at section boundaries in Chromium, without and with the Yjs binding: joins, Enter, paste, the peer's view
// of the result, and what a remote keystroke re-renders. Exits 1 when a check fails.
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { makeCorpus } from '../src/corpus.ts'
import type { EngineBlock } from '../src/engine.ts'
import { startServer } from './lib.ts'
import { openEditor } from './smoke.ts'

// The blocks `__api.paste(pages)` inserts: one more page's corpus without the block that began that page.
const pastedCorpus = (pages: number): EngineBlock[] => makeCorpus(pages + 1).slice(0, -1)

let failed = 0
function record(check: string, pass: boolean, detail: unknown): void {
  if (!pass) failed++
  console.log(`${pass ? 'PASS' : 'FAIL'} ${check} ${JSON.stringify(detail)}`)
}

interface Shape {
  sectionOf: Record<string, number>
  sizes: number[]
  text: string
  caretOff: number
}

// Every block's section by `__sec.sectionOf`, the section sizes, the text with no separators and the caret's offset.
const shape = (page: Page): Promise<Shape> => page.evaluate(() => {
  const ids: string[] = []
  window.__view.state.doc.descendants((n) => { if (n.type.name !== 'block') return true; ids.push(String(n.attrs.id)); return false })
  return {
    sectionOf: Object.fromEntries(ids.map((id) => [id, window.__sec.sectionOf(id)])),
    sizes: window.__sec.sizes(),
    text: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size),
    caretOff: window.__risk.sel().headOff,
  }
})

// No block that existed before changed section: blocks that shared a section still do, blocks of different sections
// still do not (indices may shift when a section is inserted before them). Returns the ids that are gone.
function sectionsKept(before: Shape, after: Shape): { kept: boolean; gone: string[] } {
  const moved = new Map<number, number>()
  const gone: string[] = []
  let kept = true
  for (const [id, was] of Object.entries(before.sectionOf)) {
    const now = after.sectionOf[id]
    if (now === undefined) { gone.push(id); continue }
    if ((moved.get(was) ?? now) !== now) kept = false
    moved.set(was, now)
  }
  return { kept: kept && new Set(moved.values()).size === moved.size, gone }
}

// Puts the caret at `where` of section `k`: the start of its first block, or the end of its last or middle block.
const caretIn = (page: Page, k: number, where: 'first-start' | 'last-end' | 'middle-end'): Promise<void> => page.evaluate(([k, where]) => {
  const view = window.__view
  const d = view.state.doc
  let pos = 0
  for (let i = 0; i < k; i++) pos += d.child(i).nodeSize
  const section = d.child(k)
  const index = where === 'first-start' ? 0 : where === 'last-end' ? section.childCount - 1 : Math.floor(section.childCount / 2)
  let blockPos = pos + 1
  for (let i = 0; i < index; i++) blockPos += section.child(i).nodeSize
  const at = where === 'first-start' ? blockPos + 1 : blockPos + 1 + section.child(index).content.size
  const S = view.state.selection.constructor as unknown as { create(doc: typeof d, pos: number): typeof view.state.selection }
  view.dispatch(view.state.tr.setSelection(S.create(d, at)).scrollIntoView())
  view.focus()
}, [k, where] as const)

const middleSection = (page: Page): Promise<number> => page.evaluate(() => Math.floor(window.__sec.count() / 2))

async function joins(page: Page, key: 'Backspace' | 'Delete', label: string): Promise<void> {
  const k = await middleSection(page)
  await caretIn(page, key === 'Backspace' ? k : k - 1, key === 'Backspace' ? 'first-start' : 'last-end')
  const before = await shape(page)
  await page.keyboard.press(key)
  const after = await shape(page)
  const { kept, gone } = sectionsKept(before, after)
  record(label, kept && gone.length === 1 && after.text === before.text && after.caretOff === before.caretOff, { kept, gone, sections: [before.sizes.length, after.sizes.length], textKept: after.text === before.text })
}

async function enters(page: Page, wrap: number, label: string): Promise<void> {
  const k = await middleSection(page)
  await caretIn(page, k, 'last-end')
  const before = await shape(page)
  for (let i = 0; i < 60; i++) await page.keyboard.press('Enter')
  const after = await shape(page)
  const { kept, gone } = sectionsKept(before, after)
  record(label, before.sizes[k] === wrap && kept && gone.length === 0 && after.sizes.length > before.sizes.length && Math.max(...after.sizes) <= wrap, { kept, gone, sections: [before.sizes.length, after.sizes.length], largest: Math.max(...after.sizes) })
}

async function pastes(page: Page, wrap: number, pages: number, where: 'last-end' | 'middle-end', label: string): Promise<void> {
  const k = await middleSection(page)
  await caretIn(page, k, where)
  const before = await shape(page)
  await page.evaluate((n) => window.__api.paste(n), pages)
  const after = await shape(page)
  const pasted = pastedCorpus(pages)
  const { kept, gone } = sectionsKept(before, after)
  const ordered = after.text === before.text.slice(0, before.caretOff) + pasted.map((b) => b.text).join('') + before.text.slice(before.caretOff)
  const shaped = where === 'last-end'
    ? after.sizes.length === before.sizes.length + Math.ceil(pasted.length / wrap) && Math.max(...after.sizes) <= wrap
    : after.sizes.length === before.sizes.length && after.sizes[k] === before.sizes[k]! + pasted.length
  record(label, kept && gone.length === 0 && ordered && shaped, { kept, gone, ordered, pastedBlocks: pasted.length, sections: [before.sizes.length, after.sizes.length], section: [before.sizes[k], after.sizes[k]] })
}

async function editing(browser: Browser, base: string, y: '0' | '1'): Promise<void> {
  const wrap = 100
  const tag = y === '1' ? ' (y=1)' : ''
  const peerAgrees = async (page: Page, label: string): Promise<void> => {
    if (y !== '1') return
    const texts = await page.evaluate(() => ({ peer: window.__remote.peerText(), view: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size, '\n') }))
    record(`S13 ${label}: the peer's text equals the view's`, texts.peer === texts.view, { peerChars: texts.peer.length, viewChars: texts.view.length })
  }
  const run = async (label: string, check: (page: Page) => Promise<void>): Promise<void> => {
    const page = await openEditor(browser, base, { y })
    await check(page)
    await peerAgrees(page, label)
    await page.context().close()
  }
  await run('S9', (page) => joins(page, 'Backspace', `S9 Backspace at the start of a section joins two paragraphs in one keypress${tag}`))
  await run('S10', (page) => joins(page, 'Delete', `S10 Delete at the end of a section joins two paragraphs in one keypress${tag}`))
  await run('S11', (page) => enters(page, wrap, `S11 Enter at the end of a full section opens a new section and no section outgrows its target${tag}`))
  await run('S12a', (page) => pastes(page, wrap, 50, 'last-end', `S12 (a) a paste at the end of a section goes into new sections${tag}`))
  await run('S12b', (page) => pastes(page, wrap, 1, 'middle-end', `S12 (b) a paste inside a section goes into that section${tag}`))
}

async function remoteKeystroke(browser: Browser, base: string): Promise<void> {
  const page = await openEditor(browser, base, { y: '1' })
  const before = await page.evaluate(() => window.__sec.viewUpdates())
  await page.evaluate(() => window.__remote.remoteTyping(1, 0.5))
  const after = await page.evaluate(() => ({ changed: window.__remote.changedSections(), viewUpdates: window.__sec.viewUpdates() }))
  record('S8 a remote keystroke changes one section node and updates one section view', after.changed === 1 && after.viewUpdates === before + 1, { changedSections: after.changed, viewUpdates: [before, after.viewUpdates] })
  await page.context().close()
}

if (import.meta.main) {
  const { server, base } = await startServer()
  const browser = await chromium.launch({ headless: true })
  try {
    await editing(browser, base, '0')
    await remoteKeystroke(browser, base)
    await editing(browser, base, '1')
  } finally {
    await browser.close()
    server.stop(true)
  }
  process.exit(failed ? 1 : 0)
}
