// Where the caret is: its page and its place in the viewport, so that its line can stay put when an edit carries it
// to another page.
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

/** Null without a collapsed selection, or while a composition holds the pages of the document before it. */
export function caretPlace(view: EditorView): CaretPlace | null {
  const { selection } = view.state;
  const state = paginationKey.getState(view.state);
  if (!selection.empty || state === undefined || state.frozen) return null;
  const { index, pagination, settings } = state;
  const { head } = selection;
  const block = blockAt(index, head);
  const offset = Math.max(0, head - blockPos(index, block) - 1);
  return {
    page: settings.engine.pageOf(pagination, block, offset),
    top: view.coordsAtPos(head).top,
  };
}
