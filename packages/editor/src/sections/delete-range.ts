// Deleting a range without moving any block into another section.
import { Selection, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";

/**
 * Deletes from `from` to `to`. Within one block it is a plain delete. Across
 * blocks the first block keeps its id and attributes and takes the last
 * block's text after `to`; every block after it up to the last is deleted,
 * and so is every section left without a block. Ends outside a block move
 * inward to the nearest text position. The selection collapses at the join.
 */
export function deleteRangeKeepingSections(
  tr: Transaction,
  from: number,
  to: number,
): Transaction {
  const $a = Selection.near(tr.doc.resolve(from), 1).$from;
  const $z = Selection.near(tr.doc.resolve(to), -1).$to;
  if ($a.pos >= $z.pos)
    return tr.setSelection(TextSelection.create(tr.doc, $a.pos));
  if ($a.sameParent($z))
    return tr
      .delete($a.pos, $z.pos)
      .setSelection(TextSelection.create(tr.doc, $a.pos));
  // From the end backwards, so that every position read from $a and $z still holds.
  const zLast = $z.index(1) === $z.node(1).childCount - 1;
  if ($a.index(0) === $z.index(0)) tr.delete($a.after(2), $z.after(2));
  else if (zLast)
    tr.delete($a.after(1), $z.after(1)).delete($a.after(2), $a.end(1));
  else
    tr.delete($z.start(1), $z.after(2))
      .delete($a.after(1), $z.before(1))
      .delete($a.after(2), $a.end(1));
  return tr
    .replaceWith($a.pos, $a.end(), $z.parent.content.cut($z.parentOffset))
    .setSelection(TextSelection.create(tr.doc, $a.pos));
}
