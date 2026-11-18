// Section-aware editing: Backspace, Delete, Enter, typing over a selection, paste, cut and drop never move an existing
// block to another section, so a section is never visible to the person writing. Inside one section the stock commands
// are used.
import { TextSelection } from 'prosemirror-state'
import type { Command, Transaction } from 'prosemirror-state'
import { Fragment } from 'prosemirror-model'
import type { Node, ResolvedPos, Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

export interface Editing {
  sectionBackspace: Command
  sectionDelete: Command
  sectionEnter: Command
  handlePaste: (view: EditorView, event: ClipboardEvent, slice: Slice) => boolean
  handleDrop: (view: EditorView, event: DragEvent, slice: Slice, moved: boolean) => boolean
  handleTextInput: (view: EditorView, from: number, to: number, text: string) => boolean
  handleCut: (view: EditorView, event: ClipboardEvent) => boolean
  /** Inserts `blocks` at `pos` under the paste rule and leaves the caret after the last of them. */
  insertBlocks: (tr: Transaction, pos: number, blocks: readonly Node[]) => Transaction
}

// Every position of a sectioned document inside text has the block at depth 2 and its section at depth 1.
const BLOCK_DEPTH = 2

function blocksOf(slice: Slice): Node[] {
  const out: Node[] = []
  slice.content.descendants((node) => {
    if (node.type.name !== 'block') return true
    out.push(node)
    return false
  })
  return out
}

/**
 * The editing commands and view props for sections of `wrap` blocks. Every new block takes its id from `newId`.
 */
export function createEditing(options: { wrap: number; newId: () => string }): Editing {
  const { wrap, newId } = options
  const fresh = (block: Node): Node => block.type.create({ ...block.attrs, id: newId() }, block.content)
  const emptyLike = (block: Node): Node => block.type.create({ id: newId(), type: block.attrs.type })

  // A new block after the caret's block: in its section, unless that section is full and the block would be its last,
  // in which case it opens a new section after it. Returns the start of the new block's text.
  function addAfter(tr: Transaction, $in: ResolvedPos, block: Node): number {
    const section = $in.node(1)
    if ($in.index(1) === section.childCount - 1 && section.childCount >= wrap) {
      const at = $in.after(1)
      tr.insert(at, section.type.create(null, block))
      return at + 2
    }
    const at = $in.after(BLOCK_DEPTH)
    tr.insert(at, block)
    return at + 1
  }

  // Joins block `b` (starting at `bPos`) onto the end of the block whose content ends at `aEnd`, deleting `b`, or `b`'s
  // section when `b` was its only block.
  function joinAcross(tr: Transaction, aEnd: number, bPos: number): void {
    const $b = tr.doc.resolve(bPos + 1)
    const b = $b.parent
    if ($b.node(1).childCount === 1) tr.delete($b.before(1), $b.after(1))
    else tr.delete(bPos, bPos + b.nodeSize)
    tr.insert(aEnd, b.content)
    tr.setSelection(TextSelection.create(tr.doc, aEnd))
  }

  // Deletes a selection whose ends lie in different sections: each end section keeps its own blocks, the sections
  // between go, and the two end blocks are joined once.
  function deleteAcross(tr: Transaction, from: number, to: number): void {
    const $from = tr.doc.resolve(from)
    const $to = tr.doc.resolve(to)
    // highest range first, so each lower position still holds
    tr.delete($to.start(1), to)
    tr.delete($from.after(1), $to.before(1))
    tr.delete(from, $from.end(1))
    joinAcross(tr, from, tr.doc.resolve(from).after(1) + 1)
  }

  const crossesSections = (doc: Node, from: number, to: number): boolean => {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    return $from.depth >= BLOCK_DEPTH && $to.depth >= BLOCK_DEPTH && $from.index(0) !== $to.index(0)
  }

  function deleteSelection(tr: Transaction): void {
    const { from, to } = tr.selection
    if (crossesSections(tr.doc, from, to)) deleteAcross(tr, from, to)
    else tr.deleteSelection()
  }

  const deleteSelectionAcross: Command = (state, dispatch) => {
    if (!crossesSections(state.doc, state.selection.from, state.selection.to)) return false
    if (dispatch) {
      const tr = state.tr
      deleteAcross(tr, state.selection.from, state.selection.to)
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  const sectionBackspace: Command = (state, dispatch) => {
    if (!state.selection.empty) return deleteSelectionAcross(state, dispatch)
    const $c = state.selection instanceof TextSelection ? state.selection.$cursor : null
    if (!$c || $c.depth < BLOCK_DEPTH || $c.parentOffset > 0 || $c.index(1) > 0 || $c.index(0) === 0) return false
    if (dispatch) {
      const tr = state.tr
      joinAcross(tr, $c.before(1) - 2, $c.before(BLOCK_DEPTH))
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  const sectionDelete: Command = (state, dispatch) => {
    if (!state.selection.empty) return deleteSelectionAcross(state, dispatch)
    const $c = state.selection instanceof TextSelection ? state.selection.$cursor : null
    if (!$c || $c.depth < BLOCK_DEPTH || $c.parentOffset < $c.parent.content.size) return false
    if ($c.index(1) < $c.node(1).childCount - 1 || $c.index(0) === state.doc.childCount - 1) return false
    if (dispatch) {
      const tr = state.tr
      joinAcross(tr, $c.pos, $c.after(1) + 1)
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  const sectionEnter: Command = (state, dispatch) => {
    if (state.selection.$from.depth < BLOCK_DEPTH) return false
    if (!dispatch) return true
    const tr = state.tr
    deleteSelection(tr)
    const $c = tr.selection.$from
    const block = $c.parent
    if ($c.parentOffset === 0 && block.content.size > 0) {
      tr.insert($c.before(BLOCK_DEPTH), emptyLike(block))
    } else if ($c.parentOffset === block.content.size) {
      const at = addAfter(tr, $c, emptyLike(block))
      tr.setSelection(TextSelection.create(tr.doc, at))
    } else {
      const tail = block.type.create({ id: newId(), type: block.attrs.type }, block.content.cut($c.parentOffset))
      tr.delete($c.pos, $c.end())
      const at = addAfter(tr, tr.doc.resolve($c.pos), tail)
      tr.setSelection(TextSelection.create(tr.doc, at))
    }
    dispatch(tr.scrollIntoView())
    return true
  }

  function insertBlocks(tr: Transaction, pos: number, blocks: readonly Node[]): Transaction {
    const nodes = blocks.map(fresh)
    const $p = TextSelection.near(tr.doc.resolve(pos)).$head
    const sectioned = $p.depth >= BLOCK_DEPTH
    const blockDepth = $p.depth
    const container = $p.node(blockDepth - 1)
    const atEnd = $p.parentOffset === $p.parent.content.size
    let end: number
    if (sectioned && atEnd && $p.index(1) === container.childCount - 1) {
      // after the section: new sections of `wrap` blocks
      const sections: Node[] = []
      for (let i = 0; i < nodes.length; i += wrap) sections.push(container.type.create(null, nodes.slice(i, i + wrap)))
      const at = $p.after(1)
      tr.insert(at, sections)
      end = at + Fragment.from(sections).size - 2
    } else {
      // in place, inside the caret's section, splitting the caret's block when the caret is inside its text
      let at: number
      if (atEnd) at = $p.after(blockDepth)
      else if ($p.parentOffset === 0) at = $p.before(blockDepth)
      else {
        tr.split($p.pos, 1, [{ type: $p.parent.type, attrs: { id: newId(), type: $p.parent.attrs.type } }])
        at = $p.pos + 1
      }
      tr.insert(at, nodes)
      end = at + Fragment.from(nodes).size - 1
    }
    return tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView()
  }

  function handlePaste(view: EditorView, _event: ClipboardEvent, slice: Slice): boolean {
    const blocks = blocksOf(slice)
    if (blocks.length < 2) return false
    const tr = view.state.tr
    deleteSelection(tr)
    view.dispatch(insertBlocks(tr, tr.selection.from, blocks))
    return true
  }

  function handleDrop(view: EditorView, event: DragEvent, slice: Slice, moved: boolean): boolean {
    const blocks = blocksOf(slice)
    const target = view.posAtCoords({ left: event.clientX, top: event.clientY })
    if (blocks.length < 2 || !target) return false
    const tr = view.state.tr
    if (moved) deleteSelection(tr)
    view.dispatch(insertBlocks(tr, tr.mapping.map(target.pos), blocks))
    return true
  }

  // Typing over a selection whose ends lie in different sections; inside one section the default insert is used.
  function handleTextInput(view: EditorView, from: number, to: number, text: string): boolean {
    if (!crossesSections(view.state.doc, from, to)) return false
    const tr = view.state.tr
    deleteAcross(tr, from, to)
    view.dispatch(tr.insertText(text).scrollIntoView())
    return true
  }

  // A cut across sections fills the clipboard as the view's own cut does, then deletes by `deleteAcross`.
  function handleCut(view: EditorView, event: ClipboardEvent): boolean {
    const { from, to } = view.state.selection
    if (!event.clipboardData || !crossesSections(view.state.doc, from, to)) return false
    const { dom, text } = view.serializeForClipboard(view.state.selection.content())
    event.preventDefault()
    event.clipboardData.clearData()
    event.clipboardData.setData('text/html', dom.innerHTML)
    event.clipboardData.setData('text/plain', text)
    const tr = view.state.tr
    deleteAcross(tr, from, to)
    view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'cut'))
    return true
  }

  return { sectionBackspace, sectionDelete, sectionEnter, handlePaste, handleDrop, handleTextInput, handleCut, insertBlocks }
}
