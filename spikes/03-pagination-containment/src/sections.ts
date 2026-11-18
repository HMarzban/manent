// What keeps 100-block sections with content-visibility correct: the containment CSS, each section's exact
// intrinsic size from the engine, the sections beside the selection kept rendered, and document-edge keys that set
// the selection from the model.
import { Plugin, Selection, TextSelection } from 'prosemirror-state'
import type { Command, EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { DecorationSource, NodeViewConstructor } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import type { Node } from 'prosemirror-model'
import { measure, PROFILE } from './engine.ts'
import { engineBlockOf } from './schema.ts'

/** Safeguard 1. `contained: false` is the fallback: the same wrapper, no containment. */
export function installSectionCss(contained: boolean): void {
  const style = document.createElement('style')
  style.textContent = contained
    ? '.section{content-visibility:auto;display:flow-root}.section.keep{content-visibility:visible}'
    : '.section{display:flow-root}'
  document.head.append(style)
}

// The section's laid-out height: its text lines, the space above each block that does not open a page, and the
// page-break widgets inside it, whose heights the pagination plugin put in their specs.
function intrinsicPx(section: Node, inner: DecorationSource): number {
  const pageTops = new Set<number>()
  let widgetPx = 0
  inner.forEachSet((set) => {
    for (const d of set.find()) {
      if (d.spec.pageTop) pageTops.add(d.from)
      else if (typeof d.spec.heightPx === 'number') widgetPx += d.spec.heightPx
    }
  })
  let lines = 0
  section.forEach((block, offset) => {
    const b = engineBlockOf(block)
    lines += measure(b).lines + (pageTops.has(offset) ? 0 : PROFILE.elements[b.type].before)
  })
  return lines * PROFILE.screen.linePx + widgetPx
}

/**
 * Safeguard 2: a plain-DOM view for a section that writes `contain-intrinsic-size` from the engine. ProseMirror calls
 * `update` only for a section whose node or inner decorations changed. `onUpdate` counts those calls.
 */
export function createSectionView(onUpdate: () => void): NodeViewConstructor {
  return (node, _view, _getPos, _outer, inner) => {
    const dom = document.createElement('div')
    dom.className = 'section'
    const write = (n: Node, decos: DecorationSource): void => { dom.style.containIntrinsicSize = `auto ${intrinsicPx(n, decos)}px` }
    write(node, inner)
    let current = node
    return {
      dom,
      contentDOM: dom,
      update(next, _outerDecos, innerDecos) {
        if (next.type !== current.type) return false
        current = next
        write(next, innerDecos)
        onUpdate()
        return true
      },
    }
  }
}

// Safeguard 3: the sections holding the selection's anchor and head, and one on each side, are never skipped, so the
// browser's own caret movement always has laid-out lines to move into.
function keptSections(state: EditorState): number[] {
  const d = state.doc
  const kept = new Set<number>()
  for (const $p of [state.selection.$anchor, state.selection.$head]) {
    const i = $p.index(0)
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < d.childCount) kept.add(j)
  }
  return [...kept].toSorted((x, y) => x - y)
}

function keepSet(d: Node, kept: readonly number[]): DecorationSet {
  const out: Decoration[] = []
  let pos = 0
  let i = 0
  for (const want of kept) {
    for (; i < want; i++) pos += d.child(i).nodeSize
    out.push(Decoration.node(pos, pos + d.child(want).nodeSize, { class: 'keep' }))
  }
  return DecorationSet.create(d, out)
}

// The set is rebuilt only when the selection moves to another section or the document changes; positions are never
// mapped through steps, because the Yjs binding replaces the whole document on a remote change.
export const keepPlugin = new Plugin<{ key: string; set: DecorationSet }>({
  state: {
    init: (_, state) => { const kept = keptSections(state); return { key: kept.join(), set: keepSet(state.doc, kept) } },
    apply(tr, prev, _old, state) {
      const kept = keptSections(state)
      const key = kept.join()
      if (key === prev.key && !tr.docChanged) return prev
      return { key, set: keepSet(state.doc, kept) }
    },
  },
  props: { decorations(state) { return this.getState(state)?.set } },
})

// Safeguard 4: the browser's own command lands at the start of the last section when that section is skipped.
const toEdge = (end: boolean, extend: boolean): Command => (state, dispatch) => {
  const edge = end ? Selection.atEnd(state.doc) : Selection.atStart(state.doc)
  const sel = extend ? TextSelection.create(state.doc, state.selection.anchor, edge.head) : edge
  if (dispatch) dispatch(state.tr.setSelection(sel).scrollIntoView())
  return true
}

export const edgeKeymap = keymap({
  'Mod-ArrowDown': toEdge(true, false), 'Mod-ArrowUp': toEdge(false, false), 'Mod-End': toEdge(true, false), 'Mod-Home': toEdge(false, false),
  'Shift-Mod-ArrowDown': toEdge(true, true), 'Shift-Mod-ArrowUp': toEdge(false, true), 'Shift-Mod-End': toEdge(true, true), 'Shift-Mod-Home': toEdge(false, true),
})
