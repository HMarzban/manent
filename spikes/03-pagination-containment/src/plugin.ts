// Pagination as decorations: the engine runs in the plugin's state, page breaks are widgets inside sections, and the
// first block of each page drops its space before. The changed range is found by node identity, never from the
// transaction's steps, because the Yjs binding replaces the whole document on every remote change.
import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Mapping, StepMap } from 'prosemirror-transform'
import type { Node } from 'prosemirror-model'
import { measure, paginate, paginateFrom, PROFILE } from './engine.ts'
import type { EngineBlock, PageStart } from './engine.ts'
import { engineBlockOf, engineBlocksOf } from './schema.ts'

export interface PaginationState {
  pages: PageStart[]
  decorations: DecorationSet
  frozenForComposition: boolean
  /** The document `pages` were computed from, and its blocks in order; behind the view's document while frozen. */
  doc: Node
  blocks: EngineBlock[]
}

export interface PaginationStats {
  recomputes: number
  /** One entry per transaction since the last reset that changed the document or ended a composition, in ms. */
  engineMs: number[]
  decoMs: number[]
  /** Page starts the latest recomputation changed. */
  movedBreaks: number
}

const paginationKey = new PluginKey<PaginationState>('pagination')
const statsOf = new WeakMap<Plugin, PaginationStats>()

// Bottom margin, the gap between sheets, and the next sheet's top margin, in px.
const BREAK_PX = 96 + 24 + 96
const TOP_MARGIN_PX = 96
const GAP_PX = 24

const isBlock = (node: Node): boolean => node.type.name === 'block'

// The engine objects of the blocks that overlap [from, to), or that contain `from` when the range is empty.
function blocksBetween(doc: Node, from: number, to: number): EngineBlock[] {
  const out: EngineBlock[] = []
  doc.nodesBetween(from, to, (node) => {
    if (!isBlock(node)) return true
    out.push(engineBlockOf(node))
    return false
  })
  return out
}

// How many blocks end at or before `pos`.
function blocksBefore(doc: Node, pos: number): number {
  let index = 0
  let p = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    const end = p + child.nodeSize
    if (end <= pos) {
      index += isBlock(child) ? 1 : child.childCount
      p = end
      continue
    }
    if (isBlock(child)) return index
    let q = p + 1
    for (let k = 0; k < child.childCount; k++) {
      q += child.child(k).nodeSize
      if (q > pos) return index
      index++
    }
    return index
  }
  return index
}

// The document position of each block from index `first` up to, not including, `end`.
function blockPositions(doc: Node, first: number, end: number): number[] {
  const out: number[] = []
  let index = 0
  let pos = 0
  for (let i = 0; i < doc.childCount && index < end; i++) {
    const child = doc.child(i)
    if (isBlock(child)) {
      if (index >= first) out.push(pos)
      index++
    } else if (index + child.childCount <= first) {
      index += child.childCount
    } else {
      let p = pos + 1
      for (let k = 0; k < child.childCount && index < end; k++) {
        if (index >= first) out.push(p)
        index++
        p += child.child(k).nodeSize
      }
    }
    pos += child.nodeSize
  }
  return out
}

const blockPos = (doc: Node, index: number): number => blockPositions(doc, index, index + 1)[0]!

// Lines page `q` fills, counted as the engine counts them: a repeated cue at its top and a (MORE) at its foot count.
function usedLines(blocks: readonly EngineBlock[], pages: readonly PageStart[], q: number): number {
  const a = pages[q]!
  const b = pages[q + 1] ?? { startBlock: blocks.length, startLine: 0, contd: false }
  let used = a.contd ? 1 : 0
  for (let i = a.startBlock; i < blocks.length && (i < b.startBlock || (i === b.startBlock && b.startLine > 0)); i++) {
    const block = blocks[i]!
    const from = i === a.startBlock ? a.startLine : 0
    const to = i === b.startBlock ? b.startLine : measure(block).lines
    used += (i === a.startBlock ? 0 : PROFILE.elements[block.type].before) + to - from
  }
  return used + (b.contd ? 1 : 0)
}

function cueOf(blocks: readonly EngineBlock[], speech: number): string {
  for (let i = speech - 1; i >= 0; i--) {
    const b = blocks[i]!
    if (b.type === 'character') return `${b.text} (CONT'D)`
    if (b.type !== 'dialogue' && b.type !== 'parenthetical') break
  }
  return "(CONT'D)"
}

