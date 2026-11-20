// A replay: edits a device made against a generation the document has left, carried through each
// generation since and written as that person's edits, once per idempotency key.
import {
  CrdtUpdateError,
  ORIGIN_REPLAY,
  applyBlockOps,
  loadDoc,
  mergeUpdates,
  readStateVector,
  scriptBody,
  updateMeta,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { mergeThrough } from "@manent/revisions";
import type { BlockMerge } from "@manent/revisions";
import { blockText, blockView, validateBlocks } from "@manent/schema";
import type { BlockOp, DocJSON } from "@manent/schema";
import type {
  DocFile,
  Home,
  ReplayRow,
  Storage,
  VersionRow,
} from "@manent/storage";
import {
  decodeReplayUpdates,
  isDocId,
  isReplayKey,
} from "@manent/sync-protocol";
import type {
  DocKind,
  ReplayOverlap,
  ReplayRefusal,
  ReplayRequest,
  ReplayResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";
import type { DocumentAccess } from "../sync/access.ts";
import type { Clock, SyncLimits } from "../sync/ports.ts";
import type { Room, Rooms } from "../sync/rooms.ts";
import type { WritePath } from "../sync/write-path.ts";
import { freeClientId } from "./rebuilder.ts";
import { replayBase } from "./replay-base.ts";

export type ReplayOutcome =
  { ok: true; response: ReplayResponse } | { ok: false; code: ReplayRefusal };

type Read =
  | { ok: true; request: ReplayRequest; updates: Uint8Array[] }
  | { ok: false; code: "bad_request" | "too_large" };

const isCount = (value: unknown, least: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= least;
const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || isText(value);

/** The fields of a JSON object; null for anything else. */
function fieldsOf(value: unknown): ((name: string) => unknown) | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return (name) => Reflect.get(value, name);
}

/**
 * The body as a request and its updates. Its size is the length of the updates' base64 text,
 * which is nearly all of a body, and is checked before any of it is decoded.
 */
function readRequest(body: unknown, limits: SyncLimits): Read {
  const bad: Read = { ok: false, code: "bad_request" };
  const field = fieldsOf(body);
  if (field === null) return bad;
  const [docId, generation, lastServerSeq, key, given] = [
    "docId",
    "generation",
    "lastServerSeq",
    "key",
    "updates",
  ].map(field);
  if (!isDocId(docId) || !isReplayKey(key) || !Array.isArray(given)) return bad;
  if (!isCount(generation, 1) || !isCount(lastServerSeq, 0)) return bad;
  if (!given.every(isText)) return bad;
  const size = given.reduce((sum, text) => sum + text.length, 0);
  if (size > limits.replayBodyBytes) return { ok: false, code: "too_large" };
  const updates = decodeReplayUpdates(given);
  if (updates === null) return bad;
  const request = { docId, generation, lastServerSeq, key, updates: given };
  return { ok: true, request, updates };
}

function isOverlap(value: unknown): value is ReplayOverlap {
  const field = fieldsOf(value);
  return field !== null && isText(field("blockId")) && isText(field("text"));
}

function isSetAside(value: unknown): value is ReplaySetAside {
  const field = fieldsOf(value);
  if (field === null || !isText(field("text"))) return false;
  return isTextOrNull(field("blockId")) && isTextOrNull(field("nearBlockId"));
}

/** What a key stores: the response without serverSeq, which is the row's `seq`. */
type Stored = Omit<ReplayResponse, "serverSeq">;

/** The answer stored under a key. RangeError when what is stored is not one. */
function storedResponse(row: ReplayRow): ReplayResponse {
  const broken = new RangeError(
    `the answer stored under ${row.key} is not one`,
  );
  const stored: unknown = JSON.parse(row.result);
  const field = fieldsOf(stored);
  if (field === null) throw broken;
  const docId = field("docId");
  const generation = field("generation");
  const applied = field("applied");
  const overlaps = field("overlaps");
  const setAside = field("setAside");
  if (!isText(docId) || !isCount(generation, 1) || !isCount(applied, 0))
    throw broken;
  if (!Array.isArray(overlaps) || !overlaps.every(isOverlap)) throw broken;
  if (!Array.isArray(setAside) || !setAside.every(isSetAside)) throw broken;
  return { docId, generation, serverSeq: row.seq, applied, overlaps, setAside };
}

/** Every client id in the updates; null when one of them is not an update. */
function clientIdsOf(updates: readonly Uint8Array[]): number[] | null {
  try {
    return updates.flatMap((update) =>
      updateMeta(update).map((meta) => meta.clientId),
    );
  } catch (error) {
    if (!(error instanceof CrdtUpdateError)) throw error;
    return null;
  }
}

function ownClientIds(
  file: DocFile,
  docId: string,
  userId: string,
): Set<number> {
  const own = new Set<number>();
  for (const [clientId, owner] of file.log.ledger(docId))
    if (owner.userId === userId) own.add(clientId);
  return own;
}

/** The final state of each generation from `from` up to the current one; null when one was purged. */
function finalStates(
  file: DocFile,
  docId: string,
  from: number,
  current: number,
): Uint8Array[] | null {
  const states: Uint8Array[] = [];
  for (let generation = from; generation < current; generation++) {
    const state = file.generations.get(docId, generation)?.finalState;
    if (state === undefined || state === null) return null;
    states.push(state);
  }
  return states;
}

function contentOf(state: Uint8Array): DocJSON {
  const doc = loadDoc(state);
  const content = scriptBody(doc).materialize();
  doc.destroy();
  return content;
}

/**
 * The ops as one update, applied to the room's document under ORIGIN_REPLAY; null when they wrote nothing. They are
 * written under a client id that neither the ledger nor the document holds, which the commit registers to this person.
 */
function writeOps(
  room: Room,
  doc: CrdtDoc,
  ops: readonly BlockOp[],
): Uint8Array | null {
  const written = readStateVector(doc.encodeStateVector()).set(doc.clientId, 0);
  const clientId = freeClientId(room.file.log.ledger(room.docId), written);
  const copy = loadDoc(doc.encodeState(), { clientId });
  const made: Uint8Array[] = [];
  copy.subscribe((update) => made.push(update));
  try {
    applyBlockOps(copy, ops, ORIGIN_REPLAY);
  } finally {
    copy.destroy();
  }
  if (made.length === 0) return null;
  const update = mergeUpdates(made);
  doc.applyUpdate(update, ORIGIN_REPLAY);
  return update;
}

/** Every block the ops write passes validation without a reject or newer issue. */
function isWritable(ops: readonly BlockOp[]): boolean {
  const blocks = ops.flatMap((op) => (op.op === "delete" ? [] : [op.block]));
  return validateBlocks(blocks, { isIdTaken: () => false }).every(
    (issue) => issue.severity !== "reject" && issue.severity !== "newer",
  );
}

/** The answer a key keeps: overlaps carry this device's text, and set-aside text comes first from the updates. */
function storedOf(
  merge: BlockMerge,
  setAside: readonly ReplaySetAside[],
  room: Room,
): Stored {
  return {
    docId: room.docId,
    generation: room.row.generation,
    applied: merge.applied,
    overlaps: merge.overlaps.map((overlap) => ({
      blockId: overlap.blockId,
      text: blockText(blockView(overlap.mine)),
    })),
    setAside: [...setAside, ...merge.setAside].map(
      ({ blockId, nearBlockId, text }) => ({ blockId, nearBlockId, text }),
    ),
  };
}

/** The version a replay keeps of the document before it writes. */
const PRE_MERGE = Object.freeze({
  kind: "pre_merge",
  name: null,
  deviceId: null,
} as const);

const refused = (code: ReplayRefusal): ReplayOutcome => ({ ok: false, code });

/** `storage`, `clock` and `ids` are the service's own. */
export interface ReplayPorts {
  storage: Storage;
  clock: Clock;
  ids(): string;
  access: DocumentAccess;
  limits: SyncLimits;
  rooms: Pick<Rooms, "room" | "load" | "left">;
  writePath: Pick<WritePath, "replay" | "flush" | "queued">;
}

interface Running {
  userId: string;
  outcome: Promise<ReplayOutcome>;
}

/** What the checks before the merge established. */
interface Checked {
  userId: string;
  request: ReplayRequest;
  base: DocJSON;
  mine: DocJSON;
  kind: DocKind;
  frozen: Uint8Array[];
  setAside: ReplaySetAside[];
}

/**
 * SyncService.replay. A key this person's replay was answered under answers the same again,
 * whatever has happened since; one being computed is waited for; another person's is bad_request.
 */
export function createReplay(
  ports: ReplayPorts,
): (userId: string, body: unknown) => Promise<ReplayOutcome> {
  const { storage, access, rooms, writePath, limits, clock } = ports;
  /** By document id, then key: the replays this process is computing. */
  const running = new Map<string, Map<string, Running>>();

  /** The checks after the key, in order, then base and mine; a refusal writes no version and no row. */
  function check(
    userId: string,
    request: ReplayRequest,
    updates: Uint8Array[],
    file: DocFile,
  ): Checked | ReplayRefusal {
    const { docId, generation: from, lastServerSeq } = request;
    const resolved = access.resolve(userId, docId);
    if (!resolved.ok) return resolved.code;
    const { role } = resolved.access;
    if (role === "comment" || role === "view") return "forbidden";
    const clientIds = clientIdsOf(updates);
    const claimed = file.log.registerClients(docId, userId, clientIds ?? []);
    if (claimed.length > 0) return "forbidden";
    const row = file.log.get(docId);
    if (row === null) return "not_found";
    if (from === row.generation) return "generation_current";
    const closed = from < row.generation;
    const frozenRow = closed ? file.generations.get(docId, from) : null;
    if (frozenRow === null) return "unknown_generation";
    const frozen = finalStates(file, docId, from, row.generation);
    if (clock.now() > frozenRow.purgeAfter || frozen === null)
      return "past_window";
    if (clientIds === null) return "invalid";
    const own = ownClientIds(file, docId, userId);
    const based = replayBase(file, docId, from, lastServerSeq, updates, own);
    if (!based.ok) return based.code;
    const { base, mine, setAside } = based;
    const { kind } = resolved;
    return { userId, request, kind, base, mine, frozen, setAside };
  }

  /** The merge through every generation since, written on the loaded room. */
  function write(
    room: Room,
    checked: Checked,
  ): Promise<ReplayOutcome> | ReplayOutcome {
    if (!rooms.load(room).ok) return refused("busy");
    // what the write path holds commits first, so the merge and the version see only the log
    if (writePath.queued() > 0) writePath.flush();
    const { doc, row } = room;
    if (doc === null) return refused("busy");
    const { userId, request } = checked;
    const current = scriptBody(doc).materialize();
    const theirs = [...checked.frozen.map(contentOf), current];
    const merge = mergeThrough(checked.base, checked.mine, theirs);
    if (!isWritable(merge.ops)) return refused("invalid");
    const update = writeOps(room, doc, merge.ops);
    const stored = storedOf(merge, checked.setAside, room);
    const createdAt = clock.now();
    const version: VersionRow | null =
      update === null
        ? null
        : {
            ...PRE_MERGE,
            id: ports.ids(),
            docId: room.docId,
            generation: row.generation,
            seq: row.headSeq,
            createdByUserId: userId,
            createdAt,
          };
    const { key, generation: fromGeneration } = request;
    const record = {
      docId: room.docId,
      key,
      userId,
      fromGeneration,
      generation: row.generation,
      result: JSON.stringify(stored),
      createdAt,
    };
    return new Promise((resolve) =>
      writePath.replay(room, { userId, update, version, record }, (done) =>
        resolve(
          done.ok
            ? { ok: true, response: { ...stored, serverSeq: done.seq } }
            : refused("busy"),
        ),
      ),
    );
  }

  /** The checks, then the write; the room is released once the replay is answered. */
  async function apply(
    userId: string,
    request: ReplayRequest,
    updates: Uint8Array[],
    home: Home,
  ): Promise<ReplayOutcome> {
    const checked = check(userId, request, updates, storage.open(home));
    if (typeof checked === "string") return refused(checked);
    const room = rooms.room(request.docId, home, checked.kind);
    try {
      return await write(room, checked);
    } finally {
      rooms.left(room);
    }
  }

  return async (userId, body) => {
    const read = readRequest(body, limits);
    if (!read.ok) return refused(read.code);
    const { request, updates } = read;
    const { docId, key } = request;
    const place = storage.directory.placeOf(docId);
    if (place === null) return refused("not_found");
    const stored = storage.open(place.home).replays.get(docId, key);
    if (stored !== null)
      return stored.userId === userId
        ? { ok: true, response: storedResponse(stored) }
        : refused("bad_request");
    const keys = running.get(docId) ?? new Map<string, Running>();
    const pending = keys.get(key);
    if (pending !== undefined)
      return pending.userId === userId
        ? pending.outcome
        : refused("bad_request");
    const outcome = apply(userId, request, updates, place.home);
    keys.set(key, { userId, outcome });
    running.set(docId, keys);
    try {
      return await outcome;
    } finally {
      keys.delete(key);
      if (keys.size === 0) running.delete(docId);
    }
  };
}
