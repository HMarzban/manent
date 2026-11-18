// The deletions the log's rows made, kept for each loaded document: an editor that comes back is
// sent them before its step 2, whose delete set also holds what Yjs deleted with a deleted parent.
import { deletionsOf } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Room } from "./rooms.ts";

/** The deletions of the rows after `afterSeq` through `throughSeq`; `update` is null when they made none. */
interface Span {
  afterSeq: number;
  throughSeq: number;
  update: Uint8Array | null;
}

/**
 * `since` gives one update of every deletion the rows after `lastServerSeq` made, perhaps with
 * those of earlier rows, which a client that holds them already ignores; null when there is none.
 * While a document stays loaded each of its rows is read at most twice. RangeError for a room not
 * loaded.
 */
export interface Deletions {
  since(room: Room, lastServerSeq: number): Uint8Array | null;
}

/** The deletions of the rows after `afterSeq`, merged into `held`'s. */
function readAfter(
  room: Room,
  afterSeq: number,
  held: Uint8Array | null,
): Span {
  const { docId, file, row } = room;
  // a read for one client quarantines nothing; loading the room does that
  const peek = { quarantine: false };
  const { rows } = file.log.tail(docId, row.generation, afterSeq, peek);
  const updates = rows.map((r) => r.update);
  return {
    afterSeq,
    throughSeq: rows.at(-1)?.seq ?? afterSeq,
    update: deletionsOf(held === null ? updates : [held, ...updates]),
  };
}

export function createDeletions(): Deletions {
  // keyed by the loaded document, so a room built again reads afresh
  const spans = new WeakMap<CrdtDoc, Span>();
  return {
    since(room, lastServerSeq) {
      const { doc, row } = room;
      if (doc === null)
        throw new RangeError(`the room of ${room.docId} is not loaded`);
      if (lastServerSeq >= row.headSeq) return null;
      const held = spans.get(doc);
      let next: Span;
      // a start before the one held is read from the first row, so no earlier start reads again
      if (held === undefined || held.afterSeq > lastServerSeq)
        next = readAfter(room, held === undefined ? lastServerSeq : 0, null);
      else if (held.throughSeq < row.headSeq)
        next = {
          ...readAfter(room, held.throughSeq, held.update),
          afterSeq: held.afterSeq,
        };
      else return held.update;
      spans.set(doc, next);
      return next.update;
    },
  };
}
