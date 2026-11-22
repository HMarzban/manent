// The element the pages scroll in, with the browser's own scroll anchoring off, so that no engine moves the page a
// second time after the editor has kept a line in place.
import type { EditorView } from "prosemirror-view";

function nearestScroller(view: EditorView): Element {
  for (let at = view.dom.parentElement; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  const doc = view.dom.ownerDocument;
  return doc.scrollingElement ?? doc.documentElement;
}

/** The scroller `chosen` picks, by default the nearest ancestor that scrolls, with the browser's scroll anchoring off. */
export function ownScroller(
  view: EditorView,
  chosen: ((view: EditorView) => Element) | undefined,
): Element {
  const scroller = (chosen ?? nearestScroller)(view);
  if (scroller instanceof HTMLElement)
    scroller.style.setProperty("overflow-anchor", "none");
  return scroller;
}
