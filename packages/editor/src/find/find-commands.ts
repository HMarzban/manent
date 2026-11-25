// What the Find bar asks of the page: the text to look for, the next or previous match, and replacing; loaded apart
// from the editor with the matcher, the first time something is looked for.
import { SearchQuery } from "prosemirror-search";
import type { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Mapping, StepMap } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { ActionResult } from "../actions/action-types.ts";
import type { EditorAction } from "../actions/registry.ts";
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

/** Every match of `query` between `from` and `to`, in document order. */
function matchesOf(
  state: EditorState,
  query: SearchQuery,
  from = 0,
  to = state.doc.content.size,
): Match[] {
  const matches: Match[] = [];
  if (!query.valid) return matches;
  for (let pos = from; pos < to;) {
    const next = query.findNext(state, pos, to);
    if (next === null) break;
    matches.push({ from: next.from, to: next.to });
    pos = Math.max(next.to, pos + 1);
  }
  return matches;
}

/** The index of the match the selection holds, by a binary search of the matches' starts; null when it holds none. */
function currentOf(
  matches: readonly Match[],
  state: EditorState,
): number | null {
  const { from, to } = state.selection;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (matches[mid]!.from < from) lo = mid + 1;
    else hi = mid;
  }
  const match = matches[lo];
  return match?.from === from && match.to === to ? lo : null;
}

const MARK = Object.freeze({ class: "mn-find" });
// laid on the match's own mark, whose span it joins
const CURRENT = Object.freeze({ "data-current": "" });

/**
 * The part of the document a change replaced: from `from` to `toBefore` in the document before it, to `to` in the one
 * after; null when their content is the same. Unchanged nodes are the same objects in both, so the search stops at
 * the first that differs from either end.
 */
function replacedOf(
  before: Node,
  after: Node,
): { from: number; toBefore: number; to: number } | null {
  const from = after.content.findDiffStart(before.content);
  const end = after.content.findDiffEnd(before.content);
  if (from === null || end === null) return null;
  // a repeated run can put an end before the start: both ends move past it alike
  const overlap = Math.max(0, from - Math.min(end.a, end.b));
  return { from, toBefore: end.b + overlap, to: end.a + overlap };
}

/** `pos`, widened to the edge of the text block it lies in: its start (`-1`) or its end (`1`). */
function textblockEdge(doc: Node, pos: number, side: 1 | -1): number {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return pos;
  return side === -1 ? $pos.start() : $pos.end();
}

interface Found {
  matches: readonly Match[];
  /** One mark per match, without the current one's. */
  marks: DecorationSet;
}

/**
 * What `query` finds after `tr`: the matches and marks outside the text blocks it touched are moved along, and only
 * those text blocks are looked through again, so a keystroke or a remote update never walks the document.
 */
function foundAfter(
  tr: Transaction,
  state: EditorState,
  query: SearchQuery,
  found: Found,
): Found {
  const replaced = replacedOf(tr.before, state.doc);
  // the same content keeps every position
  if (replaced === null) return found;
  const { from, toBefore, to } = replaced;
  const shift = to - toBefore;
  const searchFrom = textblockEdge(state.doc, from, -1);
  const searchTo = textblockEdge(state.doc, to, 1);
  const outside = (m: Match): boolean =>
    m.to <= searchFrom || m.from >= searchTo;
  const before: Match[] = [];
  const after: Match[] = [];
  for (const m of found.matches) {
    if (m.to <= from && outside(m)) before.push(m);
    else if (m.from >= toBefore) {
      const moved = { from: m.from + shift, to: m.to + shift };
      if (outside(moved)) after.push(moved);
    }
  }
  const fresh = matchesOf(state, query, searchFrom, searchTo);
  const replacing = new Mapping([
    new StepMap([from, toBefore - from, to - from]),
  ]);
  const moved = found.marks.map(replacing, state.doc);
  const marks = moved.remove(moved.find(searchFrom, searchTo)).add(
    state.doc,
    fresh.map((m) => Decoration.inline(m.from, m.to, MARK)),
  );
  return { matches: [...before, ...fresh, ...after], marks };
}

/** The Find bar's state for `found` in `state`: the current match is marked over its own mark. */
function stateOf(
  state: EditorState,
  query: SearchQuery,
  found: Found,
): FindState {
  const current = currentOf(found.matches, state);
  const held = current === null ? null : found.matches[current]!;
  const find: FindState = {
    matches: found.matches,
    current,
    decorations:
      held === null
        ? found.marks
        : found.marks.add(state.doc, [
            Decoration.inline(held.from, held.to, CURRENT),
          ]),
    next(tr, after) {
      if (tr.docChanged)
        return stateOf(after, query, foundAfter(tr, after, query, found));
      if (!tr.selectionSet || currentOf(found.matches, after) === current)
        return find;
      return stateOf(after, query, found);
    },
  };
  return find;
}

/** Everything `query` finds in `state`, by a walk of the document: once each time the Find bar's text changes. */
function foundIn(state: EditorState, query: SearchQuery): FindState {
  const matches = matchesOf(state, query);
  const marks = DecorationSet.create(
    state.doc,
    matches.map((m) => Decoration.inline(m.from, m.to, MARK)),
  );
  return stateOf(state, query, { matches, marks });
}

/** Sets the query and selects its first match from the selection's start on, going round the document's end. */
function setQuery(view: EditorView, query: SearchQuery | null): void {
  const { state } = view;
  const found = query === null ? null : foundIn(state, query);
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

/**
 * Scrolls the current match into view. The page scrolls to its selection only while it holds the browser's selection,
 * which stays in the Find bar's field as it is typed in.
 */
function revealCurrent(view: EditorView): void {
  view.dom
    .querySelector(`.${MARK.class}[data-current]`)
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** The result of an action that selects a match, once its match is in view. */
function revealed(view: EditorView, result: ActionResult): ActionResult {
  if (result.ok) revealCurrent(view);
  return result;
}

/** Runs a Find bar action on the view as it is now. */
export function runFind(view: EditorView, action: FindAction): ActionResult {
  const { state, dispatch } = view;
  switch (action.kind) {
    case "find":
      findText(view, action.search);
      return revealed(view, { ok: true });
    case "find_next":
      return revealed(view, findStep(state, 1, dispatch));
    case "find_previous":
      return revealed(view, findStep(state, -1, dispatch));
    case "replace":
      return revealed(view, replaceMatch(state, action.text, dispatch));
    case "replace_all":
      return replaceAll(state, action.text, dispatch);
  }
}