// Everything that changes the widget's DOM is in its key, so a rebuilt set reuses the DOM of an equal widget.
function breakWidget(pos: number, mid: boolean, heightPx: number, cue: string | null): Decoration {
  const key = `${mid ? 'mid' : 'pb'}:${heightPx}:${cue ?? ''}`
  return Decoration.widget(pos, () => {
    const el = document.createElement('div')
    el.className = mid ? 'pb mid' : 'pb'
    el.style.height = `${heightPx}px`
    const gapAt = TOP_MARGIN_PX + (cue ? PROFILE.screen.linePx : 0)
    el.style.background = `linear-gradient(to top, transparent ${gapAt}px, #ccc ${gapAt}px ${gapAt + GAP_PX}px, transparent ${gapAt + GAP_PX}px)`
    if (cue) {
      const more = document.createElement('div')
      more.className = 'more'
      more.dataset.text = '(MORE)'
      const repeated = document.createElement('div')
      repeated.className = 'cue'
      repeated.dataset.text = cue
      repeated.style.marginTop = `${heightPx - 2 * PROFILE.screen.linePx}px`
      el.append(more, repeated)
    }
    return el
  }, { side: -1, key, heightPx })
}

// The widget before page `p` and the node decoration on its first block, for each page from `lo` to `hi`.
function decorationsFor(doc: Node, blocks: readonly EngineBlock[], pages: readonly PageStart[], lo: number, hi: number): Decoration[] {
  const first = pages[lo]!.startBlock
  const positions = blockPositions(doc, first, pages[hi]!.startBlock + 1)
  const L = PROFILE.linesPerPage
  const out: Decoration[] = []
  for (let p = lo; p <= hi; p++) {
    const s = pages[p]!
    const pos = positions[s.startBlock - first]!
    const heightPx = p > 0 ? (L - usedLines(blocks, pages, p - 1)) * PROFILE.screen.linePx + BREAK_PX + (s.contd ? 2 * PROFILE.screen.linePx : 0) : 0
    if (s.startLine === 0) {
      if (p > 0) out.push(breakWidget(pos, false, heightPx, null))
      out.push(Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, { class: 'page-top' }, { pageTop: true }))
    } else {
      const offset = measure(blocks[s.startBlock]!).starts[s.startLine]!
      out.push(breakWidget(pos + 1 + offset, true, heightPx, s.contd ? cueOf(blocks, s.startBlock) : null))
    }
  }
  return out
}

// The last page for which `starts(page)` holds; `starts` is true for a prefix of the pages.
function lastPageWhere(pages: readonly PageStart[], starts: (s: PageStart) => boolean): number {
  let lo = 0
  let hi = pages.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts(pages[mid]!)) lo = mid
    else hi = mid - 1
  }
  return lo
}

// The page holding the first line of block `index`, and the last page holding any line of it.
const firstPageOf = (pages: readonly PageStart[], index: number): number => lastPageWhere(pages, (s) => s.startBlock < index || (s.startBlock === index && s.startLine === 0))
const lastPageOf = (pages: readonly PageStart[], index: number): number => lastPageWhere(pages, (s) => s.startBlock <= index)

const sameStart = (a: PageStart, b: PageStart): boolean => a.startBlock === b.startBlock && a.startLine === b.startLine && a.contd === b.contd

interface Change {
  start: number
  endOld: number
  endNew: number
}

// The replaced range between two documents, found from both ends by node identity.
function changeBetween(before: Node, after: Node): Change | null {
  const start = before.content.findDiffStart(after.content)
  if (start === null) return null
  let { a: endOld, b: endNew } = before.content.findDiffEnd(after.content)!
  const overlap = start - Math.min(endOld, endNew)
  if (overlap > 0) {
    endOld += overlap
    endNew += overlap
  }
  return { start, endOld, endNew }
}

function initialState(doc: Node): PaginationState {
  const blocks = engineBlocksOf(doc)
  const pages = paginate(blocks)
  return { pages, decorations: DecorationSet.create(doc, decorationsFor(doc, blocks, pages, 0, pages.length - 1)), frozenForComposition: false, doc, blocks }
}

