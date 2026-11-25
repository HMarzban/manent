// How one person's upstream document and the node's room are brought level: what each holds that
// the other lacks, and the node following the cloud when the upstream document is replaced.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  readStateVector,
  updateMeta,
  writeStateVector,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blockText, blockView } from "@manent/schema";
import type { SyncService, UpstreamItem } from "@manent/server-core";
import { StorageError } from "@manent/storage";
import type { Storage } from "@manent/storage";
import type {
  Clock,
  DocHandle,
  LoadedDocument,
  RecoveredItem,
} from "@manent/sync-client";
import type { UpstreamFactory } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";

/** The origin under which the node writes a window's update into an upstream document. */
export const ORIGIN_RELAY = "relay";

/** As a held commit: a follow the disk refused is tried again after this long. */
const FOLLOW_RETRY_MS = 5_000;

/** The node's document as its log holds it, built without its room; null for one it has not placed. The caller destroys it. */
export function nodeDocOf(storage: Storage, docId: string): CrdtDoc | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0);
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  // what waits for a quarantined row is the room's to drop, not this copy's
  discardPending(doc);
  return doc;
}

/**
 * What `upstream` holds beyond `vector`, without what waits there for something it lacks: the room
 * would wait for it too, and take no push of a window after it.
 */
function placedDiff(upstream: CrdtDoc, vector: Uint8Array): Uint8Array {
  if (!upstream.hasPendingStructs()) return upstream.diff(vector);
  const placed = loadDoc(upstream.encodeState());
  try {
    discardPending(placed);
    return placed.diff(vector);
  } finally {
    placed.destroy();
  }
}

/** The client IDs of an update; [] for none. */
export function clientIdsOf(update: Uint8Array): number[] {
  return update.length === 0 ? [] : updateMeta(update).map((m) => m.clientId);
}

/**
 * Writes into `upstream` what the node's document holds of `own` client IDs beyond the upstream's
 * clocks for them, with every deletion the node knows. False when that left structs waiting for
 * something the upstream lacks: they are dropped, to be written again once it has it.
 */
function writeOwn(
  node: CrdtDoc,
  upstream: CrdtDoc,
  own: ReadonlySet<number>,
): boolean {
  const target = readStateVector(node.encodeStateVector());
  const held = readStateVector(upstream.encodeStateVector());
  for (const id of own) target.set(id, held.get(id) ?? 0);
  upstream.applyUpdate(node.diff(writeStateVector(target)), ORIGIN_RELAY);
  return !discardPending(upstream);
}

/** What a follow could not place, as Recovered text: each overlap with both wordings, then the text set aside. */
function followRecovered(
  docId: string,
  out: ReturnType<SyncService["follow"]>,
  at: number,
): RecoveredItem[] {
  const base = { docId, recoveredAt: at, otherClientIds: [] };
  return [
    ...out.overlaps.map((o) => ({
      ...base,
      id: `${docId}:${o.blockId}:overlap`,
      blockId: o.blockId,
      nearBlockId: null,
      text: blockText(blockView(o.mine)),
      cause: "overlap" as const,
      mine: o.mine,
      theirs: o.theirs,
    })),
    ...out.setAside.map((s) => ({
      ...base,
      id: `${docId}:${s.blockId}:merge`,
      blockId: s.blockId,
      nearBlockId: s.nearBlockId,
      text: s.text,
      cause: "merge" as const,
      mine: null,
      theirs: null,
    })),
  ];
}

/**
 * The node follows `handle`'s document: a new generation of the room from it, merged by block with
 * what the room took meanwhile, and the same bytes the merge wrote applied upstream under the client
 * ID the follow allocated, so both hold one history. Returns what could not be placed.
 */
function followUpstream(
  service: SyncService,
  handle: DocHandle,
  at: number,
): RecoveredItem[] {
  const out = service.follow(handle.docId, handle.doc().encodeState());
  if (out.update.length > 0) {
    handle.adoptClientIds(clientIdsOf(out.update));
    handle.doc().applyUpdate(out.update, ORIGIN_RELAY);
  }
  return followRecovered(handle.docId, out, at);
}

