// Where the browser starts each line of a rendered block, read from the boxes of its grapheme clusters.
import { graphemeEnd } from "@manent/pagination";

interface Piece {
  readonly node: Text;
  readonly start: number;
}

// Page furniture inside a block holds no text of the block.
function isFurniture(element: Element): boolean {
  return element.classList.contains("pb") || element.classList.contains("lb");
}

function textPieces(el: HTMLElement): Piece[] {
  const walker = document.createTreeWalker(
    el,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node instanceof Text) return NodeFilter.FILTER_ACCEPT;
        return node instanceof Element && isFurniture(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );
  const pieces: Piece[] = [];
  let start = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    pieces.push({ node, start });
    start += node.data.length;
  }
  return pieces;
}

// The text node holding offset `at` of the block's text, and the offset inside it; `at` may be the end.
function pointAt(
  pieces: readonly Piece[],
  at: number,
): { node: Text; offset: number } {
  let piece = pieces[0]!;
  for (const candidate of pieces) {
    if (candidate.start > at) break;
    piece = candidate;
  }
  return {
    node: piece.node,
    offset: Math.min(at - piece.start, piece.node.data.length),
  };
}

/**
 * The offsets, over the element's own text, where a rendered line starts; always begins with 0. A cluster
 * starts a line when its first box is more than half a line below the previous cluster's; a cluster with no
 * box is passed over.
 */
export function domLineStarts(el: HTMLElement): number[] {
  const pieces = textPieces(el);
  const starts = [0];
  if (pieces.length === 0) return starts;
  const text = pieces.map((p) => p.node.data).join("");
  // client boxes are scaled by any transform above the element; its line height is not
  const scale = el.getBoundingClientRect().width / el.offsetWidth;
  const halfLine =
    (Number.parseFloat(getComputedStyle(el).lineHeight) * scale) / 2;
  const range = document.createRange();
  let previousTop: number | null = null;
  for (let at = 0, end = 0; at < text.length; at = end) {
    end = graphemeEnd(text, at);
    const from = pointAt(pieces, at);
    const to = pointAt(pieces, end);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const box = range.getClientRects()[0];
    if (box === undefined) continue;
    if (previousTop !== null && box.top - previousTop > halfLine)
      starts.push(at);
    previousTop = box.top;
  }
  return starts;
}
