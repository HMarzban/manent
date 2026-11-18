// The one way a command handler reaches the open editor.
import type { ActionResult, EditorAction } from "@manent/editor";

interface RunsActions {
  run(action: EditorAction): ActionResult;
}

export interface EditorControl {
  /** Returns its own detach; a second attach replaces the first. */
  attach(editor: RunsActions): () => void;
  /** Null: no editor is open. */
  run(action: EditorAction): ActionResult | null;
}

export function createEditorControl(): EditorControl {
  let attached: RunsActions | null = null;
  return {
    attach(editor) {
      attached = editor;
      return () => {
        if (attached === editor) attached = null;
      };
    },
    run: (action) => attached?.run(action) ?? null,
  };
}