function recompute(prev: PaginationState, doc: Node, stats: PaginationStats): PaginationState {
  const change = changeBetween(prev.doc, doc)
  if (!change) return prev.frozenForComposition ? initialState(doc) : { ...prev, doc }
  const t0 = performance.now()
  const from = blocksBefore(doc, change.start)
  const oldCount = blocksBetween(prev.doc, change.start, change.endOld).length
  const inserted = blocksBetween(doc, change.start, change.endNew)
  const blocks = prev.blocks.slice(0, from).concat(inserted, prev.blocks.slice(from + oldCount))
  const delta = inserted.length - oldCount
  // Old page starts in the new indexing; those inside the replaced blocks cannot be trusted and are dropped, except the
  // first page's, which is always block 0, line 0.
  const old: PageStart[] = []
  for (const s of prev.pages) {
    if (s.startBlock < from || s === prev.pages[0]) old.push(s)
    else if (s.startBlock >= from + oldCount) old.push(delta ? { ...s, startBlock: s.startBlock + delta } : s)
  }
  const pages = paginateFrom(blocks, old, from)
  const t1 = performance.now()
  let a = 0
  while (a < pages.length && a < old.length && sameStart(pages[a]!, old[a]!)) a++
  let tail = 0
  while (tail < pages.length - a && tail < old.length - a && sameStart(pages[pages.length - 1 - tail]!, old[old.length - 1 - tail]!)) tail++
  stats.movedBreaks = Math.max(pages.length - a - tail, old.length - a - tail)
  stats.recomputes++
  let decorations: DecorationSet
  if (prev.frozenForComposition) {
    decorations = DecorationSet.create(doc, decorationsFor(doc, blocks, pages, 0, pages.length - 1))
  } else {
    // Decorations of every page whose start, whose own lines or whose predecessor's lines may have changed.
    // Pages a to pages.length - tail - 1 have new starts; when that range is empty only the edited pages count.
    const moved = a < pages.length - tail
    const lo = Math.max(0, Math.min(moved ? a : pages.length, firstPageOf(pages, from)) - 1)
    const hi = Math.min(pages.length - 1, Math.max(moved ? pages.length - tail : 0, lastPageOf(pages, Math.max(from, from + inserted.length - 1)) + 1))
    const shifted = prev.decorations.map(new Mapping([new StepMap([change.start, change.endOld - change.start, change.endNew - change.start])]), doc)
    const loPos = blockPos(doc, pages[lo]!.startBlock)
    const hiPos = blockPos(doc, pages[hi]!.startBlock)
    const endPos = hi === pages.length - 1 ? doc.content.size : hiPos + doc.nodeAt(hiPos)!.nodeSize
    const stale = shifted.find(loPos, endPos).filter((d) => d.from >= loPos && d.from < endPos)
    decorations = shifted.remove(stale).add(doc, decorationsFor(doc, blocks, pages, lo, hi))
  }
  stats.engineMs.push(t1 - t0)
  stats.decoMs.push(performance.now() - t1)
  return { pages, decorations, frozenForComposition: false, doc, blocks }
}

function apply(tr: Transaction, prev: PaginationState, stats: PaginationStats): PaginationState {
  if (tr.getMeta('composition') != null) {
    if (!tr.docChanged) return prev.frozenForComposition ? prev : { ...prev, frozenForComposition: true }
    const t0 = performance.now()
    const decorations = prev.decorations.map(tr.mapping, tr.doc)
    stats.engineMs.push(0)
    stats.decoMs.push(performance.now() - t0)
    return { ...prev, decorations, frozenForComposition: true }
  }
  if (!tr.docChanged && !prev.frozenForComposition) return prev
  return recompute(prev, tr.doc, stats)
}

/**
 * The page-break plugin. While a composition is active its breaks are mapped, not recomputed; they are recomputed on
 * the first transaction after it. `enabled: false` keeps an empty state and does no work.
 */
export function paginationPlugin(opts: { enabled: boolean }): Plugin {
  const stats: PaginationStats = { recomputes: 0, engineMs: [], decoMs: [], movedBreaks: 0 }
  const plugin = new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: (_, state) => opts.enabled ? initialState(state.doc) : { pages: [], decorations: DecorationSet.empty, frozenForComposition: false, doc: state.doc, blocks: [] },
      apply: (tr, prev) => opts.enabled ? apply(tr, prev, stats) : prev,
    },
    props: { decorations: (state) => paginationKey.getState(state)?.decorations },
  })
  statsOf.set(plugin, stats)
  return plugin
}

/** The plugin's state and its running counters in `state`. */
export function readPagination(state: EditorState): { state: PaginationState; stats: PaginationStats } {
  return { state: paginationKey.getState(state)!, stats: statsOf.get(paginationKey.get(state)!)! }
}
