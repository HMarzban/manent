// The view bound to a Y.Doc through y-prosemirror, with a second peer in the same page whose edits arrive as remote
// updates. A remote change reaches the view as one transaction that replaces the whole document.
import * as Y from 'yjs'
import { initProseMirrorDoc, prosemirrorToYXmlFragment, redo, undo, ySyncPlugin, ySyncPluginKey, yUndoPlugin, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { keymap } from 'prosemirror-keymap'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { Node, Schema } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

export interface Remote {
  /** `n` one-character inserts from the peer at the end of the block at fraction `at` of all blocks, one per frame. */
  remoteTyping(n: number, at: number): Promise<{ sync: number; frame: number }[]>
  /** `k` peer inserts in `k` blocks spread over the document, applied back to back, then the same merged into one. */
  remoteBurst(k: number): Promise<{ k: number; separateSyncMs: number; separateFrameMs: number; mergedSyncMs: number; mergedFrameMs: number }>
  startPeer(everyMs: number, at: number): void
  stopPeer(): void
  /** Sections whose node object changed in the latest remote transaction. */
  changedSections(): number
  /** The peer's document as text, blocks separated by a line break. */
  peerText(): string
}

/** Runs `fn` in a task after the next frame has been presented. */
export const afterFrame = (fn: () => void): void => { requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(0) }) }

const changedKey = new PluginKey<number>('changed-sections')

// Counts, for each remote transaction, the top-level nodes of the new document that are not nodes of the old one.
const changedSectionsPlugin = new Plugin<number>({
  key: changedKey,
  state: {
    init: () => 0,
    apply(tr, value, oldState, newState) {
      if (!tr.getMeta(ySyncPluginKey)?.isChangeOrigin) return value
      const old = new Set<Node>()
      oldState.doc.forEach((n) => old.add(n))
      let changed = 0
      newState.doc.forEach((n) => { if (!old.has(n)) changed++ })
      return changed
    },
  },
})

// The block element at fraction `at` of all blocks, counting through sections.
function blockAt(fragment: Y.XmlFragment, at: number): Y.XmlElement {
  const top = fragment.toArray().filter((t): t is Y.XmlElement => t instanceof Y.XmlElement)
  const sectioned = top[0]?.nodeName === 'section'
  const total = sectioned ? top.reduce((n, s) => n + s.length, 0) : top.length
  let index = Math.floor((total - 1) * at)
  if (!sectioned) return top[index]!
  for (const s of top) {
    if (index < s.length) return s.get(index) as Y.XmlElement
    index -= s.length
  }
  throw new RangeError(`no block at fraction ${at}`)
}

function textOf(block: Y.XmlElement): Y.XmlText {
  const first = block.get(0)
  if (first instanceof Y.XmlText) return first
  const text = new Y.XmlText()
  block.insert(0, [text])
  return text
}

/** Binds `doc` to a new Y.Doc (garbage collection on) and creates the in-page peer. */
export function createBinding(options: { doc: Node; schema: Schema }): { doc: Node; plugins: Plugin[]; createRemote: (view: EditorView) => Remote } {
  const ydoc = new Y.Doc({ gc: true })
  const fragment = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(options.doc, fragment)
  const { doc, mapping } = initProseMirrorDoc(fragment, options.schema)

  const peer = new Y.Doc({ gc: true })
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(ydoc))
  ydoc.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(peer, u, 'local') })
  const peerFragment = peer.getXmlFragment('prosemirror')

  // One peer edit, captured as the update it produces.
  const peerEdit = (edit: () => void): Uint8Array => {
    let update: Uint8Array | null = null
    const keep = (u: Uint8Array): void => { update = u }
    peer.on('update', keep)
    edit()
    peer.off('update', keep)
    return update!
  }

  const plugins = [ySyncPlugin(fragment, { mapping }), yUndoPlugin(), keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }), changedSectionsPlugin]

  const createRemote = (view: EditorView): Remote => {
    let timer: ReturnType<typeof setInterval> | null = null
    return {
      async remoteTyping(n, at) {
        const out: { sync: number; frame: number }[] = []
        const text = textOf(blockAt(peerFragment, at))
        for (let i = 0; i < n; i++) {
          const update = peerEdit(() => text.insert(text.length, 'x'))
          await new Promise<void>((resolve) => {
            const s = performance.now()
            Y.applyUpdate(ydoc, update, 'remote')
            const sync = performance.now() - s
            afterFrame(() => { out.push({ sync, frame: performance.now() - s }); resolve() })
          })
        }
        return out
      },
      remoteBurst(k) {
        const edits = (ch: string): Uint8Array[] => Array.from({ length: k }, (_, i) => peerEdit(() => textOf(blockAt(peerFragment, (i + 0.5) / k)).insert(0, ch)))
        const separate = edits('y')
        return new Promise((resolve) => {
          const s = performance.now()
          for (const u of separate) Y.applyUpdate(ydoc, u, 'remote')
          const separateSyncMs = performance.now() - s
          afterFrame(() => {
            const separateFrameMs = performance.now() - s
            const merged = Y.mergeUpdates(edits('z'))
            const s2 = performance.now()
            Y.applyUpdate(ydoc, merged, 'remote')
            const mergedSyncMs = performance.now() - s2
            afterFrame(() => resolve({ k, separateSyncMs, separateFrameMs, mergedSyncMs, mergedFrameMs: performance.now() - s2 }))
          })
        })
      },
      startPeer(everyMs, at) {
        if (timer !== null) clearInterval(timer)
        timer = setInterval(() => {
          const text = textOf(blockAt(peerFragment, at))
          Y.applyUpdate(ydoc, peerEdit(() => text.insert(text.length, 'x')), 'remote')
        }, everyMs)
      },
      stopPeer() {
        if (timer !== null) clearInterval(timer)
        timer = null
      },
      changedSections: () => changedKey.getState(view.state) ?? 0,
      peerText() {
        const d = yXmlFragmentToProseMirrorRootNode(peerFragment, options.schema)
        return d.textBetween(0, d.content.size, '\n')
      },
    }
  }

  return { doc, plugins, createRemote }
}
