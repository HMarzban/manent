// Renders a set of blocks with the script page's CSS and compares the line starts the browser chose with the
// wrapper's. Query: set=corpus|edge, ws=pre-wrap|break-spaces, zoom=<percent>.
import './page.css'
import { edgeMatrix, makeCorpus } from './corpus.ts'
import { PROFILE, wrap } from './engine.ts'
import type { ElementType } from './engine.ts'

interface Mismatch {
  type: ElementType
  text: string
  engine: number[]
  dom: number[]
}

interface Comparison {
  blocks: number
  mismatched: number
  examples: Mismatch[]
}

declare global {
  interface Window {
    __conformance: { compare(): Comparison }
  }
}

const EXAMPLE_LIMIT = 10

const q = new URLSearchParams(location.search)
const blocks = q.get('set') === 'edge' ? edgeMatrix() : makeCorpus(120)
const zoom = Number(q.get('zoom') ?? 100) / 100
document.documentElement.style.setProperty('--ws', q.get('ws') ?? 'pre-wrap')
const sheet = document.querySelector<HTMLElement>('.page')!
sheet.style.transform = `scale(${zoom})`
const rendered = blocks.map((b) => {
  const p = document.createElement('p')
  p.className = `el el-${b.type}`
  p.textContent = b.text
  sheet.append(p)
  return p
})

// A character starts a line when its box sits more than half a line below the box of the line it would join.
function domStarts(p: HTMLElement, text: string): number[] {
  const node = p.firstChild
  if (!node) return [0]
  const halfLine = (PROFILE.screen.linePx * zoom) / 2
  const range = document.createRange()
  const starts = [0]
  let lineTop: number | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xdc00 && c <= 0xdfff) continue
    range.setStart(node, i)
    range.setEnd(node, c >= 0xd800 && c <= 0xdbff ? i + 2 : i + 1)
    const rect = range.getClientRects()[0]
    if (!rect) continue
    if (lineTop === null) lineTop = rect.top
    else if (rect.top > lineTop + halfLine) {
      starts.push(i)
      lineTop = rect.top
    }
  }
  return starts
}

window.__conformance = {
  compare() {
    const examples: Mismatch[] = []
    let mismatched = 0
    blocks.forEach((b, i) => {
      const engine = Array.from(wrap(b.text, PROFILE.elements[b.type].width))
      const dom = domStarts(rendered[i]!, b.text)
      if (engine.length === dom.length && engine.every((s, k) => s === dom[k])) return
      mismatched++
      if (examples.length < EXAMPLE_LIMIT) examples.push({ type: b.type, text: b.text, engine, dom })
    })
    return { blocks: blocks.length, mismatched, examples }
  },
}
