// Exclude from timing and Include in timing over the blocks the selection touches.
import type { Node } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";

/** Each block the selection touches, with its position; a caret touches its own block. */
function touchedBlocks(state: EditorState): { node: Node; pos: number }[] {
  const { from, to } = state.selection;
  const blocks: { node: Node; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    blocks.push({ node, pos });
    return false;
  });
  return blocks;
}

/** An ordinary edit, undone as one step: sets `noTiming` on every touched block that differs. */
function setNoTiming(excluded: boolean): Command {
  return (state, dispatch) => {
    const targets = touchedBlocks(state).filter(
      ({ node }) => (node.attrs["noTiming"] === true) !== excluded,
    );
    if (targets.length === 0) return false;
    if (dispatch === undefined) return true;
    const tr = state.tr;
    for (const { pos } of targets)
      tr.setNodeAttribute(pos, "noTiming", excluded);
    dispatch(tr);
    return true;
  };
}

/** Excludes every block the selection touches from timing in one transaction; false when none changes. */
export const excludeFromTiming: Command = setNoTiming(true);

/** Includes every block the selection touches in timing in one transaction; false when none changes. */
export const includeInTiming: Command = setNoTiming(false);
