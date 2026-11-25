// The blocks a selection covers and moving them to cuts as one transaction.
import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

function isBlockTouched(node: Node, pos: number, state: EditorState): boolean {
  const { from, to, $from, $to } = state.selection;
  if ($from.parent === node && $to.parent === node) return true;
  if (node.content.size === 0)
    return $from.parent === node || (from <= pos && to >= pos + node.nodeSize);
  const contentFrom = pos + 1;
  const contentTo = contentFrom + node.content.size;
  return Math.min(to, contentTo) > Math.max(from, contentFrom);
}

/**
 * The block IDs the selection touches, in document order; empty when nothing is selected. A selection inside one
 * block returns that block's ID; a selection ending at offset 0 of a non-empty following block leaves it out.
 */
export function selectedBlockIds(state: EditorState): string[] {
  if (state.selection.empty) return [];
  const { from, to } = state.selection;
  const ids: string[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    const id: unknown = node.attrs.id;
    if (typeof id === "string" && isBlockTouched(node, pos, state))
      ids.push(id);
    return false;
  });
  return ids;
}

/**
 * Moves every block covered by `view`'s selection to cuts through `commit`, which writes the cut and removes the
 * blocks in one transaction, then returns focus to the page; false when the view is not editable or nothing is selected.
 */
export function moveSelectionToCuts(
  view: EditorView,
  commit: (blockIds: readonly string[]) => boolean,
): boolean {
  if (!view.editable) return false;
  const ids = selectedBlockIds(view.state);
  if (ids.length === 0) return false;
  if (!commit(ids)) return false;
  view.focus();
  return true;
}
