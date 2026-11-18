// Rooms: one per document someone has open, holding the live document while anyone edits it.
import { ORIGIN_LOAD, createDoc, discardPending, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocFile, DocumentRow, Home, Storage } from "@manent/storage";
import type { DocKind } from "@manent/sync-protocol";
import { createTokenBucket } from "../limits/bucket.ts";
import type { Access } from "./access.ts";
import type { Checkpointer, Clock, Peer, SyncLimits } from "./ports.ts";

export interface Subscription {
  peer: Peer;
  mode: "edit" | "view";
  access: Access;
  /** A push was refused for good: later pushes and settings are dropped until the next SUBSCRIBE. */
  stalled: boolean;
}

export interface Room {
  readonly docId: string;
  readonly home: Home;
  readonly file: DocFile;
  readonly kind: DocKind;
  /** Read again on load and after each commit. */
  row: DocumentRow;
  /** Null while nobody is editing. */
  doc: CrdtDoc | null;
  /** An estimate of the encoded document: the loaded state plus every update applied since. */
  sizeBytes: number;
  /** Updates committed since the last checkpoint was asked for. */
  sinceCheckpoint: number;
  readonly editors: Map<Peer, Subscription>;
  readonly viewers: Map<Peer, Subscription>;
  /** Yjs client id → userId, from the ledger; the service adds what it registers. */
  readonly owners: Map<number, string>;
  /** userId → colour index, from the log; the service adds what it registers. */
  readonly colors: Map<string, number>;
}

export interface Rooms {
  /** The room object, loaded or not; created on first use. RangeError for a document the log does not hold. */
  room(docId: string, home: Home, kind: DocKind): Room;
  find(docId: string): Room | null;
  /** Nothing to do when the room is loaded already. */
  load(room: Room): { ok: true } | { ok: false; code: "busy" };
  /** Discards the document and builds it again from the log. */
  reload(room: Room): void;
  /** Forgets the documents and the rooms; telling their subscribers is the caller's job. */
  drop(rooms: readonly Room[]): void;
  /** The whole document, encoded once per change and reused for every joiner. RangeError for a room not loaded. */
  fullState(room: Room): Uint8Array;
  /** After a commit: the cached state, the size, the row and the checkpoint counter move on. */
  changed(room: Room, updateBytes: number): void;
  /** A subscriber left: the idle timer starts when no editor remains; a room nobody holds and nobody edits is forgotten. */
  left(room: Room): void;
  stats(): { rooms: number; loaded: number };
  /** Asks for a checkpoint of every room that changed since its last one, then forgets them all. */
  closeAll(): void;
}

interface Built {
  doc: CrdtDoc;
  sizeBytes: number;
  sinceCheckpoint: number;
}

/**
 * The newest checkpoint that verifies, then the tail after it. A corrupt row is quarantined by the
 * read; structs that waited for it are dropped, and the document is flagged healing at the
 * checkpoint unless the quarantine flagged it already.
 */
