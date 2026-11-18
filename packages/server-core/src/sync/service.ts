// The sync service: who is connected, what they hold open, and every document message they send.
import type { DocFile, Home, Storage } from "@manent/storage";
import { CODE, prepareMessage } from "@manent/sync-protocol";
import type { DocRef, Message, ServerVersions } from "@manent/sync-protocol";
import { createTokenBucket } from "../limits/bucket.ts";
import type { TokenBucket } from "../limits/bucket.ts";
import { createConnectionCaps } from "../limits/caps.ts";
import { createDocumentAccess } from "./access.ts";
import { createAwarenessHub } from "./awareness.ts";
import type { DocumentAccess } from "./access.ts";
import { createInlineCheckpointer } from "./checkpointer.ts";
import { refusalError, syncError } from "./errors.ts";
import { DEFAULT_LIMITS, NO_SETTINGS } from "./ports.ts";
import type {
  Checkpointer,
  Clock,
  Peer,
  SettingRules,
  SyncLimits,
  Upstream,
  WriteMode,
} from "./ports.ts";
import { createRooms } from "./rooms.ts";
import type { Room, Subscription } from "./rooms.ts";
import {
  checkSubscribe,
  registerEditor,
  stepTwo,
  subscribedOf,
} from "./subscribe.ts";
import type { SubscribeMessage } from "./subscribe.ts";
import { createSnapshotAnswers, viewPatchOf } from "./viewers.ts";
import { createWritePath } from "./write-path.ts";

export interface ServiceStats {
  peers: number;
  rooms: number;
  loadedRooms: number;
  /** Transactions committed. */
  commits: number;
  /** Updates and settings appended to a log. */
  appended: number;
  /** Pushes and settings acknowledged as resends. */
  duplicates: number;
  /** ERRORs sent, by message. */
  refused: Record<string, number>;
  /** Rooms poisoned by a failed commit. */
  poisoned: number;
  awarenessDropped: number;
  /** Document frames a peer's decoder skipped. */
  skipped: number;
}

export interface SyncService {
  /** After WELCOME; refused (4429) over a connection cap or while shutting down. */
  attach(peer: Peer): { ok: true } | { ok: false; code: number };
  /** Every message after HELLO but PING and PONG. */
  receive(peer: Peer, message: Message): void;
  /** The peer's decoder skipped a document frame. */
  skipped(peer: Peer, doc: DocRef): void;
  detach(peer: Peer): void;
  readonly access: DocumentAccess;
  /** A role was changed: resolves it again, and ends what is no longer allowed. */
  accessChanged(docId: string, userId: string): void;
  /** A document was deleted: tells and unsubscribes everyone. */
  removed(docId: string): void;
  stats(): ServiceStats;
  shutdown(): Promise<void>;
}

/** Defaults: "authority", DEFAULT_LIMITS, an inline checkpointer, no upstream, NO_SETTINGS, no schema floor. */
export interface SyncSettings {
  storage: Storage;
  clock: Clock;
  defer(fn: () => void): void;
  /** A new version id. */
  ids(): string;
  mode?: WriteMode;
  limits?: Partial<SyncLimits>;
  checkpointer?: Checkpointer;
  upstream?: Upstream;
  registry?: SettingRules;
  schemaFloor?: (touched: readonly unknown[]) => number;
}

interface Held {
  room: Room;
  subscription: Subscription;
}

interface PeerState {
  buckets: { frames: TokenBucket; bytes: TokenBucket };
  /** By document id. */
  held: Map<string, Held>;
}

/** The storage with every committed transaction counted; each file is wrapped once, so it keeps its identity. */
function countingCommits(storage: Storage, onCommit: () => void): Storage {
  const files = new Map<string, DocFile>();
  const open = (home: Home): DocFile => {
    const key = `${home.kind}:${home.id}`;
    const inner = storage.open(home);
    const file = files.get(key) ?? {
      ...inner,
      transaction<T>(fn: () => T): T {
        const result = inner.transaction(fn);
        onCommit();
        return result;
      },
    };
    files.set(key, file);
    return file;
  };
  return { directory: storage.directory, open, close: () => storage.close() };
}

const docOf = (room: Room): DocRef => ({
  docId: room.docId,
  generation: room.row.generation,
});

