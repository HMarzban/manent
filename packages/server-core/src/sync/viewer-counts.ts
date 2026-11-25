// How many people have a script open to read only, told to everyone in it as a number, never as who they are.
import { encodeViewerCount, prepareMessage } from "@manent/sync-protocol";
import type { PreparedMessage } from "@manent/sync-protocol";
import type { Clock, Peer, SyncLimits } from "./ports.ts";
import type { Room } from "./rooms.ts";

export interface ViewerCounts {
  /** After SUBSCRIBED: the peer is told at once, unless the count is 0 and was when it was last told. */
  joined(room: Room, peer: Peer): void;
  /** A subscription began or ended: everyone whose count changed is told, at most once every awarenessBatchMs. */
  changed(room: Room): void;
}

/** A person with it open on several devices counts once, and not at all while they edit it on one. */
function readersOf(room: Room): ReadonlySet<string> {
  const readers = new Set<string>();
  for (const peer of room.viewers.keys()) readers.add(peer.userId);
  for (const peer of room.editors.keys()) readers.delete(peer.userId);
  return readers;
}

/** How many of `readers` are someone other than the peer's own person. */
const othersFor = (readers: ReadonlySet<string>, peer: Peer): number =>
  readers.size - (readers.has(peer.userId) ? 1 : 0);

const controlOf = (room: Room, count: number): PreparedMessage =>
  prepareMessage({
    type: "CONTROL",
    docId: room.docId,
    generation: room.row.generation,
    seq: room.row.headSeq,
    kind: "viewers_counted",
    data: encodeViewerCount(count),
  });

/** CONTROL `viewers_counted`, sent to `room.editors` and `room.viewers` with Peer.send. */
export function createViewerCounts(ports: {
  clock: Clock;
  limits: SyncLimits;
}): ViewerCounts {
  const { clock, limits } = ports;
  /** The count each connection was last told, per document; a count of 0 is not kept. */
  const told = new WeakMap<Peer, Map<string, number>>();
  /** The rooms someone was told of a reader in. */
  const counted = new Set<Room>();
  const waiting = new Set<Room>();

  const toldTo = (peer: Peer): Map<string, number> => {
    const known = told.get(peer) ?? new Map<string, number>();
    told.set(peer, known);
    return known;
  };

  const tell = (
    room: Room,
    peer: Peer,
    control: PreparedMessage,
    count: number,
  ) => {
    const { docId } = room;
    if (count === 0) toldTo(peer).delete(docId);
    else {
      toldTo(peer).set(docId, count);
      counted.add(room);
    }
    peer.send(control);
  };

  const publish = (room: Room): void => {
    const readers = readersOf(room);
    const controls = new Map<number, PreparedMessage>();
    if (readers.size === 0) counted.delete(room);
    for (const peer of [...room.editors.keys(), ...room.viewers.keys()]) {
      const count = othersFor(readers, peer);
      if (count === (toldTo(peer).get(room.docId) ?? 0)) continue;
      const control = controls.get(count) ?? controlOf(room, count);
      controls.set(count, control);
      tell(room, peer, control, count);
    }
  };

  return {
    joined(room, peer) {
      const count = othersFor(readersOf(room), peer);
      if (count > 0 || toldTo(peer).has(room.docId))
        tell(room, peer, controlOf(room, count), count);
    },
    changed(room) {
      if (waiting.has(room)) return;
      if (room.viewers.size === 0 && !counted.has(room)) return;
      waiting.add(room);
      clock.schedule(() => {
        waiting.delete(room);
        publish(room);
      }, limits.awarenessBatchMs);
    },
  };
}
