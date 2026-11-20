import { keydownHandler } from "prosemirror-keymap";
import { Plugin } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import type { HistoryPort } from "../script-editor/ports.ts";

/**
 * Undo and redo from the keys and from the browser's own history (its Edit
 * menu), through `history`. The key or event is taken even when there is
 * nothing to undo, so the browser's history never touches the page. While an
 * input method composes they are its own.
 */
export function historyKeysPlugin(options: {
  history: HistoryPort;
  platform: "mac" | "windows" | "linux";
}): Plugin {
  const { history, platform } = options;
  const undo: Command = (state, dispatch) => {
    history.undo(state, dispatch);
    return true;
  };
  const redo: Command = (state, dispatch) => {
    history.redo(state, dispatch);
    return true;
  };
  const mod = platform === "mac" ? "Meta" : "Ctrl";
  const keys = keydownHandler({
    [`${mod}-z`]: undo,
    [`Shift-${mod}-z`]: redo,
    ...(platform === "mac" ? {} : { [`${mod}-y`]: redo }),
  });
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        return keys(view, event);
      },
      handleDOMEvents: {
        beforeinput(view, event) {
          const step =
            event.inputType === "historyUndo"
              ? undo
              : event.inputType === "historyRedo"
                ? redo
                : null;
          if (view.composing || step === null) return false;
          event.preventDefault();
          return step(view.state, view.dispatch);
        },
      },
    },
  });
}
