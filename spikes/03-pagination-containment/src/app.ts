// The editor page. Query, with its defaults:
//   pages=120 corpus=script|tall wrap=100 (0 = flat) cv=auto|none pg=1|0 zoom=100 ws=pre-wrap|break-spaces spell=0|1
//   over=1 (the section holding the document's middle position holds over × wrap blocks) y=0|1 (bound to a Y.Doc)
import 'prosemirror-view/style/prosemirror.css'
import './page.css'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import type { Node } from 'prosemirror-model'
import { makeCorpus } from './corpus.ts'
import { paginate, PROFILE, wrap } from './engine.ts'
import type { EngineBlock, PageStart } from './engine.ts'
import { paginationPlugin, readPagination } from './plugin.ts'
import type { PaginationStats } from './plugin.ts'
import { createSchema, engineBlocksOf } from './schema.ts'
import { afterFrame, createBinding } from './binding.ts'
import type { Remote } from './binding.ts'
import { createEditing } from './editing.ts'
import { createSectionView, edgeKeymap, installSectionCss, keepPlugin } from './sections.ts'

declare global {
  interface Window {
    __view: EditorView
    __risk: {
      sel(): { type: string; json: string; from: number; to: number; anchorOff: number; headOff: number; domCollapsed: boolean; domRanges: number; focusInEditor: boolean }
      caret(): { top: number; bottom: number; left: number; inViewport: boolean } | { error: string }
      setOff(off: number, scroll: boolean): number
      secIndexOfHead(): number
      secBoundsOff(i: number): { startOff: number; endOff: number; pos: number; end: number }
      textLen(): number
      insertRemote(off: number, text: string): void
      posAtTextOffset(off: number): number
      textOffsetOf(pos: number): number
    }
    __api: { scrollProbe(): Promise<number[]>; paste(pages: number): Promise<{ syncMs: number; toFrameMs: number }> }
    __remote: Remote
    __pg: { pages(): PageStart[]; cold(): number; reset(): void; stats(): PaginationStats }
    __sec: { count(): number; sizes(): number[]; sectionOf(blockId: string): number; intrinsic(): number[]; domHeights(): number[]; viewUpdates(): number }
  }
}

const q = new URLSearchParams(location.search)
const PAGES = Number(q.get('pages') ?? 120)
const CORPUS = q.get('corpus') ?? 'script'
const WRAP = Number(q.get('wrap') ?? 100)
const CONTAINED = (q.get('cv') ?? 'auto') === 'auto'
const PAGINATED = q.get('pg') !== '0'
const ZOOM = Number(q.get('zoom') ?? 100) / 100
const OVER = Number(q.get('over') ?? 1)
const SYNCED = q.get('y') === '1'
const TALL_LINES = 70

function tallBlock(): EngineBlock {
  const text = 'one long action block that keeps running on past the foot of the page. '.repeat(TALL_LINES + 10)
  return { type: 'action', text: text.slice(0, wrap(text, PROFILE.elements.action.width)[TALL_LINES]).trimEnd() }
}

const corpus: EngineBlock[] = CORPUS === 'tall' ? [tallBlock()] : PAGES === 0 ? [{ type: 'action', text: '' }] : makeCorpus(PAGES)
const schema = createSchema(WRAP > 0)
const blockNodes = corpus.map((b, i) => schema.nodes.block!.create({ id: `b${i}`, type: b.type }, b.text ? schema.text(b.text) : null))

