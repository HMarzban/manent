// bun harness/risk.ts <chromium|webkit|firefox> [--zoom <percent>]
// bun harness/risk.ts --summarise [--dir <dir>]
// Caret, selection, find, scrolling and editing at section boundaries, on a flat document, on sections with
// content-visibility, and on sections with pagination, at 1,000 pages in one browser. Each check's verdict compares
// the two section builds with the flat one.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'
import { makeCorpus } from '../src/corpus.ts'
import { paginate } from '../src/engine.ts'
import type { EngineBlock } from '../src/engine.ts'
import { resultsDir, startServer } from './lib.ts'
import { openEditor } from './smoke.ts'

const ENGINES = { chromium, firefox, webkit }
type Engine = keyof typeof ENGINES
const BUILD_NAMES = ['flat', 'sec', 'secpg'] as const
type Build = (typeof BUILD_NAMES)[number]
const BUILDS: Record<Build, Record<string, string>> = {
  flat: { pages: '1000', wrap: '0', pg: '0' },
  sec: { pages: '1000', wrap: '100', cv: 'auto', pg: '0' },
  secpg: { pages: '1000', wrap: '100', cv: 'auto', pg: '1' },
}
const GROUP = 100
const MAC = process.platform === 'darwin'
// The prototype pressed Meta, which does nothing on Linux and Windows; these do what a person there would press.
const KEYS = {
  docEnd: MAC ? 'ControlOrMeta+ArrowDown' : 'Control+End',
  docStart: MAC ? 'ControlOrMeta+ArrowUp' : 'Control+Home',
  selectAll: 'ControlOrMeta+a',
}
const CHECK_TIMEOUT_MS = 180_000
const EVALUATE_TIMEOUT_MS = 60_000

type Verdict = 'same as flat' | 'differs' | 'reported' | 'not run'
type Checks = Record<string, Partial<Record<Build, unknown>>>

const HELPERS = `(() => {
  const view = window.__view
  const frame = () => new Promise(r => requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(performance.now()); ch.port2.postMessage(0) }))
  const secs = () => [...view.dom.querySelectorAll(':scope > .section')]
  const vis = e => { try { return e.checkVisibility({ contentVisibilityAuto: true }) } catch (err) { return null } }
  const colX = () => view.dom.querySelector('p.el').getBoundingClientRect().left + 20 // inside the text column
  window.__h = {
    frame,
    async frames (n) { for (let i = 0; i < n; i++) await frame() },
    async timed (fn) { await new Promise(r => setTimeout(r, 80)); const s = performance.now(); fn(); return (await frame()) - s },
    rendered () { const s = secs(); if (!s.length) return null; let n = 0; for (const e of s) { const v = vis(e.firstElementChild); if (v === null) return 'checkVisibility unsupported'; if (v) n++ } return n + '/' + s.length },
    secSkipped (i) { const s = secs()[i]; return s ? vis(s.firstElementChild) === false : null },
    st () { const e = document.scrollingElement; return { top: Math.round(e.scrollTop), height: e.scrollHeight, max: e.scrollHeight - innerHeight } },
    colX,
    // fraction of the document text that sits at a fixed point near the top of the viewport
    topFraction () { const p = view.posAtCoords({ left: colX(), top: 120 }); return p ? +(window.__risk.textOffsetOf(p.pos) / window.__risk.textLen()).toFixed(4) : null },
    // follow one block that is on screen now and report how far it moves on screen over the next frames
    async watchAnchor (nFrames) { const el = document.elementFromPoint(colX(), 300)?.closest('p.el'); if (!el) return null; const y0 = el.getBoundingClientRect().top; let maxDev = 0; for (let i = 0; i < nFrames; i++) { await frame(); maxDev = Math.max(maxDev, Math.abs(el.getBoundingClientRect().top - y0)) } return +maxDev.toFixed(1) },
    // the document position just before block number index, counting blocks through sections
    blockPos (index) { let n = 0, found = -1; view.state.doc.descendants((node, pos) => { if (found >= 0) return false; if (node.type.name !== 'block') return true; if (n++ === index) found = pos; return false }); return found },
    caretAt (pos, head) { const S = view.state.selection.constructor; view.dispatch(view.state.tr.setSelection(S.create(view.state.doc, pos, head ?? pos)).scrollIntoView()); view.focus() }
  }
})()`

/** Page-side helpers after `HELPERS` ran. */
interface Helpers {
  frame(): Promise<number>
  frames(n: number): Promise<void>
  timed(fn: () => void): Promise<number>
  rendered(): string | null
  secSkipped(i: number): boolean | null
  st(): { top: number; height: number; max: number }
  colX(): number
  topFraction(): number | null
  watchAnchor(nFrames: number): Promise<number | null>
  blockPos(index: number): number
  caretAt(pos: number, head?: number): void
}
declare global {
  interface Window { __h: Helpers }
}

// page.evaluate with a deadline, so that a call that never returns names itself instead of hanging the run
function R<T, A>(page: Page, fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
function R<T>(page: Page, fn: () => T | Promise<T>): Promise<T>
function R<T, A>(page: Page, fn: (arg?: A) => T | Promise<T>, arg?: A): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    page.evaluate(fn, arg as A),
    new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`evaluate did not return in ${EVALUATE_TIMEOUT_MS / 1000} s: ${String(fn).replace(/\s+/g, ' ').slice(0, 140)}`)), EVALUATE_TIMEOUT_MS) }),
  ]).finally(() => clearTimeout(t))
}

