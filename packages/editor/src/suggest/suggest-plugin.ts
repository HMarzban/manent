// Suggesting: while the person writes as suggestions, each edit of theirs becomes a proposal marked with their id;
// everyone's page draws the suggestions' bars and struck removed blocks.
import type { IdSource } from "@manent/schema";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
import { suggestEdit } from "./rewrite.ts";
import { nextSuggestionMarks, suggestionMarksOf } from "./suggestion-marks.ts";
import type { SuggestionBar } from "./suggestion-marks.ts";
import { touchedBy } from "./touched.ts";

export interface SuggestOptions {
  userId: string;
  now: () => number;
  /** The ids of new suggestions. */
  ids: IdSource;
  /** True while the person's Writing position is As suggestions. */
  isSuggesting(): boolean;
  /** True once the script's page numbers are locked, when nothing is suggested. */
  isLocked(): boolean;
  /** True for a transaction the CRDT made: another person's change, an undo or a redo, which is never suggested. */
  isFromBinding(tr: Transaction): boolean;
  bar: SuggestionBar;
}

const suggestKey = new PluginKey<DecorationSet>("suggest");

/** True for the person's own edit, made here by typing or a command. */
function isOwnEdit(tr: Transaction, options: SuggestOptions): boolean {
  return (
    tr.docChanged &&
    tr.getMeta("appendedTransaction") === undefined &&
    tr.getMeta("addToHistory") !== false &&
    !options.isFromBinding(tr)
  );
}

const isActive = (options: SuggestOptions): boolean =>
  options.isSuggesting() && !options.isLocked();

/** The deletion one plain Backspace or Delete makes inside text: a character before or after the caret. */
function characterAt(
  state: EditorState,
  event: KeyboardEvent,
): { from: number; to: number } | null {
  const backward = event.key === "Backspace";
  if (!backward && event.key !== "Delete") return null;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return null;
  const { $from, empty } = state.selection;
  const text = backward ? $from.nodeBefore?.text : $from.nodeAfter?.text;
  if (!empty || text === undefined) return null;
  const size = (backward ? Array.from(text).at(-1) : Array.from(text)[0])
    ?.length;
  if (size === undefined) return null;
  return backward
    ? { from: $from.pos - size, to: $from.pos }
    : { from: $from.pos, to: $from.pos + size };
}

/**
 * Backspace and Delete inside text are written here as transactions: the browser's own deletion may draw the struck
 * text beside it again, and text read back from the page loses its suggestion.
 */
function deleteCharacter(view: EditorView, event: KeyboardEvent): boolean {
  const range = view.editable ? characterAt(view.state, event) : null;
  if (range === null) return false;
  view.dispatch(view.state.tr.delete(range.from, range.to).scrollIntoView());
  return true;
}

export function suggestPlugin(options: SuggestOptions): Plugin {
  const { bar } = options;
  return new Plugin<DecorationSet>({
    key: suggestKey,
    state: {
      init: (_config, state) => suggestionMarksOf(state.doc, bar),
      apply(tr, set) {
        const touched = tr.docChanged ? touchedBy([tr]) : null;
        return touched === null
          ? set
          : nextSuggestionMarks(set, tr.doc, touched, bar);
      },
    },
    props: {
      decorations: (state) => suggestKey.getState(state),
      handleKeyDown: (view, event) =>
        isActive(options) && deleteCharacter(view, event),
    },
    appendTransaction(trs, old, state) {
      const [first] = trs;
      if (first === undefined || !isOwnEdit(first, options)) return null;
      if (!isActive(options)) return null;
      const touched = touchedBy(trs);
      return touched === null
        ? null
        : suggestEdit(old, state, touched, options);
    },
  });
}
