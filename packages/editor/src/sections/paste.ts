// Paste and drop: a slice's blocks go in without moving a block into another section.
import { schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import type { Node, Slice } from "prosemirror-model";
import { Selection, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { deleteRangeKeepingSections } from "./delete-range.ts";
import { insertBlocks } from "./insert-blocks.ts";

export const DROP_ORIGINS = ["outside", "moved"] as const;
export type DropOrigin = (typeof DROP_ORIGINS)[number];

/** Two or more blocks go in as blocks; one block, or inline content, goes in as text at the caret. */
function paste(tr: Transaction, slice: Slice, ids: IdSource): Transaction {
  const blocks: Node[] = [];
  slice.content.descendants((node) => {
    if (node.type !== schema.nodes.block) return true;
    blocks.push(node);
    return false;
  });
  if (blocks.length > 1)
    return insertBlocks(
      tr,
      blocks.map((block) => block.toJSON()),
      ids,
    );
  if (!tr.selection.empty)
    deleteRangeKeepingSections(tr, tr.selection.from, tr.selection.to);
  const inline = blocks[0]?.content ?? slice.content;
  const at = tr.selection.from;
  return tr
    .insert(at, inline)
    .setSelection(TextSelection.create(tr.doc, at + inline.size));
}

/** The slice's blocks in order, at the selection. */
export function pasteSlice(
  state: EditorState,
  slice: Slice,
  ids: IdSource,
): Transaction {
  return paste(state.tr, slice, ids);
}

/** A paste at `pos`; a slice dragged from this script is first deleted from where it was, and `pos` mapped past that. */
export function dropSlice(
  state: EditorState,
  slice: Slice,
  pos: number,
  origin: DropOrigin,
  ids: IdSource,
): Transaction {
  const tr = state.tr;
  if (origin === "moved")
    deleteRangeKeepingSections(tr, state.selection.from, state.selection.to);
  tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(pos))));
  return paste(tr, slice, ids);
}
