// What the Find bar asks of the page: the text to look for, the next or previous match, and replacing; loaded apart
// from the editor with the matcher, the first time something is looked for.
import { SearchQuery } from "prosemirror-search";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { ActionResult, EditorAction } from "../actions/action-types.ts";
import { findKey } from "./find-plugin.ts";
import type { FindState, Match } from "./find-plugin.ts";

/** The actions this module runs. */
export type FindAction = Extract<
  EditorAction,
  { kind: "find" | "find_next" | "find_previous" | "replace" | "replace_all" }
>;

const select = (tr: Transaction, match: Match): Transaction =>
  tr
    .setSelection(TextSelection.create(tr.doc, match.from, match.to))
    .scrollIntoView();

/** Every match of `query`, in document order. */
function matchesOf(state: EditorState, query: SearchQuery): Match[] {
  const matches: Match[] = [];
  if (!query.valid) return matches;
  const end = state.doc.content.size;
  for (let pos = 0; pos < end;) {
    const next = query.findNext(state, pos, end);
    if (next === null) break;
    matches.push({ from: next.from, to: next.to });
    pos = Math.max(next.to, pos + 1);
  }
  return matches;
}

function currentOf(
  matches: readonly Match[],
  state: EditorState,
): number | null {
  const { from, to } = state.selection;
  const at = matches.findIndex((m) => m.from === from && m.to === to);
  return at === -1 ? null : at;
}

/**
 * What `query` finds in `state`. A change to the document looks for every match again, as prosemirror-search's own
 * plugin does: a walk of the document while the Find bar holds text.
 */
function foundIn(
  state: EditorState,
  query: SearchQuery,
  matches: readonly Match[],
): FindState {
  const current = currentOf(matches, state);
  const found: FindState = {
    matches,
    current,
    decorations: DecorationSet.create(
      state.doc,
      matches.map((m, i) =>
        Decoration.inline(
          m.from,
          m.to,
          i === current
            ? { class: "mn-find", "data-current": "" }
            : { class: "mn-find" },
        ),
      ),
    ),
    next(tr, after) {
      if (tr.docChanged) return foundIn(after, query, matchesOf(after, query));
      if (!tr.selectionSet || currentOf(matches, after) === current)
        return found;
      return foundIn(after, query, matches);
    },
  };
  return found;
}

/** Sets the query and selects its first match from the selection's start on, going round the document's end. */
function setQuery(view: EditorView, query: SearchQuery | null): void {
  const { state } = view;
  const found =
    query === null ? null : foundIn(state, query, matchesOf(state, query));
  const tr = state.tr.setMeta(findKey, found);
  const { from } = state.selection;
  const first = found?.matches.find((m) => m.from >= from) ?? found?.matches[0];
  view.dispatch(first === undefined ? tr : select(tr, first));
}

/**
 * Sets the text looked for, matched as typed and without regard to case, and selects its first match from the
 * selection's start on; an empty text matches nothing and moves nothing.
 */
function findText(view: EditorView, search: string): void {
  setQuery(
    view,
    search === ""
      ? null
      : new SearchQuery({ search, literal: true, caseSensitive: false }),
  );
}

/** The match after the selection (`1`) or before it (`-1`), going round the document's end. */
function stepFrom(
  state: EditorState,
  matches: readonly Match[],
  direction: 1 | -1,
): Match | null {
  const { from, to } = state.selection;
  if (direction === 1)
    return matches.find((m) => m.from >= to && m.to > to) ?? matches[0] ?? null;
  return (
    matches.findLast((m) => m.to <= from && m.from < from) ??
    matches.at(-1) ??
    null
  );
}

/** Selects the next or the previous match and scrolls to it. */
function findStep(
  state: EditorState,
  direction: 1 | -1,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const find = findKey.getState(state) ?? null;
  const match = find === null ? null : stepFrom(state, find.matches, direction);
  if (match === null) return { ok: false, reason: "nothing_to_do" };
  dispatch(select(state.tr, match));
  return { ok: true };
}

/** Replaces the match the selection holds and selects the next; with none held, selects the next match. */
function replaceMatch(
  state: EditorState,
  text: string,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const find = findKey.getState(state) ?? null;
  if (find === null || find.matches.length === 0)
    return { ok: false, reason: "nothing_to_do" };
  if (find.current === null) return findStep(state, 1, dispatch);
  const held = find.matches[find.current]!;
  const tr = state.tr.insertText(text, held.from, held.to);
  const next = find.matches[find.current + 1] ?? find.matches[0]!;
  if (next !== held) {
    const from = tr.mapping.map(next.from, 1);
    const to = tr.mapping.map(next.to, -1);
    tr.setSelection(TextSelection.create(tr.doc, from, to));
  }
  dispatch(tr.scrollIntoView());
  return { ok: true };
}

/** Replaces every match, in one undo step. */
function replaceAll(
  state: EditorState,
  text: string,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const matches = findKey.getState(state)?.matches ?? [];
  if (matches.length === 0) return { ok: false, reason: "nothing_to_do" };
  const tr = state.tr;
  for (const match of matches.toReversed())
    tr.insertText(text, match.from, match.to);
  dispatch(tr);
  return { ok: true };
}

/** Runs a Find bar action on the view as it is now. */
export function runFind(view: EditorView, action: FindAction): ActionResult {
  const { state, dispatch } = view;
  switch (action.kind) {
    case "find":
      findText(view, action.search);
      return { ok: true };
    case "find_next":
      return findStep(state, 1, dispatch);
    case "find_previous":
      return findStep(state, -1, dispatch);
    case "replace":
      return replaceMatch(state, action.text, dispatch);
    case "replace_all":
      return replaceAll(state, action.text, dispatch);
  }
}