const settle = async (page: Page, ms = 300): Promise<void> => { await R(page, () => window.__h.frames(2)); await page.waitForTimeout(ms); await R(page, () => window.__h.frames(2)) }
const press = async (page: Page, key: string, n: number, delay = 8): Promise<void> => { for (let i = 0; i < n; i++) { await page.keyboard.press(key, { delay: 0 }); if (delay) await page.waitForTimeout(delay) } }
const headOff = (page: Page): Promise<number> => R(page, () => window.__risk.sel().headOff)

// Text offsets of the corpus blocks: where block i starts, with no separators, as `__risk.textOffsetOf` counts.
function blockOffsets(blocks: readonly EngineBlock[]): number[] {
  const out = [0]
  for (const b of blocks) out.push(out[out.length - 1]! + b.text.length)
  return out
}

interface Landmarks {
  /** Text offset where each corpus block starts (one entry more than blocks), as `__risk.textOffsetOf` counts. */
  offs: number[]
  /** The section boundary at 40 % of the document: its section index and block index. */
  boundary: { section: number; block: number }
  /** A page that starts with the first block of a section, nearest the middle; null when the corpus has none. */
  sectionPage: number | null
  /** A block split across two pages, nearest the middle. */
  splitBlock: number
  /** The oversized section of the `over=4` document: its first block and its block count. */
  oversized: { first: number; blocks: number }
}

function corpusLandmarks(): Omit<Landmarks, 'oversized'> {
  const blocks = makeCorpus(Number(BUILDS.sec.pages))
  const pages = paginate(blocks)
  const offs = blockOffsets(blocks)
  const middle = blocks.length / 2
  const nearMiddle = (list: readonly { startBlock: number }[]): number | null => list.toSorted((a, b) => Math.abs(a.startBlock - middle) - Math.abs(b.startBlock - middle))[0]?.startBlock ?? null
  const section = Math.floor(Math.ceil(blocks.length / GROUP) * 0.4)
  return {
    offs,
    boundary: { section, block: section * GROUP },
    sectionPage: nearMiddle(pages.filter((p) => p.startLine === 0 && p.startBlock > 0 && p.startBlock % GROUP === 0)),
    splitBlock: nearMiddle(pages.filter((p) => p.startLine > 0))!,
  }
}

// The oversized section as the page builds it: the section holding the document's middle position.
async function findOversized(browser: Browser, base: string): Promise<{ first: number; blocks: number }> {
  const page = await openEditor(browser, base, { ...BUILDS.sec, over: '4' })
  const found = await page.evaluate(() => {
    const d = window.__view.state.doc
    const index = d.resolve(Math.floor(d.content.size / 2)).index(0)
    let first = 0
    for (let i = 0; i < index; i++) first += d.child(i).childCount
    return { first, blocks: d.child(index).childCount }
  })
  await Promise.race([page.context().close(), new Promise((r) => setTimeout(r, 5000))])
  return found
}

// B1: start 4 characters before a boundary, 10 × ArrowRight then 10 × ArrowLeft; offsets relative to the boundary
async function arrowsAcross(page: Page, boundaryOff: number): Promise<unknown> {
  await R(page, (off) => window.__risk.setOff(off, true), boundaryOff - 4)
  await settle(page)
  const right: number[] = []
  for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(15); right.push((await headOff(page)) - boundaryOff) }
  const left: number[] = []
  for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(15); left.push((await headOff(page)) - boundaryOff) }
  return { startOff: boundaryOff - 4, offsets: { right, left } }
}

// B2: 400 × ArrowDown from `start`, then 400 × ArrowUp
async function arrowsDownUp(page: Page, start: number, boundaryOff: number): Promise<unknown> {
  await R(page, (off) => window.__risk.setOff(off, true), start); await settle(page)
  await press(page, 'ArrowDown', 400); await settle(page, 200)
  const down = await R(page, () => ({ off: window.__risk.sel().headOff, caret: window.__risk.caret() }))
  await press(page, 'ArrowUp', 400); await settle(page, 200)
  const up = await R(page, () => ({ off: window.__risk.sel().headOff, caret: window.__risk.caret() }))
  const inView = (c: unknown): boolean | null => (c && typeof c === 'object' && 'inViewport' in c ? Boolean(c.inViewport) : null)
  return { startOff: start, offsets: { afterDown: down.off - start, afterUp: up.off - start }, crossedBoundary: down.off > boundaryOff, caretInViewportAfterDown: inView(down.caret), caretInViewportAfterUp: inView(up.caret) }
}

