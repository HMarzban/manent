// What a replay commits through the write path: its version, its update and its key, in one
// transaction, then its answer and the update to every editor.
import { updateMeta } from "@manent/crdt";
import type { DocFile, ReplayRow, VersionRow } from "@manent/storage";
import type { Room, Rooms } from "../sync/rooms.ts";

/** What a replay commits; `update` and `version` are null when it writes nothing. */
export interface ReplayWrite {
  userId: string;
  update: Uint8Array | null;
  version: VersionRow | null;
  record: Omit<ReplayRow, "seq">;
}

export type ReplayDone = (
  result: { ok: true; seq: number } | { ok: false },
) => void;

/** A replay as the write path queues it. */
export interface ReplayItem {
  kind: "replay";
  room: Room;
  write: ReplayWrite;
  done: ReplayDone;
  /** The room's head in the transaction until the commit; then the sequence the replay is stored at. */
  seq: number;
}

/**
 * Inside the file's transaction, with `item.seq` the room's head: the version, then the update
 * (origin "replay"), then the record at the update's sequence, which `heads` takes.
 */
export function commitReplay(
  file: DocFile,
  item: ReplayItem,
  heads: Map<Room, number>,
): void {
  const { room, write } = item;
  const { userId, update, version, record } = write;
  if (version !== null) file.versions.add(version);
  if (update !== null) {
    const clocks = updateMeta(update).map((meta) => ({
      clientId: meta.clientId,
      clock: meta.toClock,
    }));
    const { docId, row } = room;
    const generation = row.generation;
    const origin = "replay";
    item.seq = file.log.append({
      docId,
      generation,
      update,
      userId,
      origin,
      clocks,
    });
    heads.set(room, item.seq);
  }
  file.replays.put({ ...record, seq: item.seq });
}

/** After the commit: `done`, then the update to every editor of the room. */
export function answerReplay(
  item: ReplayItem,
  rooms: Pick<Rooms, "changed">,
  ports: {
    publish(committed: {
      room: Room;
      sender: null;
      seq: number;
      update: Uint8Array;
      report: null;
      echo: boolean;
    }): void;
  },
): void {
  const { room, write, seq, done } = item;
  done({ ok: true, seq });
  const { update } = write;
  if (update === null) return;
  rooms.changed(room, update.byteLength);
  ports.publish({ room, sender: null, seq, update, report: null, echo: true });
}
