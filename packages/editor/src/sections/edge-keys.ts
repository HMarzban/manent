// The document's first and last positions, reached from the model: lines of a section the browser skips are not there to move through.
import { keymap } from "prosemirror-keymap";
import { Selection, TextSelection } from "prosemirror-state";
import type { Command, Plugin } from "prosemirror-state";

/** Moves the caret to the document's start or end, or extends the selection there, and scrolls it into view. */
export function toDocEdge(
  edge: "start" | "end",
  mode: "move" | "extend",
): Command {
  return (state, dispatch) => {
    const target =
      edge === "start"
        ? Selection.atStart(state.doc)
        : Selection.atEnd(state.doc);
    const selection =
      mode === "move"
        ? target
        : TextSelection.create(state.doc, state.selection.anchor, target.head);
    dispatch?.(state.tr.setSelection(selection).scrollIntoView());
    return true;
  };
}

const EDGE_KEYS = [
  ["Mod-ArrowUp", "start"],
  ["Mod-ArrowDown", "end"],
  ["Mod-Home", "start"],
  ["Mod-End", "end"],
  ["Ctrl-Home", "start"],
  ["Ctrl-End", "end"],
] as const;

/** Each edge key moves; with Shift it extends. */
export function edgeKeysPlugin(): Plugin {
  return keymap(
    Object.fromEntries(
      EDGE_KEYS.flatMap(([key, edge]) => [
        [key, toDocEdge(edge, "move")],
        [`Shift-${key}`, toDocEdge(edge, "extend")],
      ]),
    ),
  );
}