const blocks: Record<string, (page: Page, build: Build, rec: (check: string, value: unknown) => void, marks: Landmarks) => Promise<void>> = {
  // A. support and initial state
  async A(page, _build, rec) {
    rec('A_support', await R(page, () => ({ cssSupports: CSS.supports('content-visibility', 'auto'), sectionsRendered: window.__h.rendered(), st: window.__h.st(), domNodes: document.getElementsByTagName('*').length, offsets: { anchorOff: window.__risk.sel().anchorOff, headOff: window.__risk.sel().headOff } })))
  },

  // B. caret movement with the arrow keys across a section boundary
  async B(page, _build, rec, marks) {
    const b = { k: marks.boundary.section, boundaryOff: marks.offs[marks.boundary.block]!, textLen: marks.offs[marks.offs.length - 1]! }
    rec('B1_arrow_right_left_across_boundary', await arrowsAcross(page, b.boundaryOff))
    // half a section before the boundary, so that 400 lines down cross it
    rec('B2_arrow_down_up_400', await arrowsDownUp(page, marks.offs[marks.boundary.block - GROUP / 2]! + 10, b.boundaryOff))
    // B3: caret parked 4 characters from a boundary, window scrolled far away so that the neighbouring section is
    // skipped, then keys; offsets relative to the boundary, per key
    const offscreen = async (startDelta: number, keys: string[]): Promise<unknown> => {
      await R(page, (off) => window.__risk.setOff(off, true), b.boundaryOff + startDelta); await settle(page)
      await R(page, () => { document.scrollingElement!.scrollTop = 0 }); await settle(page, 400)
      const before = await R(page, (k) => ({ nextSkipped: window.__h.secSkipped(k), prevSkipped: window.__h.secSkipped(k - 1), rendered: window.__h.rendered() }), b.k)
      const log: number[] = []
      for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(40); log.push((await headOff(page)) - b.boundaryOff) }
      await settle(page, 300)
      const after = await R(page, () => ({ caret: window.__risk.caret(), frac: +(window.__risk.sel().headOff / window.__risk.textLen()).toFixed(4) }))
      return { before, keys, offsets: log, endsAtDocFraction: after.frac, caretAfter: after.caret }
    }
    rec('B3_arrowdown_x3_offscreen_caret_next_section_skipped', await offscreen(-4, ['ArrowDown', 'ArrowDown', 'ArrowDown']))
    rec('B3_arrowup_x3_offscreen_caret_prev_section_skipped', await offscreen(4, ['ArrowUp', 'ArrowUp', 'ArrowUp']))
    rec('B3_shift_arrowdown_x3_offscreen_caret', await offscreen(-4, ['Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown']))
    rec('B3_arrowright_x8_offscreen_caret_next_section_skipped', await offscreen(-4, Array<string>(8).fill('ArrowRight')))
    // B4: document end and start keys, with and without Shift, from a visible caret in the middle of the document
    const edge = async (key: string): Promise<{ anchorOff: number; headOff: number; caretInViewport: unknown; pxFromBottom: number; scrollTop: number }> => {
      await page.keyboard.press(key); await settle(page, 400)
      return R(page, () => { const s = window.__risk.sel(); const st = window.__h.st(); const c = window.__risk.caret(); return { anchorOff: s.anchorOff, headOff: s.headOff, caretInViewport: 'inViewport' in c ? c.inViewport : null, pxFromBottom: st.max - st.top, scrollTop: st.top } })
    }
    const mid = b.boundaryOff - 4
    await R(page, (off) => window.__risk.setOff(off, true), mid); await settle(page, 300)
    const end1 = await edge(KEYS.docEnd); const end2 = await edge(KEYS.docEnd); const start1 = await edge(KEYS.docStart); const start2 = await edge(KEYS.docStart)
    await R(page, (off) => window.__risk.setOff(off, true), mid); await settle(page, 300)
    const shiftEnd = await edge(`Shift+${KEYS.docEnd}`)
    await R(page, (off) => window.__risk.setOff(off, true), mid); await settle(page, 300)
    const shiftStart = await edge(`Shift+${KEYS.docStart}`)
    const offsets = [end1, end2, start1, start2, shiftEnd, shiftStart].map((e) => [e.anchorOff, e.headOff])
    rec('B4_doc_end_and_start_keys', { keys: { end: KEYS.docEnd, start: KEYS.docStart, shift: 'Shift' }, textLen: b.textLen, offsets, endCaretInViewport: end1.caretInViewport, endPxFromBottom: end1.pxFromBottom, startScrollTop: start1.scrollTop, startCaretInViewport: start1.caretInViewport })
  },

  // C. selections that span sections
  async C(page, _build, rec, marks) {
    const b = { boundaryOff: marks.offs[marks.boundary.block]! }
    // C1: caret in one section, about 40 sections of wheel scrolling, shift-click on the text found there
    const anchor = b.boundaryOff + 50
    await R(page, (off) => window.__risk.setOff(off, true), anchor); await settle(page)
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 6500); await page.waitForTimeout(40) }
    await settle(page, 300)
    const target = await R(page, () => { const x = window.__h.colX() + 50; const p = window.__view.posAtCoords({ left: x, top: 400 }); return { x, y: 400, off: p ? window.__risk.textOffsetOf(p.pos) : null } })
    await page.keyboard.down('Shift'); await page.mouse.click(target.x, target.y); await page.keyboard.up('Shift'); await settle(page, 200)
    const s1 = await R(page, () => ({ ...window.__risk.sel(), rendered: window.__h.rendered(), domText: getSelection()!.toString().length }))
    rec('C1_shift_click_across_sections', { offsets: { anchorOff: s1.anchorOff, headFromTarget: target.off === null ? null : s1.headOff - target.off }, selectedChars: Math.abs(s1.headOff - s1.anchorOff), domSelectionChars: s1.domText, sectionsRendered: s1.rendered })
    // C2: a selection across most of the document, then Shift+ArrowRight × 20; cost of each step
    await R(page, () => { const r = window.__risk; const len = r.textLen(); window.__h.caretAt(r.posAtTextOffset(Math.floor(len * 0.05)), r.posAtTextOffset(Math.floor(len * 0.9))) })
    await settle(page, 500)
    const big = await R(page, () => ({ rendered: window.__h.rendered(), sel: window.__risk.sel() }))
    await R(page, () => { const w = window as unknown as { __ks: number[] }; w.__ks = []; document.addEventListener('keydown', () => { const k = performance.now(); requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => w.__ks.push(performance.now() - k); ch.port2.postMessage(0) }) }, true) })
    for (let i = 0; i < 20; i++) { await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(60) }
    const after = await R(page, () => ({ sel: window.__risk.sel(), ks: (window as unknown as { __ks: number[] }).__ks.toSorted((a, b) => a - b) }))
    rec('C2_selection_over_85pct_of_doc', { offsets: { anchorOff: after.sel.anchorOff, headOff: after.sel.headOff }, before: { anchorOff: big.sel.anchorOff, headOff: big.sel.headOff }, sectionsRendered: big.rendered, shiftArrowKeyToFrameMs: { p50: +after.ks[after.ks.length >> 1]!.toFixed(1), max: +after.ks[after.ks.length - 1]!.toFixed(1), n: after.ks.length } })
    // C3: select all from the keyboard, then collapse again
    await R(page, (off) => window.__risk.setOff(off, true), anchor); await settle(page)
    await R(page, () => { (window as unknown as { __ks: number[] }).__ks.length = 0 })
    await page.keyboard.press(KEYS.selectAll); await settle(page, 500)
    const all = await R(page, () => ({ sel: window.__risk.sel(), rendered: window.__h.rendered(), keyToFrame: (window as unknown as { __ks: number[] }).__ks[0] ?? null, domText: getSelection()!.toString().length, textLen: window.__risk.textLen() }))
    await page.keyboard.press('ArrowLeft'); await settle(page, 500)
    const coll = await R(page, () => ({ rendered: window.__h.rendered() }))
    rec('C3_select_all', { key: KEYS.selectAll, pmSelection: all.sel.json, coversAll: all.sel.anchorOff === 0 && all.sel.headOff === all.textLen, domSelectionChars: all.domText, sectionsRenderedWhileSelected: all.rendered, selectAllKeyToFrameMs: all.keyToFrame === null ? null : +all.keyToFrame.toFixed(1), sectionsRenderedAfterCollapse: coll.rendered })
  },

  // D. find in page, with window.find() standing in for the browser's find bar
  async D(page, _build, rec) {
    rec('D_window_find_in_far_section', await R(page, async (marker) => {
      const r = window.__risk; const h = window.__h; const off = Math.floor(r.textLen() * 0.8)
      r.setOff(5, false); await h.frames(2)
      const dt = await h.timed(() => r.insertRemote(off, marker))
      const stBefore = h.st()
      let found: boolean | null = null; let threw: string | null = null
      try { found = (window as unknown as { find(s: string): boolean }).find(marker) } catch (e) { threw = String(e) }
      await h.frames(3); await new Promise((res) => setTimeout(res, 300)); await h.frames(2)
      const sel = getSelection()!; const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null
      const pm = r.sel()
      return { programmaticInsertToFrameMs: +dt.toFixed(1), found, threw, selectedText: sel.toString(), matchInViewport: !!rect && rect.top >= 0 && rect.bottom <= innerHeight && rect.height > 0, scrollBefore: stBefore.top, scrollAfter: h.st().top, pmSelectionFollowed: Math.abs(pm.headOff - pm.anchorOff) === marker.length, offsets: { anchorOff: pm.anchorOff, headOff: pm.headOff } }
    }, 'XYZZYQUUXMARKER'))
  },

  // E. scroll position and scrollbar
  async E(page, _build, rec) {
    const st0 = await R(page, () => window.__h.st())
    await R(page, () => { const e = document.scrollingElement!; e.scrollTop = (e.scrollHeight - innerHeight) / 2 })
    await R(page, () => window.__h.frames(1))
    const dev = await R(page, () => window.__h.watchAnchor(40))
    await settle(page, 300)
    const mid = await R(page, () => ({ st: window.__h.st(), frac: window.__h.topFraction(), rendered: window.__h.rendered() }))
    rec('E1_scrollbar_to_50pct_fresh', { heightBefore: st0.height, heightAfter: mid.st.height, textFractionAtTop: mid.frac, thumbFractionAfter: +(mid.st.top / mid.st.max).toFixed(4), onScreenShiftPxOver40Frames: dev })
    await R(page, () => { document.scrollingElement!.scrollTop = 0 }); await settle(page, 200)
    rec('E2_scroll_through_whole_doc', await R(page, async () => {
      const e = document.scrollingElement!; const h = window.__h
      let reversals = 0, maxBack = 0, maxHeightStep = 0, prevThumb = 0, prevH = e.scrollHeight, steps = 0, anchorAdj = 0
      const hStart = e.scrollHeight
      while (e.scrollTop < e.scrollHeight - innerHeight - 2 && steps < 4000) {
        const want = e.scrollTop + 700
        e.scrollTop = want; await h.frame(); steps++
        if (Math.abs(e.scrollTop - Math.min(want, e.scrollHeight - innerHeight)) > 2) anchorAdj++
        const thumb = e.scrollTop / (e.scrollHeight - innerHeight)
        if (thumb < prevThumb - 1e-9) { reversals++; maxBack = Math.max(maxBack, prevThumb - thumb) }
        maxHeightStep = Math.max(maxHeightStep, Math.abs(e.scrollHeight - prevH)); prevThumb = thumb; prevH = e.scrollHeight
      }
      return { steps, heightStart: hStart, heightEnd: e.scrollHeight, maxHeightChangeInOneStepPx: maxHeightStep, thumbMovedBackwardsTimes: reversals, largestBackwardThumbMovePct: +(maxBack * 100).toFixed(3), stepsWhereScrollTopWasAdjusted: anchorAdj, rendered: h.rendered() }
    }))
    await R(page, () => { const e = document.scrollingElement!; e.scrollTop = (e.scrollHeight - innerHeight) / 2 }); await settle(page, 300)
    rec('E3_scrollbar_to_50pct_after_full_scroll', await R(page, () => ({ textFractionAtTop: window.__h.topFraction(), height: window.__h.st().height })))
  },

  // F. scrollIntoView to positions far off screen
  async F(page, _build, rec) {
    await R(page, () => { window.__view.focus() }); await settle(page, 100)
    const one = (frac: number): Promise<unknown> => R(page, async (frac) => {
      const rk = window.__risk; const h = window.__h
      const off = Math.floor(rk.textLen() * frac)
      const dt = await h.timed(() => rk.setOff(off, true))
      const c1 = rk.caret(); await h.frames(5); const c2 = rk.caret(); await new Promise((r) => setTimeout(r, 500)); await h.frames(2); const c3 = rk.caret()
      const inView = (c: typeof c1): boolean | null => ('inViewport' in c ? c.inViewport : null)
      return { toFrameMs: +dt.toFixed(1), inViewportAt1Frame: inView(c1), inViewportAt6Frames: inView(c2), inViewportAt500ms: inView(c3), headOffOk: rk.sel().headOff === off }
    }, frac)
    const res: Record<string, unknown> = { pmScrollIntoView_to70pct: await one(0.7), pmScrollIntoView_backTo20pct: await one(0.2), pmScrollIntoView_to95pct: await one(0.95) }
    res.domScrollIntoView_blockAt45pct = await R(page, async () => {
      const v = window.__view; const rk = window.__risk; const h = window.__h
      const pos = rk.posAtTextOffset(Math.floor(rk.textLen() * 0.45)); const el = (v.domAtPos(pos).node.parentElement as HTMLElement).closest('p.el')!
      el.scrollIntoView({ block: 'start' }); await h.frame(); const t1 = el.getBoundingClientRect().top; await h.frames(5); const t2 = el.getBoundingClientRect().top; await new Promise((r) => setTimeout(r, 500)); await h.frames(2); const t3 = el.getBoundingClientRect().top
      return { blockTopAfter1Frame: Math.round(t1), after6Frames: Math.round(t2), after500ms: Math.round(t3) }
    })
    rec('F_scroll_into_view_offscreen', res)
  },

  // G. a programmatic edit far above the viewport: does what is on screen move?
  async G(page, _build, rec) {
    await R(page, async () => { const rk = window.__risk; rk.setOff(Math.floor(rk.textLen() * 0.6), true); await window.__h.frames(3) }); await settle(page, 300)
    rec('G_remote_edit_above_viewport', await R(page, async () => {
      const rk = window.__risk; const h = window.__h
      const el = document.elementFromPoint(h.colX(), 300)!.closest('p.el')!; const y0 = el.getBoundingClientRect().top; const h0 = h.st().height
      const txt = ' an edit by code that adds a few lines of text to a block far above the viewport'.repeat(8)
      const dt = await h.timed(() => rk.insertRemote(Math.floor(rk.textLen() * 0.2), txt))
      await h.frames(3)
      return { toFrameMs: +dt.toFixed(1), onScreenBlockMovedPx: Math.round(el.getBoundingClientRect().top - y0), docHeightChangePx: h.st().height - h0 }
    }))
  },

  // H. the editing checks of the editing smoke, in this engine
  async H(page, build, rec) {
    if (build === 'flat') return
    rec('H1_backspace_at_section_start', await joinAt(page, 'Backspace'))
    await page.reload(); await page.waitForFunction(() => window.__view); await page.evaluate(HELPERS)
    rec('H2_delete_at_section_end', await joinAt(page, 'Delete'))
    await page.reload(); await page.waitForFunction(() => window.__view); await page.evaluate(HELPERS)
    rec('H3_enter_x60_at_end_of_full_section', await enterAtEnd(page))
    await page.reload(); await page.waitForFunction(() => window.__view); await page.evaluate(HELPERS)
    rec('H4a_paste_at_section_end', await pasteAt(page, 50, 'last-end'))
    await page.reload(); await page.waitForFunction(() => window.__view); await page.evaluate(HELPERS)
    rec('H4b_paste_inside_section', await pasteAt(page, 1, 'middle-end'))
  },

  // K. page breaks on a section boundary, an oversized section, typing on both sides of a mid-block break
  async K(page, _build, rec, marks) {
    if (marks.sectionPage !== null) {
      const block = marks.sectionPage
      // the caret at the end of the block before: its last line, just above the page break
      await R(page, (b) => { const p = window.__h.blockPos(b - 1); window.__h.caretAt(p + 1 + window.__view.state.doc.nodeAt(p)!.content.size) }, block); await settle(page)
      const start = await headOff(page)
      await page.keyboard.press('ArrowDown'); await settle(page, 100)
      const down = await headOff(page)
      await page.keyboard.press('ArrowUp'); await settle(page, 100)
      const up = await headOff(page)
      await page.keyboard.press('Shift+ArrowDown'); await settle(page, 100)
      const shift = await R(page, () => { const s = window.__risk.sel(); return { anchorOff: s.anchorOff, headOff: s.headOff } })
      const after = marks.offs[block]!
      rec('K1_arrows_across_a_page_break_on_a_section_boundary', { block, offsets: { start, down, up, shift }, landedAfterBreak: down >= after, returned: up === start, selectedOneLine: shift.anchorOff === start && shift.headOff >= after })
    }
    // K3: one character typed at the start and at the end of a block split across pages
    const typed = async (where: 'start' | 'end'): Promise<unknown> => {
      const before = await R(page, ([block, where]) => { const p = window.__h.blockPos(block); const node = window.__view.state.doc.nodeAt(p)!; window.__h.caretAt(where === 'start' ? p + 1 : p + 1 + node.content.size); return { off: window.__risk.sel().headOff, text: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size) } }, [marks.splitBlock, where] as const)
      await settle(page, 100)
      await page.keyboard.type('q'); await settle(page, 100)
      const after = await R(page, (block) => { const p = window.__h.blockPos(block); const dom = window.__view.nodeDOM(p) as HTMLElement; return { off: window.__risk.sel().headOff, text: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size), widgets: dom.querySelectorAll('.pb.mid').length } }, marks.splitBlock)
      let at = 0
      while (at < before.text.length && before.text[at] === after.text[at]) at++
      return { offsets: { caretBefore: before.off, typedAt: at, caretAfter: after.off }, landedAtCaret: at === before.off && after.text === before.text.slice(0, at) + 'q' + before.text.slice(at), midWidgetsInBlock: after.widgets }
    }
    rec('K3_type_at_both_ends_of_a_split_block', { block: marks.splitBlock, start: await typed('start'), end: await typed('end') })
  },

  // K2: B1 and B2 inside a section four times its target, and across its first boundary (an over=4 document)
  async K2(page, _build, rec, marks) {
    const { first, blocks: size } = marks.oversized
    const across = marks.offs[first]!
    const inside = marks.offs[first + size / 2]!
    rec('K2_across_oversized_section_B1', await arrowsAcross(page, across))
    rec('K2_inside_oversized_section_B1', await arrowsAcross(page, inside))
    rec('K2_across_oversized_section_B2', await arrowsDownUp(page, marks.offs[first - GROUP / 2]! + 10, across))
    rec('K2_inside_oversized_section_B2', await arrowsDownUp(page, marks.offs[first + size / 2 - GROUP / 2]! + 10, inside))
  },
}