function build(file: DocFile, row: DocumentRow): Built {
  const { id, generation } = row;
  const checkpoint = file.checkpoints.newest(id, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const from = checkpoint?.seq ?? 0;
  const tail = file.log.tail(id, generation, from);
  let sizeBytes = checkpoint?.state.byteLength ?? 0;
  for (const { update } of tail.rows) {
    doc.applyUpdate(update, ORIGIN_LOAD);
    sizeBytes += update.byteLength;
  }
  if (discardPending(doc) && file.log.healing(id) === null)
    file.log.flagHealing(id, "quarantine", from);
  return { doc, sizeBytes, sinceCheckpoint: tail.rows.length };
}

function readPeople(room: Room): void {
  for (const [clientId, { userId }] of room.file.log.ledger(room.docId))
    room.owners.set(clientId, userId);
  for (const [userId, color] of room.file.log.colors(room.docId))
    room.colors.set(userId, color);
}

export function createRooms(ports: {
  storage: Storage;
  clock: Clock;
  limits: SyncLimits;
  checkpointer: Checkpointer;
}): Rooms {
  const { storage, clock, limits, checkpointer } = ports;
  const rooms = new Map<string, Room>();
  const encoded = new Map<Room, Uint8Array>();
  const idle = new Map<Room, () => void>();
  // a counter, not the clock, so that rooms touched in one instant keep their order
  const touched = new Map<Room, number>();
  let touches = 0;
  const loads = createTokenBucket({
    perSecond: limits.roomLoadsPerSecond,
    burst: limits.roomLoadsPerSecond,
    now: clock.now,
  });

  const touch = (room: Room): void => {
    touched.set(room, ++touches);
  };

  const stopIdle = (room: Room): void => {
    idle.get(room)?.();
    idle.delete(room);
  };

  const forget = (room: Room): void => {
    stopIdle(room);
    encoded.delete(room);
    touched.delete(room);
    if (rooms.get(room.docId) === room) rooms.delete(room.docId);
  };

  const checkpoint = (room: Room): void => {
    if (room.sinceCheckpoint === 0) return;
    checkpointer.request({ home: room.home, docId: room.docId });
    room.sinceCheckpoint = 0;
  };

  const discard = (room: Room): void => {
    room.doc?.destroy();
    room.doc = null;
    encoded.delete(room);
  };

  const unload = (room: Room): void => {
    checkpoint(room);
    discard(room);
    stopIdle(room);
    if (room.viewers.size === 0) forget(room);
  };

  const rebuild = (room: Room): void => {
    room.row = room.file.log.get(room.docId) ?? room.row;
    const built = build(room.file, room.row);
    discard(room);
    room.doc = built.doc;
    room.sizeBytes = built.sizeBytes;
    room.sinceCheckpoint = built.sinceCheckpoint;
    readPeople(room);
    touch(room);
  };

  /** The idlest loaded room without an editor; null when every loaded room has one. */
  const evictable = (): Room | null => {
    let idlest: Room | null = null;
    for (const room of rooms.values()) {
      if (room.doc === null || room.editors.size > 0) continue;
      if (
        idlest === null ||
        (touched.get(room) ?? 0) < (touched.get(idlest) ?? 0)
      )
        idlest = room;
    }
    return idlest;
  };

  const loadedCount = (): number =>
    [...rooms.values()].filter((room) => room.doc !== null).length;

  return {
    room(docId, home, kind) {
      const existing = rooms.get(docId);
      if (existing !== undefined) return existing;
      const file = storage.open(home);
      const row = file.log.get(docId);
      if (row === null)
        throw new RangeError(
          `the log of ${home.kind}:${home.id} has no document ${docId}`,
        );
      const created: Room = {
        docId,
        home: { ...home },
        file,
        kind,
        row,
        doc: null,
        sizeBytes: 0,
        sinceCheckpoint: 0,
        editors: new Map(),
        viewers: new Map(),
        owners: new Map(),
        colors: new Map(),
      };
      readPeople(created);
      rooms.set(docId, created);
      return created;
    },
    find: (docId) => rooms.get(docId) ?? null,
    load(room) {
      if (room.doc !== null) return { ok: true };
      const full = loadedCount() >= limits.maxLoadedRooms;
      const victim = full ? evictable() : null;
      if (full && victim === null) return { ok: false, code: "busy" };
      if (!loads.take(1).ok) return { ok: false, code: "busy" };
      if (victim !== null) unload(victim);
      rebuild(room);
      rooms.set(room.docId, room);
      return { ok: true };
    },
    reload: rebuild,
    drop(dropped) {
      for (const room of dropped) {
        discard(room);
        room.editors.clear();
        room.viewers.clear();
        forget(room);
      }
    },
    fullState(room) {
      if (room.doc === null)
        throw new RangeError(`the room of ${room.docId} is not loaded`);
      touch(room);
      const cached = encoded.get(room);
      if (cached !== undefined) return cached;
      const state = room.doc.encodeState();
      encoded.set(room, state);
      return state;
    },
    changed(room, updateBytes) {
      encoded.delete(room);
      room.row = room.file.log.get(room.docId) ?? room.row;
      room.sizeBytes += updateBytes;
      room.sinceCheckpoint += 1;
      touch(room);
      if (room.sinceCheckpoint >= limits.checkpointEvery) checkpoint(room);
    },
    left(room) {
      if (room.editors.size > 0) return;
      if (room.doc === null) {
        if (room.viewers.size === 0) forget(room);
        return;
      }
      stopIdle(room);
      const cancel = clock.schedule(() => {
        idle.delete(room);
        if (room.editors.size === 0) unload(room);
      }, limits.roomIdleMs);
      idle.set(room, cancel);
    },
    stats: () => ({ rooms: rooms.size, loaded: loadedCount() }),
    closeAll() {
      for (const room of rooms.values()) {
        checkpoint(room);
        discard(room);
        forget(room);
      }
    },
  };
}
