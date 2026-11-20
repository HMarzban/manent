import { Plugin } from "prosemirror-state";

/**
 * Hands each key to `resolve`; a key it names a command for runs that command,
 * and when `run` answers true the browser's default is prevented and no later
 * keymap sees the key. While an input method composes every key is its own.
 */
export function commandKeymap(options: {
  resolve: (event: KeyboardEvent) => string | null;
  run(id: string): boolean;
}): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        const id = options.resolve(event);
        return id !== null && options.run(id);
      },
    },
  });
}