// The editing smoke's S9–S12 at this document size: no block changes section, one join, the paste rule.
interface Shape { sectionOf: Record<string, number>; sizes: number[]; text: string; caretOff: number }
const shape = (page: Page): Promise<Shape> => R(page, () => {
  const sectionOf: Record<string, number> = {}
  const sizes: number[] = []
  window.__view.state.doc.forEach((s, _, i) => { sizes.push(s.childCount); s.forEach((b) => { sectionOf[String(b.attrs.id)] = i }) })
  return { sectionOf, sizes, text: window.__view.state.doc.textBetween(0, window.__view.state.doc.content.size), caretOff: window.__risk.sel().headOff }
})
function sectionsKept(before: Shape, after: Shape): { kept: boolean; gone: number } {
  const moved = new Map<number, number>()
  let gone = 0
  let kept = true
  for (const [id, was] of Object.entries(before.sectionOf)) {
    const now = after.sectionOf[id]
    if (now === undefined) { gone++; continue }
    if ((moved.get(was) ?? now) !== now) kept = false
    moved.set(was, now)
  }
  return { kept: kept && new Set(moved.values()).size === moved.size, gone }
}
const caretIn = (page: Page, k: number, where: 'first-start' | 'last-end' | 'middle-end'): Promise<void> => R(page, ([k, where]) => {
  const d = window.__view.state.doc
  let pos = 0
  for (let i = 0; i < k; i++) pos += d.child(i).nodeSize
  const section = d.child(k)
  const index = where === 'first-start' ? 0 : where === 'last-end' ? section.childCount - 1 : Math.floor(section.childCount / 2)
  let blockPos = pos + 1
  for (let i = 0; i < index; i++) blockPos += section.child(i).nodeSize
  window.__h.caretAt(where === 'first-start' ? blockPos + 1 : blockPos + 1 + section.child(index).content.size)
}, [k, where] as const)
const middleSection = (page: Page): Promise<number> => R(page, () => Math.floor(window.__sec.count() / 2))
async function joinAt(page: Page, key: 'Backspace' | 'Delete'): Promise<unknown> {
  const k = await middleSection(page)
  await caretIn(page, key === 'Backspace' ? k : k - 1, key === 'Backspace' ? 'first-start' : 'last-end')
  const before = await shape(page)
  await page.keyboard.press(key); await settle(page, 100)
  const after = await shape(page)
  const { kept, gone } = sectionsKept(before, after)
  return { holds: kept && gone === 1 && after.text === before.text && after.caretOff === before.caretOff, kept, gone }
}
async function enterAtEnd(page: Page): Promise<unknown> {
  const k = await middleSection(page)
  await caretIn(page, k, 'last-end')
  const before = await shape(page)
  for (let i = 0; i < 60; i++) await page.keyboard.press('Enter')
  await settle(page, 100)
  const after = await shape(page)
  const { kept, gone } = sectionsKept(before, after)
  return { holds: before.sizes[k] === GROUP && kept && gone === 0 && after.sizes.length > before.sizes.length && Math.max(...after.sizes) <= GROUP, kept, gone, largest: Math.max(...after.sizes) }
}
async function pasteAt(page: Page, pages: number, where: 'last-end' | 'middle-end'): Promise<unknown> {
  const k = await middleSection(page)
  await caretIn(page, k, where)
  const before = await shape(page)
  await R(page, (n) => window.__api.paste(n), pages); await settle(page, 100)
  const after = await shape(page)
  const pasted = makeCorpus(pages + 1).slice(0, -1)
  const { kept, gone } = sectionsKept(before, after)
  const ordered = after.text === before.text.slice(0, before.caretOff) + pasted.map((b) => b.text).join('') + before.text.slice(before.caretOff)
  const shaped = where === 'last-end'
    ? after.sizes.length === before.sizes.length + Math.ceil(pasted.length / GROUP) && Math.max(...after.sizes) <= GROUP
    : after.sizes.length === before.sizes.length && after.sizes[k] === before.sizes[k]! + pasted.length
  return { holds: kept && gone === 0 && ordered && shaped, kept, gone, ordered, shaped }
}

