// The checks a SUBSCRIBE passes, in order (the first that fails is the answer), and what passing gives.
import { CrdtUpdateError, readStateVector } from "@manent/crdt";
import { gateDocument } from "@manent/sync-protocol";
import type { DocRef, Message } from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import type { PeerState, Rebuilder } from "../rebuild/rebuilder.ts";
import type { Access, DocumentAccess } from "./access.ts";
import type { AwarenessHub } from "./awareness.ts";
import type { Deletions } from "./deletions.ts";
import { syncError } from "./errors.ts";
import type { Healing } from "./heal.ts";
import type { Peer, SubscribedExtras, SyncLimits } from "./ports.ts";
import type { Room, Rooms, Subscription } from "./rooms.ts";
import { isStorageError } from "./storage-error.ts";

export type SubscribeMessage = Extract<Message, { type: "SUBSCRIBE" }>;

/** On a refusal, `room` is the room the checks reached, for the caller to release; null before one. */
export type SubscribeCheck =
  | { ok: true; room: Room; access: Access; mode: "edit" | "view" }
  | { ok: false; answer: Message; room: Room | null };

const RETRY_MS = 1000;

function refuse(answer: Message, room: Room | null = null): SubscribeCheck {
  return { ok: false, answer, room };
}

export function checkSubscribe(
  ports: {
    access: DocumentAccess;
    rooms: Rooms;
    limits: SyncLimits;
    buckets: { frames: TokenBucket; bytes: TokenBucket };
  },
  peer: Peer,
  message: SubscribeMessage,
): SubscribeCheck {
  const { docId, generation, mode, clientIds } = message;
  const doc = { docId, generation };
  const frame = ports.buckets.frames.take(1);
  const taken = frame.ok ? ports.buckets.bytes.take(1) : frame;
  if (!taken.ok)
    return refuse(
      syncError("rate_limited", doc, { retryAfterMs: taken.retryAfterMs }),
    );
  if (clientIds.length > ports.limits.clientIdsPerSubscribe)
    return refuse(syncError("too_many_client_ids", doc));
  const resolved = ports.access.resolve(peer.userId, docId);
  if (!resolved.ok) return refuse(syncError(resolved.code, doc));
  const room = ports.rooms.room(docId, resolved.home, resolved.kind);
  const { row } = room;
  if (generation !== 0 && generation !== row.generation)
    return refuse(
      {
        type: "GENERATION_MOVED",
        docId,
        generation,
        newGeneration: row.generation,
      },
      room,
    );
  if (mode === "prompter")
    return refuse(syncError("prompter_unavailable", doc), room);
  const { role } = resolved.access;
  if (mode === "edit") {
    if (role === "comment" || role === "view")
      return refuse(syncError("read_only_role", doc), room);
    const gate = gateDocument(peer.versions, {
      minSchemaVersion: row.schemaVersion,
      engineVersion: row.engineVersion ?? 0,
    });
    if (gate === "read_only") return refuse(syncError("too_old", doc), room);
    const claimed = clientIds.some((id) => {
      const owner = room.owners.get(id);
      return owner !== undefined && owner !== peer.userId;
    });
    if (claimed) return refuse(syncError("client_id_taken", doc), room);
  }
  const others = room.editors.size + room.viewers.size;
  const held = room.editors.has(peer) || room.viewers.has(peer) ? 1 : 0;
  if (others - held >= ports.limits.subscribersPerDocument)
    return refuse(
      syncError("document_full", doc, { retryAfterMs: RETRY_MS }),
      room,
    );
  if (mode === "edit" && !ports.rooms.load(room).ok)
    return refuse(syncError("busy", doc, { retryAfterMs: RETRY_MS }), room);
  return { ok: true, room, access: resolved.access, mode };
}

/** The listed client ids become the user's where nobody holds them, and the room learns its colours. */
export function registerEditor(
  room: Room,
  userId: string,
  clientIds: readonly number[],
): void {
  room.file.log.registerClients(room.docId, userId, clientIds);
  for (const id of clientIds)
    if (!room.owners.has(id)) room.owners.set(id, userId);
  for (const [user, color] of room.file.log.colors(room.docId))
    room.colors.set(user, color);
}

/** What SUBSCRIBED says of locks and revisions when no feature says otherwise. */
const PLAIN_EXTRAS: SubscribedExtras = Object.freeze({
  lockLevel: 0,
  lockAnchors: null,
  revision: null,
});

/** The answer to a SUBSCRIBE that passed, reporting `headSeq` as the document's head; null `extras` are the plain values. */
export function subscribedOf(
  room: Room,
  access: Access,
  headSeq: number,
  extras: SubscribedExtras | null,
): Message {
  const { row } = room;
  const { lockLevel, lockAnchors, revision } = extras ?? PLAIN_EXTRAS;
  return {
    type: "SUBSCRIBED",
    docId: room.docId,
    generation: row.generation,
    role: access.role,
    capabilities: [...access.capabilities],
    headSeq,
    minSchemaVersion: row.schemaVersion,
    engineVersion: row.engineVersion ?? 0,
    lockLevel,
    lockAnchors: lockAnchors === null ? null : { table: lockAnchors },
    revision,
    airWindow: null,
  };
}

