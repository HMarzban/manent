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

/** Where the caret sits in paginated coordinates, read without touching the DOM. */
interface CaretLocation {
  readonly page: number;
  readonly block: number;
  readonly line: number;
  readonly pageBlock: number;
  readonly pageLine: number;
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

function lineInBlock(starts: Int32Array, offset: number): number {
  let line = 0;
  while (line + 1 < starts.length && starts[line + 1]! <= offset) line++;
  return line;
}

function caretLocation(state: EditorState): CaretLocation | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const paged = paginationKey.getState(state);
  if (paged === undefined || paged.frozen) return null;
  const { index, pagination, settings } = paged;
  const block = blockAt(index, selection.head);
  const offset = Math.max(0, selection.head - blockPos(index, block) - 1);
  const page = settings.engine.pageOf(pagination, block, offset);
  const starts = pagination.metrics[block]?.starts;
  const line = starts === undefined ? 0 : lineInBlock(starts, offset);
  const pageObj = pagination.pages[page];
  return {
    page,
    block,
    line,
    pageBlock: pageObj?.block ?? -1,
    pageLine: pageObj?.line ?? -1,
  };
}

function isSameCaretLine(a: CaretLocation | null, b: CaretLocation): boolean {
  return (
    a !== null &&
    a.page === b.page &&
    a.block === b.block &&
    a.line === b.line &&
    a.pageBlock === b.pageBlock &&
    a.pageLine === b.pageLine
  );
}

/**
 * Keeps the caret's line where it was when a local edit carries the caret to another page.
 * Intra-line edits never force a layout; line changes refresh the baseline synchronously so page crossings stay accurate.
 */
export function createCaretKeeper(
  view: EditorView,
  scrollerOf: () => Element,
  isRemoteState: (state: EditorState) => boolean,
): { update(prev: EditorState): void; destroy(): void } {
  let before: CaretPlace | null = null;
  let lastLoc: CaretLocation | null = null;
  let scrolledTo = 0;

  const measure = (loc: CaretLocation): void => {
    const scroller = scrollerOf();
    before = {
      page: loc.page,
      top: view.coordsAtPos(view.state.selection.head).top,
    };
    scrolledTo = scroller.scrollTop;
    lastLoc = loc;
  };

  return {
    update(prev) {
      const loc = caretLocation(view.state);
      if (loc === null) {
        before = null;
        lastLoc = null;
        return;
      }
      const docChanged = prev.doc !== view.state.doc;
      const remote = docChanged && isRemoteState(view.state);
      if (
        docChanged &&
        !remote &&
        before !== null &&
        before.page !== loc.page
      ) {
        const scroller = scrollerOf();
        const after: CaretPlace = {
          page: loc.page,
          top: view.coordsAtPos(view.state.selection.head).top,
        };
        const moved = scroller.scrollTop - scrolledTo;
        const delta = scrollDelta(
          { ...before, top: before.top - moved },
          after,
        );
        if (delta !== 0) scroller.scrollTop += delta;
        before = { ...after, top: after.top - delta };
        scrolledTo = scroller.scrollTop;
        lastLoc = loc;
        return;
      }
      if (!remote && before !== null && isSameCaretLine(lastLoc, loc)) return;
      measure(loc);
    },
    destroy() {},
  };
}