const BLOCK_CHECKS: Record<string, readonly string[]> = {
  A: ['A_support'],
  B: ['B1_arrow_right_left_across_boundary', 'B2_arrow_down_up_400', 'B3_arrowdown_x3_offscreen_caret_next_section_skipped', 'B3_arrowup_x3_offscreen_caret_prev_section_skipped', 'B3_shift_arrowdown_x3_offscreen_caret', 'B3_arrowright_x8_offscreen_caret_next_section_skipped', 'B4_doc_end_and_start_keys'],
  C: ['C1_shift_click_across_sections', 'C2_selection_over_85pct_of_doc', 'C3_select_all'],
  D: ['D_window_find_in_far_section'],
  E: ['E1_scrollbar_to_50pct_fresh', 'E2_scroll_through_whole_doc', 'E3_scrollbar_to_50pct_after_full_scroll'],
  F: ['F_scroll_into_view_offscreen'],
  G: ['G_remote_edit_above_viewport'],
  H: ['H1_backspace_at_section_start', 'H2_delete_at_section_end', 'H3_enter_x60_at_end_of_full_section', 'H4a_paste_at_section_end', 'H4b_paste_inside_section'],
  K: ['K1_arrows_across_a_page_break_on_a_section_boundary', 'K3_type_at_both_ends_of_a_split_block'],
  K2: ['K2_across_oversized_section_B1', 'K2_inside_oversized_section_B1', 'K2_across_oversized_section_B2', 'K2_inside_oversized_section_B2'],
}
// Block K2 runs on its own document, with a section four times its target in the middle.
const EXTRA_PARAMS: Record<string, Record<string, string>> = { K2: { over: '4' } }
const ZOOM_BLOCKS = ['B', 'C', 'K', 'K2']

