// The one way a command handler reaches the open editor.
import type { ActionResult } from "@manent/editor";
import type { PageRequest } from "./command-actions.ts";

interface ControlledEditor {
  run(request: PageRequest): ActionResult;
  /** Null: Ink, which has no pages. */
  zoomPercent(): number | null;
}

export interface EditorControl {
  /** Returns its own detach; a second attach replaces the first. */
  attach(editor: ControlledEditor): () => void;
  /** Null: no editor is open. */
  run(request: PageRequest): ActionResult | null;
  /** The percent the open page is drawn at; null when no editor is open or the script is Ink. */
  zoomPercent(): number | null;
}

export function createEditorControl(): EditorControl {
  let attached: ControlledEditor | null = null;
  return {
    attach(editor) {
      attached = editor;
      return () => {
        if (attached === editor) attached = null;
      };
    },
    run: (request) => attached?.run(request) ?? null,
    zoomPercent: () => attached?.zoomPercent() ?? null,
  };
}
