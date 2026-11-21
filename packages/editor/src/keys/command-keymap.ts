import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

interface CommandKeys {
  resolve: (event: KeyboardEvent) => string | null;
  run(id: string): boolean;
}

function runKey(
  view: EditorView,
  event: KeyboardEvent,
  keys: CommandKeys,
): boolean {
  if (view.composing || event.isComposing) return false;
  const id = keys.resolve(event);
  return id !== null && keys.run(id);
}

/**
 * Hands each key to `resolve`; a key it names a command for runs that command,
 * and when `run` answers true the browser's default is prevented and no later
 * keymap sees the key. While an input method composes every key is its own.
 * A read-only page gets the same keys, so a command there can say why it cannot run.
 */
export function commandKeymap(options: CommandKeys): Plugin {
  return new Plugin({
    props: {
      handleKeyDown: (view, event) => runKey(view, event, options),
      handleDOMEvents: {
        // a view that cannot be edited never calls handleKeyDown
        keydown(view, event) {
          if (view.editable || !runKey(view, event, options)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}
