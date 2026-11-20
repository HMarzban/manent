// What a relayed room takes from its upstream: updates beyond its own, a pause of what it hands
// upstream, and a new generation built from the upstream's state with its own changes merged in.
import {
  ORIGIN_REPLAY,
  applyBlockOps,
  loadDoc,
  mergeUpdates,
  readStateVector,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { mergeByBlock } from "@manent/revisions";
import type { Overlap, SetAsideBlock } from "@manent/revisions";
import type { BlockOp, DocJSON } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { isDocKind } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import {
  SYSTEM_USER_ID,
  freeClientId,
  moveRoom,
} from "../rebuild/rebuilder.ts";
import type { HeldQueue } from "./held.ts";
import { ingestItem } from "./ingest.ts";
import type { Clock, SyncLimits } from "./ports.ts";
import type { Room, Rooms } from "./rooms.ts";
import type { WritePath } from "./write-path.ts";

export interface Follower {
  /** SyncService.ingest. */
  ingest(
    docId: string,
    userId: string,
    produce: (roomVector: Uint8Array) => Uint8Array,
  ): void;
  /** SyncService.pauseRelay: a second call while paused does nothing. */
  pauseRelay(docId: string): void;
  /** SyncService.follow. */
  follow(
    docId: string,
    theirs: Uint8Array,
  ): { update: Uint8Array; overlaps: Overlap[]; setAside: SetAsideBlock[] };
  /** Whether the room's committed updates are kept from upstream. */
  isPaused(docId: string): boolean;
}

const materialize = (doc: CrdtDoc): DocJSON => scriptBody(doc).materialize();

/**
 * The upstream's state as the next generation's document, under a client id that neither the
 * room's ledger nor that state (`written`, its state vector) holds, with the merge's ops written
 * into it; `update` is what the ops wrote, empty when they wrote nothing.
 */
function nextOf(
  room: Room,
  theirs: { state: Uint8Array; written: Map<number, number> },
  ops: readonly BlockOp[],
): { doc: CrdtDoc; clientId: number; update: Uint8Array } {
  const ledger = room.file.log.ledger(room.docId);
  const clientId = freeClientId(ledger, theirs.written);
  const doc = loadDoc(theirs.state, { clientId });
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  // the origin of writes to a document nobody else holds yet
  applyBlockOps(doc, ops, ORIGIN_REPLAY);
  stop();
  const update = made.length === 0 ? new Uint8Array() : mergeUpdates(made);
  return { doc, clientId, update };
}

export function createFollower(ports: {
  storage: Pick<Storage, "directory">;
  clock: Clock;
  limits: SyncLimits;
  rooms: Pick<Rooms, "room" | "load" | "reload" | "left">;
  writePath: Pick<WritePath, "ingest" | "discard">;
  held: Pick<HeldQueue, "size" | "retry">;
  endAll(room: Room, message: Message): void;
}): Follower {
  const { clock, limits, rooms, writePath, held } = ports;
  /** By document: what the room held when it paused, the base of the follow's merge. */
  const bases = new Map<string, DocJSON>();

  /** The room of a placed document; RangeError for one this node has not placed. */
  function roomOf(docId: string): Room {
    const place = ports.storage.directory.placeOf(docId);
    if (place === null || !isDocKind(place.kind))
      throw new RangeError(`no script ${docId} is placed here`);
    return rooms.room(docId, place.home, place.kind);
  }

  /** The room built from its log, loaded whether or not anyone edits it. */
  function loaded(room: Room): CrdtDoc {
    if (room.doc === null) rooms.reload(room);
    if (room.doc === null)
      throw new RangeError(`the room of ${room.docId} is not loaded`);
    return room.doc;
  }

  return {
    ingest(docId, userId, produce) {
      const room = roomOf(docId);
      if (room.mode !== "relay")
        throw new RangeError("ingest is for a relayed document");
      // a room too busy to load takes it all at the next ingest, which asks from its state vector
      if (!rooms.load(room).ok) return;
      const item = ingestItem(room, userId, produce);
      if (item !== null) writePath.ingest(item);
      rooms.left(room);
    },
    pauseRelay(docId) {
      const room = roomOf(docId);
      if (room.mode !== "relay")
        throw new RangeError("a pause is for a relayed document");
      if (bases.has(docId)) return;
      bases.set(docId, materialize(loaded(room)));
      rooms.left(room);
    },
    follow(docId, theirs) {
      const room = roomOf(docId);
      const base = bases.get(docId);
      if (room.mode !== "relay" || base === undefined)
        throw new RangeError("follow needs a paused relayed document");
      if (held.size() > 0) held.retry();
      // what is not committed is the windows' to replay into the new generation
      writePath.discard(room);
      rooms.reload(room);
      const doc = loaded(room);
      const upstream = loadDoc(theirs);
      const merge = mergeByBlock(base, materialize(doc), materialize(upstream));
      const written = readStateVector(upstream.encodeStateVector());
      upstream.destroy();
      const next = nextOf(room, { state: theirs, written }, merge.ops);
      const at = clock.now();
      const { file, row } = room;
      try {
        file.transaction(() =>
          file.generations.freeze({
            docId,
            finalSeq: row.headSeq,
            finalState: doc.encodeState(),
            frozenAt: at,
            purgeAfter: at + limits.frozenKeepMs,
            reason: "follow",
            initialUpdate: next.doc.encodeState(),
            rebuiltByClientId: next.clientId,
            userId: SYSTEM_USER_ID,
          }),
        );
      } finally {
        next.doc.destroy();
      }
      moveRoom(room, ports);
      bases.delete(docId);
      rooms.left(room);
      const { overlaps, setAside } = merge;
      return { update: next.update, overlaps, setAside };
    },
    isPaused: (docId) => bases.has(docId),
  };
}
