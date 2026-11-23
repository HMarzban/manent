import type { EditorView } from "prosemirror-view";
import type {
  ActionContext,
  ActionEntry,
  ActionResult,
} from "./action-types.ts";
import { EDITOR_ACTIONS } from "./registry.ts";
import type { EditorAction } from "./registry.ts";

/**
 * Runs `action` on the view. On a page that is not editable everything but undo, redo, finding and moving the caret is
 * `read_only`. Finding, moving the caret and a synopsis are loaded apart the first time one is asked for, so they
 * answer `ok` at once and run when loaded.
 */
export function runAction(
  view: EditorView,
  action: EditorAction,
  context: ActionContext,
): ActionResult {
  // the entry under an action's kind runs actions of that kind
  const entry: ActionEntry<EditorAction> = EDITOR_ACTIONS[action.kind];
  if (!context.editable() && !entry.readOnly)
    return { ok: false, reason: "read_only" };
  return entry.run(view, action, context);
}
