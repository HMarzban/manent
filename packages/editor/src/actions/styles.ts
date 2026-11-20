// Inline formatting: the style marks, and the named text colour and highlight.
import { schema } from "@manent/schema";
import { toggleMark } from "prosemirror-commands";
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionResult, StyleMark } from "./action-types.ts";

export function toggleStyle(
  state: EditorState,
  mark: StyleMark,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  return toggleMark(schema.marks[mark])(state, dispatch)
    ? { ok: true }
    : { ok: false, reason: "nothing_to_do" };
}

/**
 * Gives the selection the `color` or `highlight` mark with `value`, in place of
 * another value; null removes the mark. With an empty selection the stored
 * marks change instead.
 */
export function setNamedMark(
  state: EditorState,
  name: "color" | "highlight",
  value: string | null,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const type = schema.marks[name];
  const tr = state.tr;
  if (state.selection.empty) {
    if (value === null) tr.removeStoredMark(type);
    else tr.addStoredMark(type.create({ value }));
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      if (value === null) tr.removeMark($from.pos, $to.pos, type);
      else tr.addMark($from.pos, $to.pos, type.create({ value }));
    }
  }
  if (tr.docChanged || tr.storedMarksSet) dispatch?.(tr);
  return { ok: true };
}
