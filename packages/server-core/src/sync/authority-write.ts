// What the server writes into a room on a copy of its document, and what an authority write
// commits through the write path: its update and its own rows, in one transaction, then its
// answer and the update to every editor.
import {
  applyInspecting,
  loadDoc,
  mergeUpdates,
  readStateVector,
} from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import type { AppendItem, DocFile } from "@manent/storage";
import { writerClientId } from "./client-ids.ts";
import type { AuthorityWrite, AuthorityWriteResult } from "./ports.ts";
import type { Room } from "./rooms.ts";
import type { WritePathPorts } from "./write-path.ts";

/** An authority write as the write path queues it, its edit already in the room's document. */
export interface AuthorityItem {
  kind: "authority";
  room: Room;
  /** Null when the edit wrote nothing. */
  append: AppendItem | null;
  report: TransactionReport | null;
  inTransaction: AuthorityWrite["inTransaction"];
  done: (result: AuthorityWriteResult) => void;
  /** The room's head in the transaction until the commit; then the sequence the update is stored at. */
  seq: number;
}

/**
 * Runs `write` on a copy of the room's loaded document, under a client id that neither the ledger
 * nor the document holds, which the commit registers to the writer. What it made is merged into
 * one update and applied to the room's document under `origin`; `update` is null when it made
 * nothing, and nothing is applied when `write` answers ok false.
 */
export function writeOnCopy(
  room: Room,
  origin: string,
  write: AuthorityWrite["edit"],
  ids: () => string,
):
  | { ok: true; update: Uint8Array | null; report: TransactionReport | null }
  | { ok: false; reason: string } {
  const { doc } = room;
  if (doc === null)
    throw new RangeError(`the room of ${room.docId} is not loaded`);
  const written = readStateVector(doc.encodeStateVector()).set(doc.clientId, 0);
  const ledger = room.file.log.ledger(room.docId);
  const clientId = writerClientId(room.mode, ids, [ledger, written]);
  const copy = loadDoc(doc.encodeState(), { clientId });
  const made: Uint8Array[] = [];
  copy.subscribe((update) => made.push(update));
  let answer: ReturnType<AuthorityWrite["edit"]>;
  try {
    answer = write(copy);
  } finally {
    copy.destroy();
  }
  if (!answer.ok) return answer;
  if (made.length === 0) return { ok: true, update: null, report: null };
  const update = mergeUpdates(made);
  return { ok: true, update, report: applyInspecting(doc, update, origin) };
}

/** Inside the file's transaction, with `item.seq` the room's head: the update, then the write's own rows. */
export function commitAuthority(
  file: DocFile,
  item: AuthorityItem,
  heads: Map<Room, number>,
): void {
  const { room, append } = item;
  const before = item.seq;
  if (append !== null) {
    item.seq = file.log.append(append);
    heads.set(room, item.seq);
  }
  const seq = append === null ? null : item.seq;
  item.inTransaction(file, { generation: room.row.generation, before, seq });
}

/** After the commit: `done`, then the update to every editor of the room and its patch to every viewer. */
export function answerAuthority(
  item: AuthorityItem,
  ports: Pick<WritePathPorts, "rooms" | "publish">,
): void {
  const { room, append, report, seq, done } = item;
  const { generation } = room.row;
  done({ ok: true, generation, seq: append === null ? null : seq });
  if (append === null) return;
  const { update } = append;
  ports.rooms.changed(room, update.byteLength);
  ports.publish({ room, sender: null, seq, update, report, echo: true });
}
