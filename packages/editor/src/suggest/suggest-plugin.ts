// Suggesting: while the person writes as suggestions, each edit of theirs becomes a proposal marked with their id;
// everyone's page draws the suggestions' bars and block changes.
import type { IdSource } from "@manent/schema";
import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
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
    },
    appendTransaction(trs, old, state) {
      const [first] = trs;
      if (first === undefined || !isOwnEdit(first, options)) return null;
      if (!options.isSuggesting() || options.isLocked()) return null;
      const touched = touchedBy(trs);
      return touched === null
        ? null
        : suggestEdit(old, state, touched, options);
    },
  });
}
