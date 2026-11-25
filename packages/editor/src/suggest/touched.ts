// Where a run of transactions changed the document, in its final positions, and the whole blocks around a place.
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { AttrStep, Mapping } from "prosemirror-transform";

/** Positions in the document the transactions left; `from` is also the start of the change in the one they began with. */
export interface Touched {
  from: number;
  to: number;
  /** Every step of the transactions, in order. */
  mapping: Mapping;
}

/**
 * The smallest range holding every change the transactions made, attribute changes included; null when they changed
 * nothing. Everything before `from` and after `to` is as it was, so the same range in the earlier document ends
 * `to` minus the change in size.
 */
export function touchedBy(trs: readonly Transaction[]): Touched | null {
  const mapping = new Mapping();
  let from = -1;
  let to = -1;
  const widen = (start: number, end: number): void => {
    from = from === -1 ? start : Math.min(from, start);
    to = Math.max(to, end);
  };
  for (const tr of trs)
    tr.steps.forEach((step, index) => {
      const map = tr.mapping.maps[index]!;
      if (from !== -1) {
        from = map.map(from, -1);
        to = map.map(to, 1);
      }
      map.forEach((_oldStart, _oldEnd, start, end) => widen(start, end));
      // an attribute step moves nothing, so its map is empty
      if (step instanceof AttrStep) widen(step.pos, step.pos + 1);
      mapping.appendMap(map);
    });
  return from === -1 ? null : { from, to, mapping };
}

/** The start of the block `pos` is in, or `pos` itself between blocks. */
export function blockStart(doc: Node, pos: number): number {
  const $pos = doc.resolve(pos);
  return $pos.depth >= 2 ? $pos.before(2) : pos;
}

/** The end of the block `pos` is in, or `pos` itself between blocks. */
export function blockEnd(doc: Node, pos: number): number {
  const $pos = doc.resolve(pos);
  return $pos.depth >= 2 ? $pos.after(2) : pos;
}

/** Each block that overlaps `from`–`to`, with its position. */
export function blocksIn(
  doc: Node,
  from: number,
  to: number,
): { node: Node; pos: number }[] {
  const found: { node: Node; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    found.push({ node, pos });
    return false;
  });
  return found;
}
