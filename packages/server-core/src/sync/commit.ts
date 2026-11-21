// One file's queued items committed in one transaction, and what each answers once it is: the
// acknowledgement, the update to the room, and what a relayed room hands upstream.
import type { DocFile, StorageError } from "@manent/storage";
import { answerReplay, commitReplay } from "../rebuild/replay-write.ts";
import { answerAuthority, commitAuthority } from "./authority-write.ts";
import type { UpstreamItem } from "./ports.ts";
import type { Room } from "./rooms.ts";
import { isStorageError } from "./storage-error.ts";
import type { Committed, QueuedItem, WritePathPorts } from "./write-path.ts";

type AnswerPorts = Pick<
  WritePathPorts,
  "rooms" | "ack" | "publish" | "schemaRaised"
>;

/** One transaction for the file's items, in arrival order; each item's `seq` is set inside it. Null once it commits. */
export function commitFile(
  file: DocFile,
  items: readonly QueuedItem[],
  ports: Pick<WritePathPorts, "beforeAppend">,
): StorageError | null {
  const heads = new Map<Room, number>();
  try {
    file.transaction(() => {
      for (const item of items) {
        const { room } = item;
        const push = item.kind === "append" ? item : null;
        if (push !== null && !push.setting)
          ports.beforeAppend(room, push.append.userId, push.heal);
        if (item.kind === "append" || item.kind === "ingest") {
          item.seq = file.log.append(item.append);
          heads.set(room, item.seq);
        } else item.seq = heads.get(room) ?? room.row.headSeq;
        if (item.kind === "replay") commitReplay(file, item, heads);
        if (item.kind === "authority") commitAuthority(file, item, heads);
        if (push !== null && push.schemaTo !== null)
          file.log.raiseSchema(room.docId, push.schemaTo);
      }
    });
  } catch (error) {
    if (!isStorageError(error)) throw error;
    return error;
  }
  return null;
}

/** What a committed item sends the room; null for a resend, a relayed setting, a replay and an authority write, which answer themselves. */
export function committedOf(item: QueuedItem): Committed | null {
  const { room, seq } = item;
  if (item.kind === "ingest") {
    const { report, append } = item;
    return {
      room,
      sender: null,
      seq,
      update: append.update,
      report,
      echo: true,
    };
  }
  if (item.kind !== "append") return null;
  const { append, report, setting: echo } = item;
  const sender = item.subscription.peer;
  return { room, sender, seq, update: append.update, report, echo };
}

/** Steps 9 and 10 but the publish: the acknowledgement, and the room moving on. */
export function settle(item: QueuedItem, ports: AnswerPorts): void {
  const { rooms } = ports;
  if (item.kind === "replay") return answerReplay(item, rooms, ports);
  if (item.kind === "authority") return answerAuthority(item, ports);
  if (item.kind === "ingest")
    return rooms.changed(item.room, item.append.update.byteLength);
  const { room, subscription, clientSeq, seq } = item;
  ports.ack(subscription.peer, room, clientSeq, seq);
  if (item.kind !== "append") return;
  rooms.changed(room, item.append.update.byteLength);
  if (item.schemaTo !== null) ports.schemaRaised(room, item.schemaTo);
}

/** Steps 9 and 10: a setting is published before it is acknowledged, anything else after. */
export function answer(item: QueuedItem, ports: AnswerPorts): void {
  const committed = committedOf(item);
  const first = item.kind === "append" && item.setting;
  if (first && committed !== null) ports.publish(committed);
  settle(item, ports);
  if (!first && committed !== null) ports.publish(committed);
}

/** What a relayed room hands upstream of an item, at the sequence it was given; nothing of an ingest. */
export function upstreamOf(item: QueuedItem): UpstreamItem | null {
  const { room, seq } = item;
  if (room.mode !== "relay") return null;
  const ref = { docId: room.docId, generation: room.row.generation };
  if (item.kind === "replay")
    return item.write.update === null
      ? null
      : { kind: "update", ...ref, seq, update: item.write.update };
  if (item.kind === "ack" || item.kind === "ingest") return null;
  if (item.kind === "append" || item.kind === "authority")
    return item.append === null
      ? null
      : { kind: "update", ...ref, seq, update: item.append.update };
  const { clientSeq, request } = item;
  const userId = item.subscription.peer.userId;
  return { kind: "set", ...ref, userId, clientSeq, ...request };
}
