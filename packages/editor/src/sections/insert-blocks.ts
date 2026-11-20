// Blocks put in at the selection, each with a new id, without moving a block into another section.
import {
  DEFAULT_BLOCK_ATTRS,
  SECTION_TARGET_BLOCKS,
  attrsForSplitTail,
  isBlockId,
  parseDoc,
  schema,
} from "@manent/schema";
import type { BlockAttrs, BlockJSON, IdSource } from "@manent/schema";
import type { Node, ResolvedPos } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { sameElement } from "./commands.ts";
import { deleteRangeKeepingSections } from "./delete-range.ts";

// The block node declares every attribute with a default, so its attrs hold every key.
function attrsOf(block: Node): BlockAttrs {
  return { ...DEFAULT_BLOCK_ATTRS, ...block.attrs };
}

/**
 * The blocks as this build reads them, each given a new id, or with `keep` its own when it is a valid one.
 * Throws a RangeError when one is malformed.
 */
function freshBlocks(
  blocks: readonly BlockJSON[],
  ids: IdSource,
  keep: boolean,
): Node[] {
  const content = blocks.map((block) => {
    const own = block.attrs?.id;
    const id = keep && isBlockId(own) ? own : ids();
    return { ...block, attrs: { ...block.attrs, id } };
  });
  const nodes: Node[] = [];
  parseDoc({ type: "doc", content: [{ type: "section", content }] })
    .child(0)
    .forEach((block) => nodes.push(block));
  return nodes;
}

function sizeOf(blocks: readonly Node[]): number {
  return blocks.reduce((size, block) => size + block.nodeSize, 0);
}

/**
 * Puts `blocks` after the block `$inside` is in: in new sections of at most
 * SECTION_TARGET_BLOCKS after its section when that block ends the section,
 * in its section otherwise. Returns the position at the end of the last one.
 */
function placeAfter(
  tr: Transaction,
  $inside: ResolvedPos,
  blocks: readonly Node[],
): number {
  if ($inside.index(1) < $inside.node(1).childCount - 1) {
    tr.insert($inside.after(2), blocks);
    return $inside.after(2) + sizeOf(blocks) - 1;
  }
  const sections: Node[] = [];
  for (let i = 0; i < blocks.length; i += SECTION_TARGET_BLOCKS)
    sections.push(
      schema.nodes.section.create(
        null,
        blocks.slice(i, i + SECTION_TARGET_BLOCKS),
      ),
    );
  tr.insert($inside.after(1), sections);
  return $inside.after(1) + sizeOf(sections) - 2;
}

/**
 * Inserts `blocks` at the selection, deleting a selection first. Every block
 * gets a new id and keeps its other attributes. An empty caret block takes the
 * first block's element, kind and text, and the rest follow it in its section.
 * At a block's start the blocks go before it in its section, at its end after
 * it, and in its middle between its two halves as Enter splits them, in its
 * section. The caret ends at the end of the last inserted block. With `keepIds`
 * each block keeps a valid id of its own (a cut moved back in).
 */
export function insertBlocks(
  tr: Transaction,
  blocks: readonly BlockJSON[],
  ids: IdSource,
  options?: { keepIds?: boolean },
): Transaction {
  if (!tr.selection.empty)
    deleteRangeKeepingSections(tr, tr.selection.from, tr.selection.to);
  if (blocks.length === 0) return tr;
  const nodes = freshBlocks(blocks, ids, options?.keepIds === true);
  const $caret = tr.selection.$from;
  const block = $caret.parent;
  if (block.content.size === 0) {
    const first = nodes[0]!;
    const rest = nodes.slice(1);
    tr.insert($caret.pos, first.content).setNodeMarkup($caret.before(2), null, {
      ...block.attrs,
      type: first.attrs.type,
      kind: first.attrs.kind,
    });
    const at = $caret.after(2) + first.content.size;
    tr.insert(at, rest);
    return tr.setSelection(TextSelection.create(tr.doc, at + sizeOf(rest) - 1));
  }
  if ($caret.parentOffset === 0) {
    tr.insert($caret.before(2), nodes);
    return tr.setSelection(
      TextSelection.create(tr.doc, $caret.before(2) + sizeOf(nodes) - 1),
    );
  }
  if ($caret.parentOffset === block.content.size) {
    const end = placeAfter(tr, $caret, nodes);
    return tr.setSelection(TextSelection.create(tr.doc, end));
  }
  const origin = attrsOf(block);
  const id = ids();
  const tail = schema.nodes.block.create(
    attrsForSplitTail(
      origin,
      sameElement(origin, "middle"),
      id,
      ids().slice(0, 6),
    ),
    block.content.cut($caret.parentOffset),
  );
  const at = $caret.pos + 1;
  tr.delete($caret.pos, $caret.end()).insert(at, [...nodes, tail]);
  return tr.setSelection(TextSelection.create(tr.doc, at + sizeOf(nodes) - 1));
}
