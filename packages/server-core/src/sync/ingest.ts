// An update taken in from upstream: applied to the relayed room without the checks a push passes,
// and queued as the upstream's.
import { applyInspecting } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { AppendItem } from "@manent/storage";
import type { Room } from "./rooms.ts";

/** An update from upstream as the write path queues it: appended, then sent to every editor and viewer. */
export interface IngestItem {
  kind: "ingest";
  room: Room;
  append: AppendItem;
  report: TransactionReport;
  /** Set by the commit: the sequence given. */
  seq: number;
}

/**
 * What `produce` returns beyond the loaded room's state vector, applied with no validation, no
 * client-ID check and no healing; null when it holds nothing new. It registers no client id: the
 * ids are the upstream's, and nobody on this node writes with them.
 */
export function ingestItem(
  room: Room,
  userId: string,
  produce: (roomVector: Uint8Array) => Uint8Array,
): IngestItem | null {
  const { doc, docId, row } = room;
  if (doc === null) throw new RangeError(`the room of ${docId} is not loaded`);
  const update = produce(doc.encodeStateVector());
  const report = applyInspecting(doc, update);
  if (report === null) return null;
  const { generation } = row;
  const origin = "upstream";
  const append: AppendItem = {
    docId,
    generation,
    update,
    userId,
    origin,
    clocks: [],
  };
  return { kind: "ingest", room, append, report, seq: 0 };
}