// Sections of WRAP blocks, except that the one holding the document's middle position holds OVER × WRAP.
function sectionRuns(nodes: readonly Node[]): Node[][] {
  const chunk = (list: readonly Node[]): Node[][] => Array.from({ length: Math.ceil(list.length / WRAP) }, (_, i) => list.slice(i * WRAP, (i + 1) * WRAP))
  if (OVER <= 1) return chunk(nodes)
  const half = nodes.reduce((n, b) => n + b.nodeSize, 0) / 2
  let middle = 0
  for (let pos = 0; middle < nodes.length - 1 && pos + nodes[middle]!.nodeSize < half; middle++) pos += nodes[middle]!.nodeSize
  const start = Math.max(0, middle - Math.floor((OVER * WRAP) / 2))
  return [...chunk(nodes.slice(0, start)), nodes.slice(start, start + OVER * WRAP), ...chunk(nodes.slice(start + OVER * WRAP))]
}

const doc = WRAP > 0
  ? schema.node('doc', null, sectionRuns(blockNodes).map((run) => schema.node('section', null, run)))
  : schema.node('doc', null, blockNodes)

document.documentElement.style.setProperty('--ws', q.get('ws') ?? 'pre-wrap')
if (WRAP > 0) installSectionCss(CONTAINED)

let viewUpdates = 0
let nextId = 0
const editing = createEditing({ wrap: WRAP, newId: () => `n${nextId++}` })
const binding = SYNCED ? createBinding({ doc, schema }) : null
const plugins = [
  ...(binding ? binding.plugins : []),
  ...(WRAP > 0 ? [edgeKeymap, keymap({ Backspace: editing.sectionBackspace, Delete: editing.sectionDelete, Enter: editing.sectionEnter })] : []),
  keymap(baseKeymap),
  paginationPlugin({ enabled: PAGINATED }),
  ...(WRAP > 0 && CONTAINED ? [keepPlugin] : []),
]
const sheet = document.querySelector<HTMLElement>('.page')!
const view = new EditorView({ mount: sheet }, {
  state: EditorState.create({ doc: binding ? binding.doc : doc, plugins }),
  nodeViews: WRAP > 0 && CONTAINED ? { section: createSectionView(() => { viewUpdates++ }) } : {},
  attributes: { spellcheck: q.get('spell') === '1' ? 'true' : 'false' },
  ...(WRAP > 0 ? { handlePaste: editing.handlePaste, handleDrop: editing.handleDrop } : {}),
})
if (binding) window.__remote = binding.createRemote(view)
window.__view = view

// App zoom scales the laid-out sheet; the desk is sized to the scaled sheet so the scroll range matches.
if (ZOOM !== 1) {
  const desk = document.querySelector<HTMLElement>('#desk')!
  sheet.style.transform = `scale(${ZOOM})`
  desk.style.width = `${PROFILE.screen.pageWidthPx * ZOOM}px`
  desk.style.overflow = 'hidden'
  new ResizeObserver(() => { desk.style.height = `${sheet.offsetHeight * ZOOM}px` }).observe(sheet)
}

const textOffsetOf = (pos: number): number => view.state.doc.textBetween(0, pos).length
const posAtTextOffset = (off: number): number => {
  let acc = 0
  let found: number | null = null
  view.state.doc.descendants((n, p) => {
    if (found != null) return false
    if (n.isText) {
      if (acc + n.text!.length >= off) { found = p + (off - acc); return false }
      acc += n.text!.length
    }
    return true
  })
  return found ?? view.state.doc.content.size - 1
}

window.__risk = {
  sel() { const s = view.state.selection; const ds = getSelection()!; return { type: s.constructor.name, json: s.toJSON().type, from: s.from, to: s.to, anchorOff: textOffsetOf(s.anchor), headOff: textOffsetOf(s.head), domCollapsed: ds.isCollapsed, domRanges: ds.rangeCount, focusInEditor: view.hasFocus() } },
  caret() { try { const c = view.coordsAtPos(view.state.selection.head); return { top: c.top, bottom: c.bottom, left: c.left, inViewport: c.top >= 0 && c.bottom <= innerHeight } } catch (e) { return { error: String(e) } } },
  setOff(off, scroll) { const pos = posAtTextOffset(off); let tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)); if (scroll) tr = tr.scrollIntoView(); view.dispatch(tr); view.focus(); return pos },
  secIndexOfHead() { const $h = view.state.selection.$head; return $h.depth ? $h.index(0) : -1 },
  secBoundsOff(i) { let pos = 0; const d = view.state.doc; for (let k = 0; k < i; k++) pos += d.child(k).nodeSize; return { startOff: textOffsetOf(pos), endOff: textOffsetOf(pos + d.child(i).nodeSize), pos, end: pos + d.child(i).nodeSize } },
  textLen() { return view.state.doc.textBetween(0, view.state.doc.content.size).length },
  insertRemote(off, text) { const pos = posAtTextOffset(off); view.dispatch(view.state.tr.insertText(text, pos)) },
  posAtTextOffset,
  textOffsetOf,
}

