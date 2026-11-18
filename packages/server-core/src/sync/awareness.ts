// Presence: who is where in a script, stamped with the server's name and colour, sent in batches.
import {
  CrdtUpdateError,
  decodeAwareness,
  encodeAwareness,
} from "@manent/crdt";
import type { AwarenessEntry } from "@manent/crdt";
import type { Message } from "@manent/sync-protocol";
import type { Clock, Peer, SyncLimits } from "./ports.ts";
import type { Room } from "./rooms.ts";

export interface AwarenessHub {
  /** How many entries were dropped: not the peer's client id, too large, or bytes that are not awareness. */
  accept(room: Room, peer: Peer, update: Uint8Array): number;
  /** Sends the current states, when there are any. */
  joined(room: Room, peer: Peer): void;
  /** Publishes the removal of that peer's entries. */
  left(room: Room, peer: Peer): void;
}

interface Present {
  entry: AwarenessEntry;
  peer: Peer;
  /** Cancels the removal of an entry that is not renewed. */
  expiry: () => void;
}

interface Presence {
  present: Map<number, Present>;
  /** The newest entry per client id since the last frame. */
  batch: Map<number, AwarenessEntry>;
  sending: boolean;
}

const encoder = new TextEncoder();

function frameOf(room: Room, entries: readonly AwarenessEntry[]): Message {
  return {
    type: "AWARENESS",
    docId: room.docId,
    generation: room.row.generation,
    update: encodeAwareness(entries),
  };
}

/** Sends to `room.editors` with Peer.send. */
export function createAwarenessHub(ports: {
  clock: Clock;
  limits: SyncLimits;
}): AwarenessHub {
  const { clock, limits } = ports;
  const rooms = new Map<Room, Presence>();

  const presenceOf = (room: Room): Presence => {
    const presence = rooms.get(room) ?? {
      present: new Map(),
      batch: new Map(),
      sending: false,
    };
    rooms.set(room, presence);
    return presence;
  };

  /** At most one frame per room every awarenessBatchMs; a room with nothing left is forgotten. */
  const publish = (room: Room, presence: Presence): void => {
    if (presence.sending) return;
    presence.sending = true;
    clock.schedule(() => {
      presence.sending = false;
      const frame = frameOf(room, [...presence.batch.values()]);
      presence.batch.clear();
      for (const peer of room.editors.keys()) peer.send(frame);
      if (presence.present.size === 0) rooms.delete(room);
    }, limits.awarenessBatchMs);
  };

  const remove = (room: Room, presence: Presence, clientId: number): void => {
    const gone = presence.present.get(clientId);
    if (gone === undefined) return;
    gone.expiry();
    presence.present.delete(clientId);
    const { clock: last } = gone.entry;
    presence.batch.set(clientId, { clientId, clock: last + 1, state: null });
    publish(room, presence);
  };

  /** The entry as the room keeps it, or null when it is dropped. */
  const admitted = (
    room: Room,
    peer: Peer,
    entry: AwarenessEntry,
  ): AwarenessEntry | null => {
    if (room.owners.get(entry.clientId) !== peer.userId) return null;
    const json = encoder.encode(JSON.stringify(entry.state));
    if (json.byteLength > limits.awarenessStateBytes) return null;
    if (entry.state === null) return entry;
    const colorIndex = room.colors.get(peer.userId) ?? 0;
    const user = { userId: peer.userId, name: peer.name, colorIndex };
    return { ...entry, state: { ...entry.state, user } };
  };

  return {
    accept(room, peer, update) {
      let entries: AwarenessEntry[];
      try {
        entries = decodeAwareness(update);
      } catch (error) {
        if (!(error instanceof CrdtUpdateError)) throw error;
        return 1;
      }
      const kept = entries.flatMap(
        (given) => admitted(room, peer, given) ?? [],
      );
      const dropped = entries.length - kept.length;
      if (kept.length === 0) return dropped;
      const presence = presenceOf(room);
      for (const entry of kept) {
        const current = presence.present.get(entry.clientId);
        if (current !== undefined && entry.clock <= current.entry.clock)
          continue;
        current?.expiry();
        if (entry.state === null) presence.present.delete(entry.clientId);
        else {
          const expiry = clock.schedule(
            () => remove(room, presence, entry.clientId),
            limits.awarenessTimeoutMs,
          );
          presence.present.set(entry.clientId, { entry, peer, expiry });
        }
        presence.batch.set(entry.clientId, entry);
        publish(room, presence);
      }
      return dropped;
    },
    joined(room, peer) {
      const present = [...(rooms.get(room)?.present.values() ?? [])];
      if (present.length > 0)
        peer.send(
          frameOf(
            room,
            present.map(({ entry }) => entry),
          ),
        );
    },
    left(room, peer) {
      const presence = rooms.get(room);
      if (presence === undefined) return;
      for (const [clientId, present] of presence.present)
        if (present.peer === peer) remove(room, presence, clientId);
    },
  };
}
