// Where the caret is: its page and its place in the viewport, so that its line can stay put when an edit carries it
// to another page.
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockAt, blockPos } from "./block-index.ts";
import { paginationKey } from "./plugin.ts";

/** The caret's page and its top in the viewport, px. */
export interface CaretPlace {
  readonly page: number;
  readonly top: number;
}

/** How far to scroll so the caret's line stays put: the change in its top when it changed page, otherwise 0. */
export function scrollDelta(
  before: CaretPlace | null,
  after: CaretPlace,
): number {
  return before === null || before.page === after.page
    ? 0
    : after.top - before.top;
}

/** The index of the page holding `pos`; null without pages, or while a composition holds the pages of the document before it. */
export function pageAtPos(state: EditorState, pos: number): number | null {
  const paged = paginationKey.getState(state);
  if (paged === undefined || paged.frozen) return null;
  const { index, pagination, settings } = paged;
  const block = blockAt(index, pos);
  const offset = Math.max(0, pos - blockPos(index, block) - 1);
  return settings.engine.pageOf(pagination, block, offset);
}

/** Null without a collapsed selection, or while a composition holds the pages of the document before it. */
export function caretPlace(view: EditorView): CaretPlace | null {
  const { selection } = view.state;
  const page = selection.empty ? pageAtPos(view.state, selection.head) : null;
  return page === null
    ? null
    : { page, top: view.coordsAtPos(selection.head).top };
}
