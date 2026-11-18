// The editor's document: sections of blocks, or blocks alone for the flat baseline. One block node carries its
// element as an attribute and renders on the project's DOM contract.
import { Schema } from 'prosemirror-model'
import type { Node } from 'prosemirror-model'
import type { ElementType, EngineBlock } from './engine.ts'

const block = {
  content: 'text*',
  marks: '',
  attrs: { id: { default: null }, type: { default: 'action' } },
  toDOM: (node: Node) => ['p', { class: `el el-${node.attrs.type}`, 'data-type': node.attrs.type, 'data-id': node.attrs.id }, 0] as const,
  parseDOM: [{ tag: 'p.el', getAttrs: (dom: HTMLElement) => ({ id: dom.dataset.id ?? null, type: dom.dataset.type ?? 'action' }) }],
}

/** `doc → section+ → block+` when `sectioned`, else `doc → block+`. */
export function createSchema(sectioned: boolean): Schema {
  return new Schema({
    nodes: {
      doc: { content: sectioned ? 'section+' : 'block+' },
      ...(sectioned ? { section: { content: 'block+', toDOM: () => ['div', { class: 'section' }, 0] as const, parseDOM: [{ tag: 'div.section' }] } } : {}),
      block,
      text: {},
    },
  })
}

// Keyed by node identity, so an untouched block keeps its engine object and the engine's line cache.
const engineBlocks = new WeakMap<Node, EngineBlock>()

/** The engine's view of a block node; the same object for as long as the node is unchanged. */
export function engineBlockOf(node: Node): EngineBlock {
  let b = engineBlocks.get(node)
  if (!b) {
    b = { type: node.attrs.type as ElementType, text: node.textContent }
    engineBlocks.set(node, b)
  }
  return b
}

/** The engine objects of every block of `doc`, in order. */
export function engineBlocksOf(doc: Node): EngineBlock[] {
  const out: EngineBlock[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'block') return true
    out.push(engineBlockOf(node))
    return false
  })
  return out
}