/** The document a room holds, at the generation it is on. */
export function docOf(room: Room): DocRef {
  return { docId: room.docId, generation: room.row.generation };
}

/** What a SUBSCRIBE reaches in the service: its checks, the room, and the peer's answers. */
export interface SubscribePorts {
  access: DocumentAccess;
  rooms: Rooms;
  limits: SyncLimits;
  heal: Pick<Healing, "headOf" | "subscribed">;
  presence: Pick<AwarenessHub, "joined" | "left">;
  writePath: { queued(): number; flush(): void };
  rebuilder: Pick<Rebuilder, "touched">;
  snapshotOf(room: Room): Message;
  tell(peer: Peer, message: Message): void;
  end(peer: Peer, docId: string): void;
  /** SUBSCRIBED's lock and revision fields; null: the plain values. */
  extras(docId: string): SubscribedExtras | null;
}

/** A SUBSCRIBE: refused with the first check that fails, otherwise held, answered SUBSCRIBED, then step 1 or a snapshot. */
export function subscribe(
  ports: SubscribePorts,
  peer: Peer,
  state: PeerState,
  message: SubscribeMessage,
): void {
  const { access, rooms, limits, heal, presence, writePath } = ports;
  const { rebuilder, snapshotOf, tell, end } = ports;
  const { docId } = message;
  const check = checkSubscribe(
    { access, rooms, limits, buckets: state.buckets },
    peer,
    message,
  );
  if (!check.ok) {
    end(peer, docId);
    if (check.room !== null) rooms.left(check.room);
    return tell(peer, check.answer);
  }
  const { room, mode } = check;
  try {
    heal.subscribed(room, message.lastServerSeq);
    if (mode === "edit") registerEditor(room, peer.userId, message.clientIds);
  } catch (error) {
    // the store refused what a SUBSCRIBE writes: told as a failed commit is, and nothing held
    if (!isStorageError(error)) throw error;
    end(peer, docId);
    rooms.left(room);
    const retryAfterMs = limits.poisonRetryMs;
    return tell(
      peer,
      syncError("storage_failed", docOf(room), { retryAfterMs }),
    );
  }
  if (mode === "view") presence.left(room, peer);
  room.editors.delete(peer);
  room.viewers.delete(peer);
  const { access: granted } = check;
  const subscription: Subscription = {
    peer,
    mode,
    access: granted,
    stalled: false,
  };
  // a viewer's snapshot holds only what is committed, and comes before any patch
  if (mode === "view" && writePath.queued() > 0) writePath.flush();
  const { lastServerSeq } = message;
  state.held.set(docId, { room, subscription, lastServerSeq });
  (mode === "edit" ? room.editors : room.viewers).set(peer, subscription);
  const extras = ports.extras(docId);
  tell(peer, subscribedOf(room, granted, heal.headOf(room), extras));
  const vector = room.doc?.encodeStateVector();
  if (mode === "edit" && vector !== undefined) {
    rebuilder.touched(room);
    tell(peer, { type: "SYNC", ...docOf(room), step: "step1", data: vector });
    return presence.joined(room, peer);
  }
  tell(peer, snapshotOf(room));
}

/**
 * The answer to an editor's step 1: the server's step 2, the cached full state for an empty
 * vector, otherwise what the vector lacks. Step 2's delete set also holds what Yjs deleted with a
 * deleted parent, so it comes after the deletions the rows after `lastServerSeq` made, when there
 * are any, which tell the client which of its own text that was. A device that holds nothing and
 * never synced has no text to set aside. The deletions are read only from committed rows, so what
 * the write path holds is committed first; a failed commit answers every subscriber itself. Bytes
 * that are not a state vector are refused, and may be sent again.
 */
export function answerStepOne(
  ports: {
    rooms: Rooms;
    deletions: Deletions;
    writePath: { queued(): number; flush(): void };
  },
  room: Room,
  step: { vector: Uint8Array; lastServerSeq: number },
): Message[] {
  const doc = docOf(room);
  if (room.doc === null)
    throw new RangeError(`the room of ${room.docId} is not loaded`);
  let clocks: Map<number, number>;
  try {
    clocks = readStateVector(step.vector);
  } catch (error) {
    if (!(error instanceof CrdtUpdateError)) throw error;
    return [syncError("bad_update", doc, { permanent: false })];
  }
  if (ports.writePath.queued() > 0) ports.writePath.flush();
  // the commit failed: the room was dropped, and its subscribers told
  if (room.doc === null) return [];
  const fresh = clocks.size === 0;
  const data = fresh ? ports.rooms.fullState(room) : room.doc.diff(step.vector);
  const stepTwo: Message = { type: "SYNC", ...doc, step: "step2", data };
  const deletions =
    fresh && step.lastServerSeq === 0
      ? null
      : ports.deletions.since(room, step.lastServerSeq);
  return deletions === null
    ? [stepTwo]
    : [{ type: "SYNC", ...doc, step: "update", data: deletions }, stepTwo];
}
