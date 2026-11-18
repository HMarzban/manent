// The checks a SUBSCRIBE passes, in order (the first that fails is the answer), and what passing gives.
import { CrdtUpdateError, readStateVector } from "@manent/crdt";
import { gateDocument } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import type { TokenBucket } from "../limits/bucket.ts";
import type { Access, DocumentAccess } from "./access.ts";
import type { Deletions } from "./deletions.ts";
import { syncError } from "./errors.ts";
import type { Peer, SyncLimits } from "./ports.ts";
import type { Room, Rooms } from "./rooms.ts";

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

/** The answer to a SUBSCRIBE that passed, reporting `headSeq` as the document's head. */
export function subscribedOf(
  room: Room,
  access: Access,
  headSeq: number,
): Message {
  const { row } = room;
  return {
    type: "SUBSCRIBED",
    docId: room.docId,
    generation: row.generation,
    role: access.role,
    capabilities: [...access.capabilities],
    headSeq,
    minSchemaVersion: row.schemaVersion,
    engineVersion: row.engineVersion ?? 0,
    lockLevel: 0,
    lockAnchors: null,
    revision: null,
    airWindow: null,
  };
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
  const doc = { docId: room.docId, generation: room.row.generation };
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
