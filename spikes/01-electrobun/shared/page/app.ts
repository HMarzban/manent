// A flat ProseMirror document of 120 screenplay-shaped pages, served by the local node to both shells.
import { Schema } from 'prosemirror-model'
import type { Node, NodeSpec } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'

declare global {
  interface Window {
    __view: EditorView
    __ready: Ready
    __api: typeof api
  }
}

interface Ready {
  buildDocMs: number
  createViewMs: number
  firstFrameMs: number
  domNodes: number
  docChars: number
  docSize: number
}

const PAGES = 120
const BLOCKS_PER_PAGE = 25
const token = new URLSearchParams(location.search).get('t') ?? ''
const withToken = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`

let seed = 0x9e3779b9
const rnd = (): number => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) }
const ri = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1))
const WORDS = 'the of and to in is that it was for on are as with his they at be this from have or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part'.split(' ')
const words = (n: number): string => { let s = ''; for (let i = 0; i < n; i++) s += (i ? ' ' : '') + WORDS[ri(0, WORDS.length - 1)]; return s }
const genBlock = (): [string, string] => {
  const r = rnd()
  if (r < 0.04) return ['scene_heading', 'INT. ' + words(3).toUpperCase() + ' - DAY']
  if (r < 0.34) return ['action', words(ri(12, 40))]
  if (r < 0.62) return ['character', words(1).toUpperCase()]
  if (r < 0.92) return ['dialogue', words(ri(4, 28))]
  if (r < 0.97) return ['parenthetical', '(' + words(2) + ')']
  return ['transition', 'CUT TO:']
}

const block = (name: string): NodeSpec => ({
  content: 'text*',
  group: 'block',
  attrs: { id: { default: '' } },
  toDOM: (node) => ['p', { class: `el el-${name}`, 'data-type': name, 'data-id': node.attrs.id }, 0],
  parseDOM: [{ tag: `p.el-${name}`, getAttrs: (dom) => ({ id: dom.getAttribute('data-id') ?? '' }) }]
})
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: {},
    scene_heading: block('scene_heading'), action: block('action'), character: block('character'), dialogue: block('dialogue'), parenthetical: block('parenthetical'), transition: block('transition')
  }
})

let nextId = 0
const genNodes = (count: number): Node[] => {
  const out: Node[] = []
  for (let i = 0; i < count; i++) { const [t, s] = genBlock(); out.push(schema.node(t, { id: `b${nextId++}` }, schema.text(s))) }
  return out
}

const afterNextFrame = (fn: () => void): void => {
  requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(0) })
}

const t0 = performance.now()
const doc = schema.node('doc', null, genNodes(PAGES * BLOCKS_PER_PAGE))
const tDoc = performance.now()

const editor = document.querySelector('#editor')
if (!editor) throw new Error('the page has no #editor element')
const view = new EditorView(editor, {
  state: EditorState.create({ doc, plugins: [history(), keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo }), keymap(baseKeymap)] }),
  attributes: { spellcheck: 'false' }
})
const tView = performance.now()
window.__view = view

afterNextFrame(() => {
  window.__ready = { buildDocMs: tDoc - t0, createViewMs: tView - tDoc, firstFrameMs: performance.now() - t0, domNodes: document.getElementsByTagName('*').length, docChars: doc.textContent.length, docSize: doc.content.size }
  void fetch(withToken('/mark?name=first-frame'))
  void fetch(withToken(`/mark?name=ua-${encodeURIComponent(navigator.userAgent)}`))
})

const ws = new WebSocket(withToken(`ws://${location.host}/ws`))
ws.onopen = () => ws.send(JSON.stringify({ type: 'ping', n: 0 }))
ws.onmessage = (e) => { if (JSON.parse(String(e.data)).type === 'pong') document.body.dataset.ws = 'ok' }

// Event Timing entries and long animation frames; the options are a variable because the DOM types lack durationThreshold
const EVENT_TIMING = { type: 'event', durationThreshold: 16, buffered: true }
const ev: Array<{ name: string; dur: number; id: number }> = []
new PerformanceObserver(l => { for (const e of l.getEntries() as PerformanceEventTiming[]) if (e.name === 'keydown' || e.name === 'keypress' || e.name === 'beforeinput' || e.name === 'input') ev.push({ name: e.name, dur: e.duration, id: e.interactionId }) }).observe(EVENT_TIMING)
const loaf: number[] = []
try {
  new PerformanceObserver(l => { for (const e of l.getEntries()) loaf.push(e.duration) }).observe({ type: 'long-animation-frame', buffered: true })
} catch {
  // an engine without long-animation-frame entries leaves the list empty
}

const api = {
  reset (): void { ev.length = 0; loaf.length = 0 },
  results (): { ev: typeof ev; loaf: number[] } { return { ev: ev.slice(), loaf: loaf.slice() } },
  place (where: 'start' | 'middle' | 'end'): void {
    const size = view.state.doc.content.size
    const pos = where === 'start' ? 3 : where === 'middle' ? Math.floor(size / 2) : size - 2
    const sel = TextSelection.near(view.state.doc.resolve(pos))
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView()); view.focus()
  },
  /** Inserts `pages` pages after the block holding the cursor in one transaction; resolves the time to the next frame. */
  paste (pages: number): Promise<{ syncMs: number; toFrameMs: number }> {
    return new Promise(resolve => {
      const bl = genNodes(pages * BLOCKS_PER_PAGE)
      const s = performance.now()
      view.dispatch(view.state.tr.insert(view.state.selection.$from.after(1), bl))
      const sync = performance.now() - s
      afterNextFrame(() => resolve({ syncMs: sync, toFrameMs: performance.now() - s }))
    })
  },
  /** Jump-scrolls through the document in 60 steps and resolves each frame's duration. */
  scrollProbe (): Promise<number[]> {
    return new Promise(resolve => {
      const el = document.scrollingElement ?? document.documentElement
      const max = el.scrollHeight - innerHeight; const frames: number[] = []; let i = 0; let last = performance.now()
      const step = (): void => { const now = performance.now(); frames.push(now - last); last = now; if (i++ >= 60) return resolve(frames.slice(1)); el.scrollTop = max * (i / 60); requestAnimationFrame(step) }
      requestAnimationFrame(step)
    })
  }
}
window.__api = api