export function createSyncService(
  options: SyncSettings & { versions: ServerVersions },
): SyncService {
  const { clock, defer } = options;
  const limits: SyncLimits = { ...DEFAULT_LIMITS, ...options.limits };
  // duplicates are the acknowledgements that answered no new entry
  const counted = {
    commits: 0,
    appended: 0,
    poisoned: 0,
    awarenessDropped: 0,
    skipped: 0,
    acks: 0,
    relayedSets: 0,
  };
  const refused: Record<string, number> = {};
  const storage = countingCommits(options.storage, () => {
    counted.commits += 1;
  });
  const checkpointer =
    options.checkpointer ??
    createInlineCheckpointer({ storage: options.storage, defer });
  const rooms = createRooms({ storage, clock, limits, checkpointer });
  const access = createDocumentAccess({
    storage: options.storage,
    versions: options.versions,
  });
  const caps = createConnectionCaps(limits);
  const presence = createAwarenessHub({ clock, limits });
  const snapshotOf = createSnapshotAnswers(options.storage);
  const peers = new Map<Peer, PeerState>();
  let closing = false;

  const bucket = (perSecond: number, burst: number): TokenBucket =>
    createTokenBucket({ perSecond, burst, now: clock.now });

  const tell = (peer: Peer, message: Message): void => {
    if (message.type === "ERROR")
      refused[message.message] = (refused[message.message] ?? 0) + 1;
    peer.send(message);
  };

  /** The subscription ends; the room is left. */
  const end = (peer: Peer, docId: string): void => {
    const held = peers.get(peer)?.held.get(docId);
    if (held === undefined) return;
    peers.get(peer)?.held.delete(docId);
    if (held.subscription.mode === "edit") presence.left(held.room, peer);
    held.room.editors.delete(peer);
    held.room.viewers.delete(peer);
    rooms.left(held.room);
  };

  /** Each subscriber of the room hears `message`, and its subscription ends. */
  const endAll = (room: Room, message: Message): void => {
    for (const peer of [...room.editors.keys(), ...room.viewers.keys()]) {
      tell(peer, message);
      end(peer, room.docId);
    }
  };

  const writePath = createWritePath({
    mode: options.mode ?? "authority",
    limits,
    now: clock.now,
    defer,
    rooms: {
      reload: (room) => rooms.reload(room),
      drop: (dropped) => rooms.drop(dropped),
      changed(room, updateBytes) {
        counted.appended += 1;
        rooms.changed(room, updateBytes);
      },
    },
    bucketOf: (peer) => stateOf(peer).buckets,
    ack(peer, room, clientSeq, serverSeq) {
      counted.acks += 1;
      peer.send({ type: "ACK", ...docOf(room), clientSeq, serverSeq });
    },
    refuse: (peer, room, refusal) =>
      tell(peer, refusalError(refusal, docOf(room))),
    publish(committed) {
      const { room, sender, update, echo } = committed;
      const prepared = prepareMessage({
        type: "SYNC",
        ...docOf(room),
        step: "update",
        data: update,
      });
      for (const peer of room.editors.keys())
        if (peer !== sender || echo) peer.send(prepared);
      const patch = viewPatchOf(committed);
      if (patch === null) return;
      const viewed = prepareMessage(patch);
      for (const peer of room.viewers.keys()) peer.send(viewed);
    },
    poisoned(poisoned) {
      counted.poisoned += poisoned.length;
      for (const room of poisoned)
        endAll(
          room,
          syncError("storage_failed", docOf(room), {
            retryAfterMs: limits.poisonRetryMs,
          }),
        );
    },
    schemaRaised(room, toVersion) {
      for (const peer of room.editors.keys())
        if (peer.versions.schema < toVersion) {
          tell(peer, syncError("too_old", docOf(room)));
          end(peer, room.docId);
        }
    },
    admitsForeign: () => false,
    beforeAppend: () => {},
    upstream:
      options.upstream === undefined
        ? null
        : {
            enqueue(item) {
              if (item.kind === "set") counted.relayedSets += 1;
              options.upstream?.enqueue(item);
            },
          },
    registry: options.registry ?? NO_SETTINGS,
    schemaFloor: options.schemaFloor ?? null,
  });

  /** A push or a setting reaches the write path only from an attached peer. */
  function stateOf(peer: Peer): PeerState {
    const state = peers.get(peer);
    if (state === undefined)
      throw new RangeError(`${peer.userId}'s peer is not attached`);
    return state;
  }

  function subscribe(
    peer: Peer,
    state: PeerState,
    message: SubscribeMessage,
  ): void {
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
    state.held.set(docId, { room, subscription });
    if (mode === "edit") registerEditor(room, peer.userId, message.clientIds);
    (mode === "edit" ? room.editors : room.viewers).set(peer, subscription);
    tell(peer, subscribedOf(room, granted, room.row.headSeq));
    const vector = room.doc?.encodeStateVector();
    if (mode === "edit" && vector !== undefined) {
      tell(peer, { type: "SYNC", ...docOf(room), step: "step1", data: vector });
      return presence.joined(room, peer);
    }
    // a viewer's snapshot holds only what is committed
    if (writePath.queued() > 0) writePath.flush();
    tell(peer, snapshotOf(room));
  }

  /** Anything else a client sends for a document is ignored. */
  function receiveDocument(
    peer: Peer,
    state: PeerState,
    message: Extract<Message, { docId: string }>,
  ): void {
    const { type, docId } = message;
    if (type === "SUBSCRIBE") return subscribe(peer, state, message);
    if (type === "UNSUBSCRIBE") return end(peer, docId);
    if (!["PUSH", "SET", "SYNC", "AWARENESS"].includes(type)) return;
    const held = state.held.get(docId);
    const notSubscribed = () =>
      tell(
        peer,
        syncError("not_subscribed", { docId, generation: message.generation }),
      );
    if (held === undefined) return notSubscribed();
    const { room, subscription } = held;
    if (type === "PUSH") return writePath.push(room, subscription, message);
    if (type === "SET") return writePath.set(room, subscription, message);
    if (subscription.mode !== "edit") return notSubscribed();
    if (type === "AWARENESS")
      counted.awarenessDropped += presence.accept(room, peer, message.update);
    if (type === "SYNC" && message.step === "step1")
      tell(peer, stepTwo(rooms, room, message.data));
  }

  function detach(peer: Peer): void {
    const state = peers.get(peer);
    if (state === undefined) return;
    for (const docId of state.held.keys()) end(peer, docId);
    peers.delete(peer);
    caps.release(peer);
  }

  return {
    access,
    attach(peer) {
      if (closing || !caps.admit(peer))
        return { ok: false, code: CODE.RATE_LIMITED };
      const frames = bucket(limits.framesPerSecond, limits.frameBurst);
      const bytes = bucket(limits.bytesPerSecond, limits.byteBurst);
      peers.set(peer, { buckets: { frames, bytes }, held: new Map() });
      return { ok: true };
    },
    receive(peer, message) {
      const state = peers.get(peer);
      if (state !== undefined && "docId" in message)
        receiveDocument(peer, state, message);
    },
    skipped(peer, doc) {
      counted.skipped += 1;
      tell(peer, syncError("unknown_frame", doc));
    },
    detach,
    accessChanged(docId, userId) {
      for (const [peer, state] of peers) {
        const held = state.held.get(docId);
        if (held === undefined || peer.userId !== userId) continue;
        const resolved = access.resolve(userId, docId);
        const role = resolved.ok ? resolved.access.role : null;
        const readOnly = role === "comment" || role === "view";
        if (resolved.ok && !(held.subscription.mode === "edit" && readOnly)) {
          held.subscription.access = resolved.access;
          continue;
        }
        tell(peer, syncError("forbidden", docOf(held.room)));
        end(peer, docId);
      }
    },
    removed(docId) {
      const room = rooms.find(docId);
      if (room === null) return;
      endAll(room, syncError("deleted", docOf(room)));
      rooms.drop([room]);
    },
    stats() {
      const { acks, relayedSets, ...counts } = counted;
      const { rooms: open, loaded } = rooms.stats();
      const duplicates = acks - counts.appended - relayedSets;
      const sizes = { peers: peers.size, rooms: open, loadedRooms: loaded };
      return { ...counts, ...sizes, duplicates, refused: { ...refused } };
    },
    async shutdown() {
      closing = true;
      writePath.flush();
      for (const peer of peers.keys()) {
        peer.close(CODE.RESTARTING, "restarting");
        detach(peer);
      }
      rooms.closeAll();
      await checkpointer.idle();
      await checkpointer.close();
    },
  };
}
