// Bringing another person's caret into view, found through the block index near the hint it was sent with.
import type { EditorView } from "prosemirror-view";
import { positionOf } from "../cursors/place.ts";
import { ownScroller } from "../pagination/scroller.ts";
import type { CursorPlace } from "../script-editor/ports.ts";

/**
 * Scrolls the page so that the head of `place` sits in the middle of the visible page area, only when it is outside
 * that area; true when it scrolled. Nothing happens when its block is not found near the place's hint.
 */
export function scrollToPerson(view: EditorView, place: CursorPlace): boolean {
  const pos = positionOf(view.state, place.head, place.at);
  if (pos === null) return false;
  const scroller = ownScroller(view, undefined);
  const area = scroller.getBoundingClientRect();
  const caret = view.coordsAtPos(pos);
  if (caret.top >= area.top && caret.bottom <= area.bottom) return false;
  scroller.scrollTop += caret.top - (area.top + area.height / 2);
  return true;
}
