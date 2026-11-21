// The rebuild of a document over budget once its room is quiet, and the service's record of who
// holds which document, which a rebuild ends room by room.
import { rebuildDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Message } from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import { SYNCABLE_KINDS } from "../sync/access.ts";
import type { AwarenessHub } from "../sync/awareness.ts";
import { freeClientId } from "../sync/client-ids.ts";
import type { Clock, Peer, SyncLimits } from "../sync/ports.ts";
import type { Room, Rooms, Subscription } from "../sync/rooms.ts";
import { isStorageError } from "../sync/storage-error.ts";
import { rebuildReason } from "./budget.ts";
import type { RebuildReason } from "./budget.ts";

/** The user a rebuilt generation's first row and its client id belong to. */
export const SYSTEM_USER_ID = "_system";

interface Held {
  room: Room;
  subscription: Subscription;
  /** As the SUBSCRIBE gave it. */
  lastServerSeq: number;
}

export interface PeerState {
  buckets: { frames: TokenBucket; bytes: TokenBucket };
  /** By document id. */
  held: Map<string, Held>;
}

export interface Subscriptions {
  /** Every attached peer. */
  readonly peers: Map<Peer, PeerState>;
  /** The subscription ends; the room is left. */
  end(peer: Peer, docId: string): void;
  /** Each subscriber of the room hears `message`, and its subscription ends. */
  endAll(room: Room, message: Message): void;
  /** A push or a setting reaches the write path only from an attached peer. */
  stateOf(peer: Peer): PeerState;
}

export function createSubscriptions(ports: {
  rooms: Pick<Rooms, "left">;
  presence: Pick<AwarenessHub, "left">;
  tell(peer: Peer, message: Message): void;
}): Subscriptions {
  const { rooms, presence } = ports;
  const peers = new Map<Peer, PeerState>();
  const end = (peer: Peer, docId: string): void => {
    const held = peers.get(peer)?.held.get(docId);
    if (held === undefined) return;
    peers.get(peer)?.held.delete(docId);
    if (held.subscription.mode === "edit") presence.left(held.room, peer);
    held.room.editors.delete(peer);
    held.room.viewers.delete(peer);
    rooms.left(held.room);
  };
  return {
    peers,
    end,
    endAll(room, message) {
      for (const peer of [...room.editors.keys(), ...room.viewers.keys()]) {
        ports.tell(peer, message);
        end(peer, room.docId);
      }
    },
    stateOf(peer) {
      const state = peers.get(peer);
      if (state === undefined)
        throw new RangeError(`${peer.userId}'s peer is not attached`);
      return state;
    },
  };
}

export interface RebuildStats {
  rebuilds: number;
  /** Quiet moments that ended without a rebuild, by why. */
  rebuildsSkipped: Record<string, number>;
}

export interface Rebuilder {
  /** An edit SUBSCRIBE or a committed write: the room's quiet timer starts again. */
  touched(room: Room): void;
  /** The document is rebuilt at its room's next quiet moment, whatever its measure. */
  request(docId: string): void;
  stats(): RebuildStats;
}

/** After a freeze: the room is built again from its new generation, and each subscriber is told it moved. */
export function moveRoom(
  room: Room,
  ports: {
    rooms: Pick<Rooms, "reload">;
    endAll(room: Room, message: Message): void;
  },
): void {
  const { docId, row } = room;
  ports.rooms.reload(room);
  ports.endAll(room, {
    type: "GENERATION_MOVED",
    docId,
    generation: row.generation,
    newGeneration: room.row.generation,
  });
}

/** `airWindow` defaults to never; a relayed room is never rebuilt. */
export function createRebuilder(ports: {
  clock: Clock;
  limits: SyncLimits;
  airWindow?: (docId: string, now: number) => boolean;
  writePath: { queued(): number };
  rooms: Pick<Rooms, "find" | "reload" | "drop">;
  endAll(room: Room, message: Message): void;
  /** Tells and unsubscribes everyone in these rooms. */
  poisoned(rooms: readonly Room[]): void;
}): Rebuilder {
  const { clock, limits, rooms } = ports;
  const airWindow = ports.airWindow ?? (() => false);
  const timers = new Map<Room, () => void>();
  const requests = new Set<string>();
  const skipped: Record<string, number> = {};
  let rebuilds = 0;

  const skip = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  const arm = (room: Room): void => {
    timers.get(room)?.();
    const cancel = clock.schedule(() => attempt(room), limits.rebuildQuietMs);
    timers.set(room, cancel);
  };

  /** Skipped for now: the room's next quiet moment tries again. */
  const postpone = (room: Room, reason: string): void => {
    skip(reason);
    arm(room);
  };

  const budgetOf = ({ file, docId, row }: Room): RebuildReason | null =>
    rebuildReason(
      file.measures.get(docId, row.generation),
      limits,
      file.generations.get(docId, row.generation - 1),
    );

  /** Freezes the generation and moves the room and its subscribers to the one built. */
  function move(
    room: Room,
    rebuild: {
      doc: CrdtDoc;
      built: CrdtDoc;
      reason: RebuildReason | "requested";
      clientId: number;
    },
  ): void {
    const { file, docId, row } = room;
    const { doc, built, reason, clientId } = rebuild;
    const at = clock.now();
    try {
      file.transaction(() =>
        file.generations.freeze({
          docId,
          finalSeq: row.headSeq,
          finalState: doc.encodeState(),
          frozenAt: at,
          purgeAfter: at + limits.frozenKeepMs,
          reason,
          initialUpdate: built.encodeState(),
          rebuiltByClientId: clientId,
          userId: SYSTEM_USER_ID,
        }),
      );
    } catch (error) {
      if (!isStorageError(error)) throw error;
      ports.poisoned([room]);
      rooms.drop([room]);
      return;
    } finally {
      built.destroy();
    }
    moveRoom(room, ports);
    rebuilds += 1;
    requests.delete(docId);
  }

  /** The checks in order; the first that holds ends the attempt with its reason. */
  function attempt(room: Room): void {
    timers.delete(room);
    const { doc, docId, file } = room;
    if (doc === null) return skip("not_loaded");
    if (room.mode === "relay") return skip("relay");
    if (!SYNCABLE_KINDS.includes(room.kind)) return skip("kind");
    if (ports.writePath.queued() > 0) return postpone(room, "busy_queue");
    if (file.log.healing(docId) !== null) return skip("healing");
    if (airWindow(docId, clock.now())) return postpone(room, "air_window");
    const reason = requests.has(docId) ? "requested" : budgetOf(room);
    if (reason === null) return skip("under_budget");
    const clientId = freeClientId(file.log.ledger(docId));
    const built = rebuildDoc(doc, { clientId });
    if (!built.ok) return skip(built.code);
    move(room, { doc, built: built.doc, reason, clientId });
  }

  return {
    touched: arm,
    request(docId) {
      requests.add(docId);
      const room = rooms.find(docId);
      if (room !== null) arm(room);
    },
    stats: () => ({ rebuilds, rebuildsSkipped: { ...skipped } }),
  };
}
