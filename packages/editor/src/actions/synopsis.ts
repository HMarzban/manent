// A scene's synopsis, written to its heading's own attribute in one undo step.
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionResult } from "./action-types.ts";

/** The position of the element `blockId`; null when no element has it. */
function positionOf(state: EditorState, blockId: string): number | null {
  let found: number | null = null;
  state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isTextblock) return true;
    if (node.attrs.id === blockId) found = pos;
    return false;
  });
  return found;
}

/** Sets the synopsis of the heading `blockId`; `nothing_to_do` when it already reads `text` or no element has the id. */
export function setSynopsis(
  state: EditorState,
  blockId: string,
  text: string,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const at = positionOf(state, blockId);
  if (at === null || state.doc.nodeAt(at)?.attrs.synopsis === text)
    return { ok: false, reason: "nothing_to_do" };
  dispatch(state.tr.setNodeAttribute(at, "synopsis", text));
  return { ok: true };
}
