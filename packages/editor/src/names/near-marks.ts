// The dotted underline under each run of the page that nearly matches one of the project's names.
import { findNearMatches } from "@manent/revisions";
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/** What the underline is drawn from: the listed spellings, and the accessible description of each mark. */
export interface NearMarksSource {
  readonly names: readonly string[];
  describe(name: string): string;
}

/** What a mark keeps: the listed spelling it offers. */
interface MarkSpec {
  readonly name: string;
}

/** The marks of the text blocks between `from` and `to`. */
function marksBetween(
  doc: Node,
  from: number,
  to: number,
  source: NearMarksSource,
): Decoration[] {
  const marks: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = pos + 1;
    for (const match of findNearMatches(node.textContent, source.names))
      marks.push(
        Decoration.inline(
          start + match.from,
          start + match.to,
          {
            class: "mn-name-match",
            "aria-description": source.describe(match.name),
          },
          { name: match.name } satisfies MarkSpec,
        ),
      );
    return false;
  });
  return marks;
}

/** `pos`, widened to the edge of the text block it lies in: its start (`-1`) or its end (`1`). */
function textblockEdge(doc: Node, pos: number, side: 1 | -1): number {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return pos;
  return side === -1 ? $pos.start() : $pos.end();
}

/** Every mark of `doc`: run when the view starts, and when the names or Check spelling as I type change. */
export function markAll(doc: Node, source: NearMarksSource): DecorationSet {
  return source.names.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(doc, marksBetween(doc, 0, doc.content.size, source));
}

/**
 * The marks after `tr`: those outside the text blocks it replaced are moved along, and only those text blocks are
 * read again, so a keystroke or a remote update never walks the document.
 */
export function markAfter(
  tr: Transaction,
  marks: DecorationSet,
  source: NearMarksSource,
): DecorationSet {
  const { doc } = tr;
  const from = doc.content.findDiffStart(tr.before.content);
  const end = doc.content.findDiffEnd(tr.before.content);
  const moved = marks.map(tr.mapping, doc);
  if (from === null || end === null || source.names.length === 0) return moved;
  // a repeated run can put the end before the start: the end moves past it
  const start = textblockEdge(doc, from, -1);
  const stop = textblockEdge(doc, Math.max(end.a, from), 1);
  return moved
    .remove(moved.find(start, stop))
    .add(doc, marksBetween(doc, start, stop, source));
}

/** An underlined run, from `from` to `to` in the document, and the listed spelling it offers. */
export interface MarkAt {
  readonly from: number;
  readonly to: number;
  readonly name: string;
}

/** The mark `pos` lies in or at either end of; null when it is in none. */
export function markAt(marks: DecorationSet, pos: number): MarkAt | null {
  const [mark] = marks.find(pos, pos);
  if (mark === undefined) return null;
  const spec: MarkSpec = mark.spec;
  return { from: mark.from, to: mark.to, name: spec.name };
}
