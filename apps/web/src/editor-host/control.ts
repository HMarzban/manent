// The one way a command handler reaches the open editor.
import type { ActionResult } from "@manent/editor";
import type { PageRequest } from "./command-actions.ts";

interface ControlledEditor {
  run(request: PageRequest): ActionResult;
  /** Null: Ink, which has no pages. */
  zoomPercent(): number | null;
  showTitlePage(): void;
}

export interface EditorControl {
  /**
   * Returns its own detach. The editor attached last is the one reached; its detach removes only it, so the one
   * attached before it is reached again.
   */
  attach(editor: ControlledEditor): () => void;
  /** Null: no editor is open. */
  run(request: PageRequest): ActionResult | null;
  /** The percent the open page is drawn at; null when no editor is open or the script is Ink. */
  zoomPercent(): number | null;
  /** Scrolls the open page to its title page; nothing when no editor is open or it has none. */
  showTitlePage(): void;
}

export function createEditorControl(): EditorControl {
  // in attach order; each attach is its own entry, so a detach called twice removes nothing the second time
  const attached: { editor: ControlledEditor }[] = [];
  const last = (): ControlledEditor | null => attached.at(-1)?.editor ?? null;
  return {
    attach(editor) {
      const entry = { editor };
      attached.push(entry);
      return () => {
        const at = attached.indexOf(entry);
        if (at !== -1) attached.splice(at, 1);
      };
    },
    run: (request) => last()?.run(request) ?? null,
    zoomPercent: () => last()?.zoomPercent() ?? null,
    showTitlePage: () => last()?.showTitlePage(),
  };
}