export type SetItem = Extract<UpstreamItem, { kind: "set" }>;

/** One person's upstream document. */
export interface Line {
  readonly userId: string;
  readonly docId: string;
  handle: DocHandle | null;
  /** It holds the cloud's state and has been reconciled with the room. */
  ready: boolean;
  /** Replaced, until the node follows or reconciles. */
  moving: boolean;
  /** Own writes were left out because the upstream lacked what they build on. */
  owed: boolean;
  /** Requests waiting for the line to be ready. */
  queued: SetItem[];
  /** Requests sent upstream and not yet answered, oldest first. */
  asked: SetItem[];
  lastSyncedAt: number | null;
  synced: boolean;
  /** The cloud generation at which this line was last level with the room; 0 before the first. */
  generation: number;
  stopDoc: () => void;
  readonly opened: Promise<void>;
}

/** Resolves once the handle holds what the cloud held when it subscribed. */
function synced(handle: DocHandle): Promise<void> {
  if (!handle.status.get().neverSynced) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = handle.status.subscribe((status) => {
      if (status.neverSynced) return;
      stop();
      resolve();
    });
  });
}

/** What following needs of the bridge. */
interface FollowPorts {
  storage: Storage;
  records: NodeRecords;
  upstream: UpstreamFactory;
  clock: Clock;
  defer(fn: () => void): void;
  ownerOf: (docId: string, clientId: number) => string | null;
  service(): SyncService;
  /** Observes the handle's document for what the cloud sends. */
  bindDoc(line: Line, handle: DocHandle): void;
  /** The line is level with the room: what waited for that goes. */
  ready(line: Line): void;
}

export interface Following {
  ingest(line: Line, handle: DocHandle): void;
  /** Writes upstream what the room holds of the person's client IDs and the upstream lacks. */
  pushOwn(line: Line, handle: DocHandle): void;
  /** The upstream document was replaced: the room pauses its relaying at once, and the node follows at the next turn. */
  replaced(
    line: Line,
    handle: DocHandle,
    reason: "rejected" | "generation",
  ): void;
  /** Once the handle holds the cloud's state: the node follows a move it missed while stopped, else reconciles. */
  resume(line: Line, handle: DocHandle): Promise<void>;
}

