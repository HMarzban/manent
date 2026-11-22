// A replay: edits a device made against a generation the document has left, carried through each
// generation since and written as that person's edits, once per idempotency key.
import {
  CrdtUpdateError,
  ORIGIN_REPLAY,
  applyBlockOps,
  loadDoc,
  readStateVector,
  revisedOverrides,
  scriptBody,
  updateMeta,
} from "@manent/crdt";
import type { TypedText } from "@manent/crdt";
import type { BlockMerge } from "@manent/revisions";
import { blockText, blockView, validateBlocks } from "@manent/schema";
import type { BlockOp, DocJSON } from "@manent/schema";
import type { DocFile, Home, Storage, VersionRow } from "@manent/storage";
import type {
  DocKind,
  ReplayRefusal,
  ReplayRequest,
  ReplayResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";
import type { DocumentAccess } from "../sync/access.ts";
import { writeOnCopy } from "../sync/authority-write.ts";
import type { Clock, SyncLimits, WritePath } from "../sync/ports.ts";
import type { Room, Rooms } from "../sync/rooms.ts";
import { replayBase } from "./replay-base.ts";
import { readRequest, storedResponse } from "./replay-request.ts";
import { writeTyping } from "./replay-typing.ts";
import { mergeUniqueThrough } from "./unique-merge.ts";

export type ReplayOutcome =
  { ok: true; response: ReplayResponse } | { ok: false; code: ReplayRefusal };

/** What a key stores: the response without serverSeq, which is the row's `seq`. */
type Stored = Omit<ReplayResponse, "serverSeq">;

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
 * The ops, with the device's typing where it was typed, and the overrides that differ from the
 * room's as one update, written on a copy and applied to the room's document under ORIGIN_REPLAY,
 * under `writer` when given; null when they wrote nothing.
 */
function writeOps(
  room: Room,
  changes: {
    ops: readonly BlockOp[];
    typed: Checked["typed"];
    overrides: Checked["overrides"];
    writer?: number;
  },
  ids: () => string,
): Uint8Array | null {
  const written = writeOnCopy(
    room,
    ORIGIN_REPLAY,
    (copy) => {
      writeTyping(copy, changes.ops, changes.typed, ORIGIN_REPLAY);
      applyBlockOps(copy, changes.ops, ORIGIN_REPLAY);
      const overrides = revisedOverrides(copy);
      for (const [key, value] of changes.overrides)
        if (overrides.get(key) !== value)
          overrides.set(key, value, ORIGIN_REPLAY);
      return { ok: true };
    },
    ids,
    changes.writer,
  );
  return written.ok ? written.update : null;
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
  found: Pick<Checked, "setAside" | "unseen">,
  room: Room,
): Stored {
  const merged = new Set<string | null>(
    merge.setAside.map((item) => item.blockId),
  );
  return {
    docId: room.docId,
    generation: room.row.generation,
    applied: merge.applied,
    overlaps: merge.overlaps.map((overlap) => ({
      blockId: overlap.blockId,
      text: blockText(blockView(overlap.mine)),
    })),
    // the merge sets aside mine's whole block, which still holds the unseen text found in it
    setAside: [
      ...found.setAside,
      ...found.unseen.filter((item) => !merged.has(item.blockId)),
      ...merge.setAside,
    ].map(({ blockId, nearBlockId, text }) => ({ blockId, nearBlockId, text })),
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
  /** Anyone's text the updates removed unseen, then own text the rows base moved on by removed from mine unseen. */
  setAside: ReplaySetAside[];
  /** Own text mine still holds that the generation's later rows removed unseen. */
  unseen: ReplaySetAside[];
  /** By block, mine's text and which of its characters the device's updates wrote. */
  typed: ReadonlyMap<string, TypedText>;
  /** Mine's revisedOverrides entries that differ from base's; null removes one. */
  overrides: [string, string | null][];
  /** The client ids of the device's updates, in order. An authority writes the replay under the first its document does not hold, so that the device knows the text as its own; a relayed room draws one, as its upstream may hold any. */
  writers: number[];
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
    const { base, mine, setAside, unseen, typed, overrides } = based;
    const { kind } = resolved;
    return {
      userId,
      request,
      kind,
      base,
      mine,
      frozen,
      setAside,
      unseen,
      typed,
      overrides,
      writers: clientIds,
    };
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
    const merge = mergeUniqueThrough(checked.base, checked.mine, theirs);
    if (!isWritable(merge.ops)) return refused("invalid");
    const { typed, overrides } = checked;
    const held = readStateVector(doc.encodeStateVector());
    const writer =
      room.mode === "authority"
        ? checked.writers.find((clientId) => !held.has(clientId))
        : undefined;
    const changes = { ops: merge.ops, typed, overrides, writer };
    const update = writeOps(room, changes, ports.ids);
    const stored = storedOf(merge, checked, room);
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