const field = (v: unknown, key: string): unknown => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined)
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// The verdict rules: offsets equal flat's for caret, selection, find and K; a scroll statistic within its limit; the
// editing assertions hold; everything else is reported.
function verdictFor(check: string, rec: Partial<Record<Build, unknown>> | undefined): Verdict {
  if (!rec) return 'not run'
  const { flat, sec, secpg } = rec
  const sections = [sec, secpg]
  if (check.startsWith('H')) return sec === undefined || secpg === undefined ? 'not run' : sections.every((v) => field(v, 'holds') === true) ? 'same as flat' : 'differs'
  if (flat === undefined || sec === undefined || secpg === undefined) return 'not run'
  if (check.startsWith('C3')) return 'reported'
  if (check.startsWith('E1') || check.startsWith('E3')) {
    const f = field(flat, 'textFractionAtTop')
    return sections.every((v) => typeof f === 'number' && typeof field(v, 'textFractionAtTop') === 'number' && Math.abs((field(v, 'textFractionAtTop') as number) - f) <= 0.01) ? 'same as flat' : 'differs'
  }
  if (check.startsWith('E2')) return sections.every((v) => field(v, 'thumbMovedBackwardsTimes') === 0 && field(v, 'maxHeightChangeInOneStepPx') === 0) ? 'same as flat' : 'differs'
  if (check.startsWith('F')) return sections.every((v) => ['pmScrollIntoView_to70pct', 'pmScrollIntoView_backTo20pct', 'pmScrollIntoView_to95pct'].every((k) => field(field(v, k), 'inViewportAt500ms') === true && field(field(v, k), 'headOffOk') === true)) ? 'same as flat' : 'differs'
  if (check.startsWith('G')) return sections.every((v) => field(v, 'onScreenBlockMovedPx') === 0) ? 'same as flat' : 'differs'
  if (check.startsWith('D')) return sections.every((v) => same(field(v, 'offsets'), field(flat, 'offsets')) && field(v, 'found') === field(flat, 'found') && field(v, 'matchInViewport') === field(flat, 'matchInViewport')) ? 'same as flat' : 'differs'
  if (check.startsWith('K3')) {
    // also: the typed text lands at the caret, and the paginated build keeps exactly one mid-block widget
    const ends = (v: unknown): unknown[] => [field(v, 'start'), field(v, 'end')]
    const offsetsSame = sections.every((v) => same(ends(v).map((e) => field(e, 'offsets')), ends(flat).map((e) => field(e, 'offsets'))))
    const widgetKept = ends(secpg).every((e) => field(e, 'landedAtCaret') === true && field(e, 'midWidgetsInBlock') === 1)
    return offsetsSame && widgetKept ? 'same as flat' : 'differs'
  }
  if (/^(A|B|C1|C2|K)/.test(check)) return sections.every((v) => same(field(v, 'offsets'), field(flat, 'offsets'))) ? 'same as flat' : 'differs'
  return 'reported'
}