export function createFollowing(ports: FollowPorts): Following {
  const { storage, records, upstream, clock, defer } = ports;

  const ingest = (line: Line, handle: DocHandle): void =>
    ports
      .service()
      .ingest(line.docId, line.userId, (vector) =>
        placedDiff(handle.doc(), vector),
      );

  function pushOwn(line: Line, handle: DocHandle): void {
    const node = nodeDocOf(storage, line.docId);
    if (node === null) return;
    try {
      const ids = readStateVector(node.encodeStateVector()).keys();
      const own = new Set(
        [...ids].filter((id) => ports.ownerOf(line.docId, id) === line.userId),
      );
      handle.adoptClientIds([...own]);
      line.owed = !writeOwn(node, handle.doc(), own);
    } finally {
      node.destroy();
    }
  }

  function reconcile(line: Line, handle: DocHandle): void {
    ingest(line, handle);
    pushOwn(line, handle);
    line.ready = true;
    ports.ready(line);
  }

  const known = (docId: string): number =>
    records.docState(docId)?.generation ?? 0;
  /** By line: the cancel of a follow the disk put off; the line's next `act` takes its place. */
  const putOff = new Map<Line, () => void>();

  /**
   * `generation`: the upstream's, which the room's records take in the same run; null when its store
   * holds none. One the disk refuses is acted on again later, as the room is then.
   */
  function follow(
    line: Line,
    handle: DocHandle,
    reason: "rejected" | "generation",
    generation: number | null,
  ): void {
    let items: RecoveredItem[];
    try {
      items = followUpstream(ports.service(), handle, clock.now());
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      const retry = (): void => act(line, handle, reason, generation);
      putOff.set(line, clock.schedule(retry, FOLLOW_RETRY_MS));
      return;
    }
    if (items.length > 0) records.addRecovered(line.docId, line.userId, items);
    if (generation !== null) {
      records.setDocState(line.docId, line.userId, "synced", generation);
      line.generation = generation;
    }
    line.moving = false;
    ports.bindDoc(line, handle);
    if (line.ready) ports.ready(line);
    else reconcile(line, handle);
  }

  /** Another person's line already moved the room to the generation this one reached: it only catches up. */
  function catchUp(line: Line, handle: DocHandle, generation: number): void {
    line.generation = generation;
    line.moving = false;
    ports.bindDoc(line, handle);
    reconcile(line, handle);
  }

  /**
   * Follows, unless the room is already at the handle's generation (null: its store holds none).
   * A handle on a generation the room has moved past is left moving: following it would take the
   * room back onto an older history, so its person's items wait in the node's log until its next
   * move. No pause is left behind: only a follow moves the room, and a follow ends the pause.
   */
  function act(
    line: Line,
    handle: DocHandle,
    reason: "rejected" | "generation",
    generation: number | null,
  ): void {
    putOff.get(line)?.();
    putOff.delete(line);
    if (reason === "generation" && generation !== null) {
      const room = known(line.docId);
      if (generation === room) return catchUp(line, handle, generation);
      if (generation < room) return;
    }
    // `replaced` paused already, unless another follow has ended that pause since: a second pause does nothing
    ports.service().pauseRelay(line.docId);
    follow(line, handle, reason, generation);
  }

  /**
   * Once the person's store says the handle's generation, `act` at the next turn. A store that
   * cannot be read now, or has not yet taken the move, is read again later; meanwhile the line
   * stays paused and loses nothing.
   */
  function decide(
    line: Line,
    handle: DocHandle,
    reason: "rejected" | "generation",
  ): void {
    const again = (): void => {
      clock.schedule(() => decide(line, handle, reason), FOLLOW_RETRY_MS);
    };
    const read = (loaded: LoadedDocument | null): void => {
      const generation = loaded?.meta.generation ?? null;
      const stale =
        reason === "generation" &&
        generation !== null &&
        generation <= line.generation;
      if (stale) return again();
      defer(() => act(line, handle, reason, generation));
    };
    upstream.store(line.userId).load(line.docId).then(read, again);
  }

  function hasUnfollowedRecovery(
    line: Line,
    handle: DocHandle,
    clientIds: readonly number[],
  ): boolean {
    const node = nodeDocOf(storage, line.docId);
    if (node === null) return false;
    try {
      const nodeVector = readStateVector(node.encodeStateVector());
      const upstreamVector = readStateVector(handle.doc().encodeStateVector());
      return clientIds.some(
        (id) =>
          (upstreamVector.get(id) ?? 0) > 0 &&
          !nodeVector.has(id) &&
          ports.ownerOf(line.docId, id) === null,
      );
    } finally {
      node.destroy();
    }
  }

  return {
    ingest,
    pushOwn,
    replaced(line, handle, reason) {
      line.moving = true;
      line.stopDoc();
      // a room another person's line moved past this line's generation is not paused again: no follow would end it
      const behind =
        reason === "generation" && known(line.docId) > line.generation;
      if (!behind) ports.service().pauseRelay(line.docId);
      decide(line, handle, reason);
    },
    async resume(line, handle) {
      await synced(handle);
      const meta = (await upstream.store(line.userId).load(line.docId))?.meta;
      line.lastSyncedAt = meta?.lastSyncedAt ?? null;
      // a node that stopped after the upstream moved and before it followed follows now
      if (meta !== undefined && meta.generation > known(line.docId)) {
        line.moving = true;
        line.stopDoc();
        return act(line, handle, "generation", meta.generation);
      }
      // a node that crashed after a rejected-push recovery before it followed follows now
      if (
        meta !== undefined &&
        hasUnfollowedRecovery(line, handle, meta.clientIds)
      ) {
        line.moving = true;
        line.stopDoc();
        return act(line, handle, "rejected", meta.generation);
      }
      line.generation = meta?.generation ?? 0;
      reconcile(line, handle);
    },
  };
}
