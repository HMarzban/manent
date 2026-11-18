// Arithmetic screenplay pagination: a monospace line wrapper, a per-block line cache and a page filler that never
// touches the DOM.

export type ElementType = 'scene_heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition'
export type EngineBlock = { type: ElementType; text: string }
/** A page begins at line `startLine` of block `startBlock`; `contd` means its first line repeats the speaker's cue. */
export type PageStart = { startBlock: number; startLine: number; contd: boolean }

interface ElementProfile {
  /** Text column width, in cells. */
  width: number
  /** Distance from the left edge of the text column, in cells. */
  indent: number
  /** Blank lines above the block, dropped at the top of a page. */
  before: number
  align: 'left' | 'right'
  keepWithNext: boolean
}

/** US Letter in Courier at 10 characters per inch and 6 lines per inch, drawn at 96 px per inch. */
export const PROFILE = {
  linesPerPage: 54,
  /** Fewest lines an action or a speech may leave on either side of a page break. */
  minSplitLines: 2,
  elements: {
    scene_heading: { width: 60, indent: 0, before: 1, align: 'left', keepWithNext: true },
    action: { width: 60, indent: 0, before: 1, align: 'left', keepWithNext: false },
    character: { width: 38, indent: 22, before: 1, align: 'left', keepWithNext: true },
    parenthetical: { width: 25, indent: 16, before: 0, align: 'left', keepWithNext: true },
    dialogue: { width: 35, indent: 10, before: 0, align: 'left', keepWithNext: false },
    transition: { width: 60, indent: 0, before: 1, align: 'right', keepWithNext: false },
  } satisfies Record<ElementType, ElementProfile>,
  screen: { pageWidthPx: 816, pageHeightPx: 1056, cellPx: 9.6, linePx: 16 },
} as const

// Two cells for East Asian wide and full-width characters and for emoji; an approximation of UAX #11.
function cellWidth(cp: number): number {
  if (cp < 0x1100) return 1
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)) return 2
  return 1
}

