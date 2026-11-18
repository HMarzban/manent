// What every harness of this spike shares: the page server, the in-page probes, percentiles, the results folder and
// the font guard.
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Server } from 'bun'
import type { Page } from 'playwright'

const SPIKE_DIR = join(import.meta.dir, '..')

const CONFORMANCE_HTML = '<!doctype html><meta charset=utf-8><link rel=stylesheet href="/conformance-page.css"><div class=page></div><script type=module src="/conformance-page.js"></script>'

async function bundle(entry: string): Promise<Map<string, Blob>> {
  const built = await Bun.build({ entrypoints: [join(SPIKE_DIR, 'src', entry)], target: 'browser', minify: true })
  if (!built.success) throw new Error(built.logs.join('\n'))
  return new Map(built.outputs.map((o) => [o.path.replace(/^\./, ''), o]))
}

/** Bundles the editor page (at `/`) and the conformance page (at `/conformance`) and serves them on a port the system picks. */
export async function startServer(): Promise<{ server: Server<undefined>; base: string }> {
  const files = new Map([...await bundle('conformance-page.ts'), ...await bundle('index.html')])
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      if (path === '/conformance') return new Response(CONFORMANCE_HTML, { headers: { 'content-type': 'text/html' } })
      const file = files.get(path === '/' ? '/index.html' : path)
      return file ? new Response(file) : new Response('not found', { status: 404 })
    },
  })
  return { server, base: `http://localhost:${server.port}` }
}

// Runs before any page script: records when the first frame containing an editable ProseMirror element has been presented.
export const INIT = `(() => { const check = () => { const el = document.querySelector('.ProseMirror[contenteditable="true"]'); if (el) { const t = performance.now(); const ch = new MessageChannel(); ch.port1.onmessage = () => { window.__firstEditable = { seenAt: t, afterFrame: performance.now() } }; ch.port2.postMessage(0) } else requestAnimationFrame(check) }; requestAnimationFrame(check) })()`

// Keystroke to next frame, injected from outside the page: keydown (capture) -> the dispatch that changes the
// document -> next animation frame -> message-channel task after that frame.
export const INSTRUMENT = `(() => {
  const el = document.querySelector('.ProseMirror')
  const view = window.__view || (el.editor && el.editor.view)
  if (!view) throw new Error('no view')
  window.__view = view
  const samples = []; let lastKey = 0
  document.addEventListener('keydown', () => { lastKey = performance.now() }, true)
  const orig = view.dispatch
  view.dispatch = tr => {
    const s = performance.now(); orig(tr); const pm = performance.now() - s
    if (tr.docChanged && lastKey) { const k = lastKey; lastKey = 0; requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => samples.push({ pm, paint: performance.now() - k }); ch.port2.postMessage(0) }) }
  }
  const ev = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'keydown' || e.name === 'keypress' || e.name === 'beforeinput' || e.name === 'input') ev.push(e.duration) }).observe({ type: 'event', durationThreshold: 16, buffered: false })
  window.__bench = {
    place (where) {
      const st = view.state; const size = st.doc.content.size
      const pos = where === 'start' ? 3 : where === 'middle' ? Math.floor(size / 2) : size - 2
      const sel = st.selection.constructor.near(st.doc.resolve(pos))
      view.dispatch(st.tr.setSelection(sel).scrollIntoView()); view.focus()
    },
    reset () { samples.length = 0; ev.length = 0 },
    results () { return { samples: samples.slice(), ev: ev.slice() } },
    info () {
      const d = view.state.doc; let blocks = 0, chars = 0; const lens = []
      d.descendants(n => { if (n.isTextblock) { blocks++; lens.push(n.textContent.length); chars += n.textContent.length; return false } })
      lens.sort((a, b) => a - b)
      const cv = {}; let scanned = 0
      const note = e => { const c = getComputedStyle(e); scanned++; const k = 'content-visibility:' + c.contentVisibility + ' | contain:' + c.contain + ' | contain-intrinsic-size:' + c.containIntrinsicSize; cv[k] = (cv[k] || 0) + 1 }
      for (let e = view.dom; e; e = e.parentElement) note(e)
      for (const e of view.dom.querySelectorAll('*')) note(e)
      return { docSize: d.content.size, topLevel: d.childCount, textblocks: blocks, chars, words: d.textContent.split(/\\s+/).filter(Boolean).length, meanBlock: +(chars / blocks).toFixed(1), medianBlock: lens[lens.length >> 1], p95Block: lens[Math.floor(lens.length * 0.95)], maxBlock: lens[lens.length - 1],
        domAll: document.getElementsByTagName('*').length, domEditor: view.dom.querySelectorAll('*').length + 1, styleScan: { scanned, distinct: cv }, scrollHeight: document.scrollingElement.scrollHeight,
        nodeViews: Object.keys(view.props.nodeViews || {}).length, plugins: view.state.plugins.length }
    }
  }
})()`

/** The `p` quantile of `a` (0 to 1), to one decimal place; null for an empty list. */
export const pct = (a: readonly number[], p: number): number | null => { const s = a.toSorted((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(1) : null }

/** Where every harness of this spike writes: `$MANENT_RESULTS_DIR`, or the spike's `results` folder. Created if missing. */
export function resultsDir(): string {
  const dir = resolve(process.env.MANENT_RESULTS_DIR ?? join(SPIKE_DIR, 'results'))
  mkdirSync(dir, { recursive: true })
  return dir
}

const FONT_FACES = ['16px "Courier Prime"', 'italic 16px "Courier Prime"', 'bold 16px "Courier Prime"', 'italic bold 16px "Courier Prime"'] as const

/**
 * Throws unless each of the four Courier Prime faces has really loaded in `page`. `document.fonts.check()` is not
 * used: it answers true for a face that was never declared.
 */
export async function assertFont(page: Page): Promise<void> {
  const missing = await page.evaluate(async (faces) => {
    await document.fonts.ready
    const out: string[] = []
    for (const f of faces) {
      const loaded = await document.fonts.load(f)
      if (!loaded.some((face) => face.status === 'loaded' && face.family.replace(/"/g, '') === 'Courier Prime')) out.push(f)
    }
    return out
  }, FONT_FACES)
  if (missing.length) throw new Error(`the script font did not load: ${missing.join(', ')}`)
}