// The blocks of a corpus that fill `pages` pages: one more page's corpus without the block that began that page.
const pastedCorpus = (pages: number): EngineBlock[] => makeCorpus(pages + 1).slice(0, -1)

window.__api = {
  // Jump-scrolls through the document in 60 steps and returns the frame times.
  scrollProbe() {
    return new Promise((resolve) => {
      const el = document.scrollingElement!; const max = el.scrollHeight - innerHeight; const frames: number[] = []; let i = 0; let last = performance.now()
      const step = (): void => { const now = performance.now(); frames.push(now - last); last = now; if (i++ >= 60) { resolve(frames.slice(1)); return } el.scrollTop = max * (i / 60); requestAnimationFrame(step) }
      requestAnimationFrame(step)
    })
  },
  // Pastes `pages` pages of generated blocks at the caret through the paste rule; ms in the transaction and to the
  // next frame.
  paste(pages) {
    return new Promise((resolve) => {
      const blocks = pastedCorpus(pages).map((b) => schema.nodes.block!.create({ type: b.type }, b.text ? schema.text(b.text) : null))
      const s = performance.now()
      view.dispatch(editing.insertBlocks(view.state.tr, view.state.selection.head, blocks))
      const syncMs = performance.now() - s
      afterFrame(() => resolve({ syncMs, toFrameMs: performance.now() - s }))
    })
  },
}

window.__pg = {
  pages: () => readPagination(view.state).state.pages,
  cold() {
    const fresh = engineBlocksOf(view.state.doc).map((b) => ({ type: b.type, text: b.text }))
    const t0 = performance.now()
    paginate(fresh)
    return performance.now() - t0
  },
  reset() { const { stats } = readPagination(view.state); stats.recomputes = 0; stats.engineMs.length = 0; stats.decoMs.length = 0; stats.movedBreaks = 0 },
  stats() { const { stats } = readPagination(view.state); return { ...stats, engineMs: stats.engineMs.slice(), decoMs: stats.decoMs.slice() } },
}

const sectionEls = (): HTMLElement[] => [...view.dom.querySelectorAll<HTMLElement>(':scope > .section')]

window.__sec = {
  count: () => (WRAP > 0 ? view.state.doc.childCount : 0),
  sizes() { const out: number[] = []; if (WRAP > 0) view.state.doc.forEach((s) => out.push(s.childCount)); return out },
  sectionOf(blockId) {
    let found = -1
    view.state.doc.forEach((s, _, i) => { if (found < 0) s.forEach((b) => { if (b.attrs.id === blockId) found = i }) })
    return found
  },
  intrinsic: () => sectionEls().map((el) => Number.parseFloat(el.style.containIntrinsicSize.split(' ')[1] ?? 'NaN')),
  // Laid-out heights with every section forced visible, so this is never the intrinsic size read back.
  domHeights() {
    const els = sectionEls()
    for (const el of els) el.style.contentVisibility = 'visible'
    const heights = els.map((el) => el.getBoundingClientRect().height / ZOOM)
    for (const el of els) el.style.contentVisibility = ''
    return heights
  },
  viewUpdates: () => viewUpdates,
}
