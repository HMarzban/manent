// What a relayed room takes from its upstream: updates beyond its own, a pause of what it hands
// upstream, and a new generation built from the upstream's state with its own changes merged in.
import {
  ORIGIN_LOAD,
  ORIGIN_REPLAY,
  applyBlockOps,
  loadDoc,
  mergeUpdates,
  readStateVector,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Overlap, SetAsideBlock } from "@manent/revisions";
import type { BlockOp, DocJSON } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { isDocKind } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { SYSTEM_USER_ID, moveRoom } from "../rebuild/rebuilder.ts";
import { mergeUnique } from "../rebuild/unique-merge.ts";
import { writerClientId } from "./client-ids.ts";
import type { HeldQueue } from "./held.ts";
import { ingestItem } from "./ingest.ts";
import type { Clock, SyncLimits, WritePath } from "./ports.ts";
import type { Room, Rooms } from "./rooms.ts";

export interface RelayIntake {
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
  ids: () => string,
): { doc: CrdtDoc; clientId: number; update: Uint8Array } {
  const ledger = room.file.log.ledger(room.docId);
  const taken = [ledger, theirs.written];
  const clientId = writerClientId(room.mode, ids, taken);
  const doc = loadDoc(theirs.state, { clientId });
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  // the origin of writes to a document nobody else holds yet
  applyBlockOps(doc, ops, ORIGIN_REPLAY);
  stop();
  const update = made.length === 0 ? new Uint8Array() : mergeUpdates(made);
  return { doc, clientId, update };
}

export function createRelayIntake(ports: {
  storage: Pick<Storage, "directory">;
  clock: Clock;
  ids(): string;
  limits: SyncLimits;
  rooms: Pick<Rooms, "room" | "reload" | "committed" | "left">;
  writePath: Pick<
    WritePath,
    "ingest" | "discard" | "holdError" | "heldUpdates"
  >;
  held: Pick<HeldQueue, "size" | "retry">;
  endAll(room: Room, message: Message): void;
}): RelayIntake {
  const { clock, ids, limits, rooms, writePath, held } = ports;
  /** By document: what upstream and the room shared when it paused, the base of the follow's merge. */
  const bases = new Map<string, DocJSON>();

  /** The room of a placed document; RangeError for one this node has not placed. */
  function roomOf(docId: string): Room {
    const place = ports.storage.directory.placeOf(docId);
    if (place === null || !isDocKind(place.kind))
      throw new RangeError(`no script ${docId} is placed here`);
    return rooms.room(docId, place.home, place.kind);
  }

  /** What upstream and the room share: the log, and what the disk holds of the room; the room is not touched. */
  function sharedJSON(room: Room): DocJSON {
    const { doc } = rooms.committed(room);
    for (const update of writePath.heldUpdates(room.docId))
      doc.applyUpdate(update, ORIGIN_LOAD);
    const json = materialize(doc);
    doc.destroy();
    return json;
  }

  return {
    ingest(docId, userId, produce) {
      const room = roomOf(docId);
      if (room.mode !== "relay")
        throw new RangeError("ingest is for a relayed document");
      // loaded whether or not anyone edits it: an ingest is never put off
      if (room.doc === null) rooms.reload(room);
      const item = ingestItem(room, userId, produce);
      if (item !== null) writePath.ingest(item);
      rooms.left(room);
    },
    pauseRelay(docId) {
      const room = roomOf(docId);
      if (room.mode !== "relay")
        throw new RangeError("a pause is for a relayed document");
      // not the room: an edit not yet committed is acknowledged during the pause and never goes upstream,
      // while what the disk holds came from upstream or was handed there when it was held
      if (!bases.has(docId)) bases.set(docId, sharedJSON(room));
      rooms.left(room);
    },
    follow(docId, theirs) {
      const room = roomOf(docId);
      const base = bases.get(docId);
      if (room.mode !== "relay" || base === undefined)
        throw new RangeError("follow needs a paused relayed document");
      if (held.size() > 0) held.retry();
      // what is held of the file would append to the generation the freeze ends
      const holding = writePath.holdError(room.file);
      if (holding !== null) throw holding;
      const committed = rooms.committed(room);
      const mine = materialize(committed.doc);
      const finalState = committed.doc.encodeState();
      committed.doc.destroy();
      const upstream = loadDoc(theirs);
      const merge = mergeUnique(base, mine, materialize(upstream));
      const written = readStateVector(upstream.encodeStateVector());
      upstream.destroy();
      const next = nextOf(room, { state: theirs, written }, merge.ops, ids);
      const at = clock.now();
      const { file } = room;
      try {
        file.transaction(() =>
          file.generations.freeze({
            docId,
            finalSeq: committed.row.headSeq,
            finalState,
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
      // what is not committed is the windows' to replay into the new generation
      writePath.discard(room);
      moveRoom(room, ports);
      bases.delete(docId);
      rooms.left(room);
      const { overlaps, setAside } = merge;
      return { update: next.update, overlaps, setAside };
    },
    isPaused: (docId) => bases.has(docId),
  };
}
