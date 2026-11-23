// Undo and redo, through the binding's history.
import type { ActionEntry } from "./action-types.ts";

export const undoEntry: ActionEntry<{ kind: "undo" }> = {
  readOnly: true,
  run: (view, _, context) =>
    context.history.undo(view.state, view.dispatch)
      ? { ok: true }
      : { ok: false, reason: "nothing_to_do" },
};

export const redoEntry: ActionEntry<{ kind: "redo" }> = {
  readOnly: true,
  run: (view, _, context) =>
    context.history.redo(view.state, view.dispatch)
      ? { ok: true }
      : { ok: false, reason: "nothing_to_do" },
};
