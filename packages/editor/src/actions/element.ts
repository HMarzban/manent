import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionResult } from "./action-types.ts";
import { changeSelectedBlocks } from "./layout.ts";

/** Every block the selection touches becomes `element`; its kind is null but on an act break. */
export function setElement(
  state: EditorState,
  element: { type: string; kind: string | null },
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  changeSelectedBlocks(
    state,
    () => ({ type: element.type, kind: element.kind }),
    dispatch,
  );
  return { ok: true };
}
