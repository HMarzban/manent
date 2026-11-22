// The Find bar's marks in the page and its count. What looks for the text loads apart, with its matcher, and hands the
// plugin each state; page furniture is never text of the document, so it never matches.
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";

export interface Match {
  readonly from: number;
  readonly to: number;
}

/** What the Find bar has found in one state of the document. */
export interface FindState {
  /** In document order. */
  readonly matches: readonly Match[];
  /** The index of the match the selection holds; null when it holds none. */
  readonly current: number | null;
  readonly decorations: DecorationSet;
  /** The state after `tr`, found in the state `tr` leaves. */
  next(tr: Transaction, state: EditorState): FindState;
}

/** Null while nothing is looked for. A transaction's meta under this key sets it: what was found before it, or null. */
export const findKey = new PluginKey<FindState | null>("find");

export function findPlugin(): Plugin<FindState | null> {
  return new Plugin<FindState | null>({
    key: findKey,
    state: {
      init: () => null,
      apply(tr, find, _, state) {
        const set: FindState | null | undefined = tr.getMeta(findKey);
        const before = set === undefined ? find : set;
        return before === null ? null : before.next(tr, state);
      },
    },
    props: {
      decorations: (state) => findKey.getState(state)?.decorations ?? null,
    },
  });
}

/** How many matches there are, and which of them the selection holds (from 1); 0 and null while nothing is looked for. */
export function findCount(state: EditorState): {
  count: number;
  current: number | null;
} {
  const find = findKey.getState(state) ?? null;
  if (find === null) return { count: 0, current: null };
  return {
    count: find.matches.length,
    current: find.current === null ? null : find.current + 1,
  };
}
