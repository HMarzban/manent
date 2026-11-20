// Typed shortcuts: typed text goes in made safe, then a line whose text names another element becomes it, as its own undo step.
import { sanitizeText } from "@manent/pagination";
import type { ResolvedPos } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { detectTyped } from "../elements/index.ts";
import type { ElementRef } from "../elements/index.ts";
import { typeOverSelection } from "../sections/plugin.ts";
import { convertElement, elementOf } from "./element-keys.ts";
import type { ElementContext } from "./element-keys.ts";

// sanitizeText keeps line ends for pasted text; no control character is ever typed into a line.
const CONTROL = /\p{Cc}/gu;

function insertion(state: EditorState, from: number, to: number, text: string) {
  return (
    typeOverSelection(state, from, to, text) ??
    state.tr.insertText(text, from, to)
  );
}

/** The element of the block before the one `$at` is in, in this section or the one before; null in the first block. */
function previousElement($at: ResolvedPos): ElementRef | null {
  const section = $at.index(1);
  const before =
    section > 0
      ? $at.node(1).child(section - 1)
      : ($at.node(0).maybeChild($at.index(0) - 1)?.lastChild ?? null);
  if (before === null) return null;
  return elementOf(String(before.attrs.type), before.attrs.kind);
}

/** Typing: sanitised text is inserted by its own transaction, then the line may convert. */
export function detectPlugin(context: ElementContext): Plugin {
  return new Plugin({
    props: {
      handleTextInput: (view, from, to, typed) => {
        if (view.composing) return false;
        const text = sanitizeText(typed).replace(CONTROL, "");
        if (text === "") return true;
        view.dispatch(insertion(view.state, from, to, text).scrollIntoView());
        const { $head } = view.state.selection;
        const block = $head.parent;
        const detected = detectTyped(
          context.format(),
          elementOf(String(block.attrs.type), block.attrs.kind),
          previousElement($head),
          block.textContent,
        );
        if (detected !== null) convertElement(view, context.history, detected);
        return true;
      },
    },
  });
}