function cellsBetween(text: string, from: number, to: number): number {
  let cells = 0
  for (let i = from; i < to;) {
    const cp = text.codePointAt(i)!
    cells += cellWidth(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return cells
}

/**
 * The offset of each line start when `text` is set greedily in a column `width` cells wide, as CSS
 * `white-space: pre-wrap` with `overflow-wrap: break-word` sets it: spaces at the end of a line hang past the edge,
 * a line may break after a space or a hyphen-minus, and a run with no such break is cut where it overflows.
 */
export function wrap(text: string, width: number): Int32Array {
  const starts = [0]
  let col = 0
  let lastBreak = -1 // the offset just after the latest break opportunity on this line
  let i = 0
  while (i < text.length) {
    const cp = text.codePointAt(i)!
    if (cp === 32) {
      col += 1
      i += 1
      lastBreak = i
      continue
    }
    const w = cellWidth(cp)
    if (col + w > width) {
      if (lastBreak > starts[starts.length - 1]!) {
        starts.push(lastBreak)
        col = cellsBetween(text, lastBreak, i)
      } else {
        starts.push(i)
        col = 0
      }
      lastBreak = -1
    }
    col += w
    i += cp > 0xffff ? 2 : 1
    if (cp === 45) lastBreak = i
  }
  return Int32Array.from(starts)
}

interface Metrics {
  lines: number
  starts: Int32Array
}

// Keyed by block identity: a changed block is a new object, so a stale entry can never be read.
const metrics = new WeakMap<EngineBlock, Metrics>()

/** The block's line count and line-start offsets at its element's width. */
export function measure(block: EngineBlock): Metrics {
  let m = metrics.get(block)
  if (!m) {
    const starts = wrap(block.text, PROFILE.elements[block.type].width)
    m = { lines: starts.length, starts }
    metrics.set(block, m)
  }
  return m
}

const SENTENCE_END = new RegExp('[.!?…]["\')\\]]*\\s*$')

// The latest line k in [lo, hi] such that line k - 1 ends a sentence, or -1.
function splitPoint(block: EngineBlock, m: Metrics, hi: number, lo: number): number {
  for (let k = hi; k >= lo; k--) {
    if (SENTENCE_END.test(block.text.slice(m.starts[k - 1], m.starts[k]))) return k
  }
  return -1
}

// Lays out pages from the last entry of `pages` to the end of `blocks`, pushing each new page start. `resync` sees
// every new start; when it returns true the fill stops there and returns true.
function fill(blocks: readonly EngineBlock[], pages: PageStart[], resync: (page: PageStart) => boolean): boolean {
  const L = PROFILE.linesPerPage
  const min = PROFILE.minSplitLines
  const n = blocks.length
  let page = pages[pages.length - 1]!
  let i = page.startBlock
  let lineInBlock = page.startLine
  let used = page.contd ? 1 : 0
  let atTop = true
  const startPage = (startBlock: number, startLine: number, contd: boolean): boolean => {
    page = { startBlock, startLine, contd }
    pages.push(page)
    used = contd ? 1 : 0
    atTop = true
    return resync(page)
  }
  while (i < n) {
    const b = blocks[i]!
    const t = PROFILE.elements[b.type]
    const m = measure(b)
    const before = atTop ? 0 : t.before
    const need = before + m.lines - lineInBlock
    if (t.keepWithNext && lineInBlock === 0 && !atTop) {
      // the block, the chain of blocks kept with it, and the first two lines of the block that ends the chain
      let group = need
      for (let j = i + 1; j < n; j++) {
        const tj = PROFILE.elements[blocks[j]!.type]
        const lines = measure(blocks[j]!).lines
        group += tj.before + (tj.keepWithNext ? lines : Math.min(lines, 2))
        if (!tj.keepWithNext) break
      }
      if (used + group > L) {
        if (startPage(i, 0, false)) return true
        continue
      }
    }
    if (used + need <= L) {
      used += need
      atTop = false
      i++
      lineInBlock = 0
      continue
    }
    const room = L - used - before
    if ((b.type === 'action' || b.type === 'dialogue') && m.lines - lineInBlock >= 2 * min) {
      const contd = b.type === 'dialogue'
      const k = splitPoint(b, m, Math.min(lineInBlock + room - (contd ? 1 : 0), m.lines - min), lineInBlock + min)
      if (k > lineInBlock) {
        if (startPage(i, k, contd)) return true
        lineInBlock = k
        continue
      }
    }
    if (atTop) {
      // taller than a page and no legal split: place as much as fits so the fill always advances
      const k = Math.min(m.lines, lineInBlock + Math.max(1, room))
      if (k >= m.lines) {
        used += need
        atTop = false
        i++
        lineInBlock = 0
      } else {
        if (startPage(i, k, false)) return true
        lineInBlock = k
      }
      continue
    }
    // move the whole block to the next page, taking with it the blocks above it that are kept with it
    let s = i
    if (lineInBlock === 0) while (s > page.startBlock && PROFILE.elements[blocks[s - 1]!.type].keepWithNext) s--
    if (s === page.startBlock && page.startLine === 0) s = i
    if (startPage(s, lineInBlock, false)) return true
    i = s
  }
  return false
}

/** Every page start of `blocks`, from scratch. The first page always starts at block 0, line 0. */
export function paginate(blocks: readonly EngineBlock[]): PageStart[] {
  const pages: PageStart[] = [{ startBlock: 0, startLine: 0, contd: false }]
  fill(blocks, pages, () => false)
  return pages
}

function precedes(a: PageStart, b: PageStart): boolean {
  return a.startBlock < b.startBlock || (a.startBlock === b.startBlock && a.startLine < b.startLine)
}

/**
 * The page starts of `blocks`, given `prev`, the page starts of a document that differs from `blocks` only in blocks
 * from `firstDirtyBlock` on, indexed as in `blocks`. Lays out again from the page before the one where that block
 * begins, and stops at the first new page start after it that equals an old one, taking the old starts after it.
 */
export function paginateFrom(blocks: readonly EngineBlock[], prev: readonly PageStart[], firstDirtyBlock: number): PageStart[] {
  let holder = 0
  for (let p = 1; p < prev.length; p++) {
    const s = prev[p]!
    if (s.startBlock < firstDirtyBlock || (s.startBlock === firstDirtyBlock && s.startLine === 0)) holder = p
    else break
  }
  const restart = Math.max(0, holder - 1)
  const pages = prev.slice(0, restart + 1)
  let j = restart + 1
  const resynced = fill(blocks, pages, (page) => {
    if (page.startBlock <= firstDirtyBlock) return false
    while (j < prev.length && precedes(prev[j]!, page)) j++
    const old = prev[j]
    return old !== undefined && old.startBlock === page.startBlock && old.startLine === page.startLine && old.contd === page.contd
  })
  return resynced ? pages.concat(prev.slice(j + 1)) : pages
}