async function runEngine(engine: Engine, zoom: number): Promise<object> {
  const platform = `${process.platform}-${process.arch}`
  const checks: Checks = {}
  const only = zoom === 100 ? Object.keys(BLOCK_CHECKS) : ZOOM_BLOCKS
  const expected = only.flatMap((b) => BLOCK_CHECKS[b]!)
  let browser: Browser
  try {
    browser = await ENGINES[engine].launch({ headless: true })
  } catch (e) {
    return { engine, version: null, platform, zoom, launched: false, reason: String(e).split('\n')[0], keys: KEYS, checks, verdict: Object.fromEntries(expected.map((c) => [c, 'not run'])) }
  }
  const { server, base } = await startServer()
  const marks: Landmarks = { ...corpusLandmarks(), oversized: await findOversized(browser, base) }
  const params = (build: Build, extra: Record<string, string> = {}): Record<string, string> => ({ ...BUILDS[build], ...(zoom === 100 ? {} : { zoom: String(zoom) }), ...extra })
  // One block of checks on a fresh page; a hang or a throw is recorded and the remaining blocks still run.
  const guard = async (name: string, build: Build, extra: Record<string, string>, fn: (page: Page) => Promise<void>): Promise<void> => {
    process.stderr.write(`[${engine}${zoom === 100 ? '' : ` zoom ${zoom}`}] ${build} ${name} ...`)
    const t0 = Date.now()
    const opened: { page: Page | null } = { page: null }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          const page = opened.page = await openEditor(browser, base, params(build, extra))
          await page.evaluate(HELPERS)
          await R(page, () => window.__h.frames(3))
          await fn(page)
        })(),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${CHECK_TIMEOUT_MS / 1000} s`)), CHECK_TIMEOUT_MS) }),
      ])
      process.stderr.write(` done in ${Math.round((Date.now() - t0) / 1000)} s\n`)
    } catch (e) {
      process.stderr.write(` did not finish: ${String(e).slice(0, 200)}\n`)
      ;(checks[`notRun_block_${name}`] ??= {})[build] = String(e).slice(0, 300)
    } finally {
      clearTimeout(timer)
      // WebKit under Playwright sometimes never resolves context.close() after the selection checks; do not wait for it
      if (opened.page) await Promise.race([opened.page.context().close(), new Promise((r) => setTimeout(r, 5000))])
    }
  }
  for (const build of BUILD_NAMES) {
    for (const name of only) {
      const rec = (check: string, value: unknown): void => { (checks[check] ??= {})[build] = value }
      await guard(name, build, EXTRA_PARAMS[name] ?? {}, (page) => blocks[name]!(page, build, rec, marks))
    }
  }
  server.stop(true)
  const version = browser.version()
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))])
  return { engine, version, platform, zoom, launched: true, keys: KEYS, checks, verdict: Object.fromEntries(expected.map((c) => [c, verdictFor(c, checks[c])])) }
}

const GROUPS: readonly (readonly [string, RegExp])[] = [['Caret (B, K)', /^(B|K)/], ['Selection (C)', /^C/], ['Find (D)', /^D/], ['Scroll (E–G)', /^[EFG]/], ['Editing (H)', /^H/]]

// One cell: `correct`, the checks that differ, or `not run`.
function cell(verdict: Record<string, string>, pattern: RegExp): string {
  const own = Object.entries(verdict).filter(([check]) => pattern.test(check))
  const differ = own.filter(([, v]) => v === 'differs').map(([c]) => c)
  const notRun = own.filter(([, v]) => v === 'not run').map(([c]) => c)
  if (differ.length) return `differs: ${differ.join(', ')}${notRun.length ? `; not run: ${notRun.join(', ')}` : ''}`
  if (notRun.length === own.length) return 'not run'
  return notRun.length ? `correct; not run: ${notRun.join(', ')}` : 'correct'
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function summarise(dir: string): string {
  const rows: string[] = []
  for (const file of readdirSync(dir).filter((f) => /^risk-[a-z0-9-]+\.json$/.test(f)).toSorted()) {
    const raw: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    if (!isRecord(raw) || typeof raw.engine !== 'string' || !isRecord(raw.verdict)) throw new TypeError(`${file} is not a result of this harness`)
    const verdict = Object.fromEntries(Object.entries(raw.verdict).map(([k, v]) => [k, String(v)]))
    rows.push(`| ${raw.engine} | ${raw.version ?? 'did not launch'} | ${raw.platform} | ${raw.zoom ?? 100} % | ${GROUPS.map(([, re]) => cell(verdict, re)).join(' | ')} | \`${file}\` |`)
  }
  return [
    '# Behaviour across section boundaries',
    '',
    'Written by `bun harness/risk.ts --summarise`. Each check runs on a flat document, on 100-block sections with `content-visibility: auto`, and on the same sections with page breaks, at 1,000 pages in one browser; the two section builds are compared with the flat one. `correct`: every check of the group behaved as in the flat document, or is reported only. Otherwise the checks that differ are named. `not run`: no check of the group ran (zoom runs cover caret and selection only).',
    '',
    `| Engine | Version | Platform | Zoom | ${GROUPS.map(([name]) => name).join(' | ')} | Source |`,
    `|${' --- |'.repeat(GROUPS.length + 5)}`,
    ...rows,
    '',
  ].join('\n')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const arg = args[0]
  if (arg === '--summarise') {
    const di = args.indexOf('--dir')
    const dir = di >= 0 ? args[di + 1]! : resultsDir()
    writeFileSync(join(dir, 'risk-summary.md'), summarise(dir))
  } else if (arg === 'chromium' || arg === 'firefox' || arg === 'webkit') {
    const zi = args.indexOf('--zoom')
    const zoom = zi >= 0 ? Number(args[zi + 1]) : 100
    const report = await runEngine(arg, zoom)
    writeFileSync(join(resultsDir(), `risk-${arg}${zoom === 100 ? '' : `-z${zoom}`}.json`), JSON.stringify(report, null, 1) + '\n')
  } else {
    console.error('Usage: bun harness/risk.ts <chromium|webkit|firefox> [--zoom <percent>] | --summarise [--dir <dir>]')
    process.exit(2)
  }
}
