// What the reader reads stays where it is when a remote change lands above it. The editor anchors the scroll itself,
// with the browser's own scroll anchoring off, so that no engine moves the page a second time.
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

// The block across the scroller's top, and its top's offset from the scroller's top, px.
interface ReadingAnchor {
  readonly block: HTMLElement;
  readonly id: string;
  readonly offset: number;
}

/** `before` is called with the state a remote change starts from, before the view shows it; `after` after each update. */
export interface ReadingKeeper {
  before(old: EditorState): void;
  after(prev: EditorState): void;
}

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

function viewportTop(scroller: Element): number {
  return scroller === scroller.ownerDocument.scrollingElement
    ? 0
    : scroller.getBoundingClientRect().top;
}

// The first of `elements`, laid out top to bottom, whose box ends below `top`; found by halving.
function firstEndingBelow(
  elements: ArrayLike<Element>,
  top: number,
): Element | null {
  let low = 0;
  let high = elements.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (elements[mid]!.getBoundingClientRect().bottom > top) high = mid;
    else low = mid + 1;
  }
  return elements[low] ?? null;
}

function readAnchor(view: EditorView, scroller: Element): ReadingAnchor | null {
  const top = viewportTop(scroller);
  const section = firstEndingBelow(view.dom.children, top);
  const block =
    section === null
      ? null
      : firstEndingBelow(section.querySelectorAll(":scope > p.el"), top);
  if (!(block instanceof HTMLElement)) return null;
  const id = block.dataset["id"];
  if (id === undefined) return null;
  return { block, id, offset: block.getBoundingClientRect().top - top };
}

// The anchor's block once the change is shown: the same element when the view kept it for the same block, otherwise
// the element of the block's id (an id holds only [A-Za-z0-9_-], so it needs no escaping).
function blockAfter(view: EditorView, anchor: ReadingAnchor): Element | null {
  const { block, id } = anchor;
  if (view.dom.contains(block) && block.dataset["id"] === id) return block;
  return view.dom.querySelector(`p.el[data-id="${id}"]`);
}

/** Keeps the block across the scroller's top at the same offset from it across a remote change. */
export function readingKeeper(
  view: EditorView,
  scroller: () => Element,
): ReadingKeeper {
  let held: { from: EditorState; anchor: ReadingAnchor } | null = null;
  return {
    before(old) {
      if (old !== view.state) return;
      const anchor = readAnchor(view, scroller());
      held = anchor === null ? null : { from: old, anchor };
    },
    after(prev) {
      const read = held;
      held = null;
      if (read === null || read.from !== prev) return;
      const { anchor } = read;
      const block = blockAfter(view, anchor);
      if (block === null) return;
      const own = scroller();
      own.scrollTop +=
        block.getBoundingClientRect().top - viewportTop(own) - anchor.offset;
    },
  };
}
