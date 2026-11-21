// The sync service: who is connected, what they hold open, and every document message they send.
import { CODE, isDocKind, prepareMessage } from "@manent/sync-protocol";
import type { Message, ServerVersions } from "@manent/sync-protocol";
import { createTokenBucket } from "../limits/bucket.ts";
import type { TokenBucket } from "../limits/bucket.ts";
import { createConnectionCaps } from "../limits/caps.ts";
import { createRebuilder, createSubscriptions } from "../rebuild/rebuilder.ts";
import type { PeerState } from "../rebuild/rebuilder.ts";
import { createReplay } from "../rebuild/replay.ts";
import { createDocumentAccess } from "./access.ts";
import { createAwarenessHub } from "./awareness.ts";
import { createInlineCheckpointer } from "./checkpointer.ts";
import { countingCommits } from "./counted-storage.ts";
import { createDeletions } from "./deletions.ts";
import { refusalError, syncError } from "./errors.ts";
import { createRelayIntake } from "./follow.ts";
import { createHealing } from "./heal.ts";
import { HELD_RETRY_MS, createHeldQueue } from "./held.ts";
import { DEFAULT_LIMITS, NO_SETTINGS } from "./ports.ts";
import type {
  Peer,
  SyncHooks,
  SyncLimits,
  SyncService,
  SyncSettings,
} from "./ports.ts";
import { createRooms } from "./rooms.ts";
import type { Room } from "./rooms.ts";
import { answerStepOne, docOf, subscribe } from "./subscribe.ts";
import type { SubscribePorts } from "./subscribe.ts";
import { createSnapshotAnswers, viewPatchOf } from "./viewers.ts";
import { createWritePath } from "./write-path.ts";

/** The hooks as one: each member asks every hook in list order; `subscribed` answers the first non-null. */
function combineHooks(hooks: readonly SyncHooks[]): Required<SyncHooks> {
  return {
    committed(committed) {
      for (const hook of hooks) hook.committed?.(committed);
    },
    editorLeft(room, userId) {
      for (const hook of hooks) hook.editorLeft?.(room, userId);
    },
    forgotten(room) {
      for (const hook of hooks) hook.forgotten?.(room);
    },
    subscribed(docId) {
      for (const hook of hooks) {
        const extras = hook.subscribed?.(docId) ?? null;
        if (extras !== null) return extras;
      }
      return null;
    },
    checkPush: (room, report) =>
      hooks.flatMap((hook) => hook.checkPush?.(room, report) ?? []),
  };
}

export function createSyncService(
  options: SyncSettings & { versions: ServerVersions },
): SyncService {
  const { clock, defer, mode } = options;
  const modeOf = typeof mode === "function" ? mode : () => mode ?? "authority";
  const limits: SyncLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const hooks = combineHooks(options.hooks ?? []);
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
  const rooms = createRooms({
    ...options,
    storage,
    limits,
    checkpointer,
    mode: modeOf,
    forgotten: hooks.forgotten,
  });
  const deletions = createDeletions();
  const access = createDocumentAccess({
    storage: options.storage,
    versions: options.versions,
  });
  const caps = createConnectionCaps(limits);
  const presence = createAwarenessHub({ clock, limits });
  const snapshotOf = createSnapshotAnswers(options.storage);
  const heal = createHealing({ ...options, modeOf, now: clock.now });
  let closing = false;
  // after the last retry at shutdown, what is still held is let go: the windows' outboxes, and for a relayed room the upstream's, still hold it
  let heldDropped = false;
  const heldQueue = createHeldQueue({
    clock,
    retryMs: HELD_RETRY_MS,
    commit: (items) => heldDropped || writePath.commitHeld(items),
    onState(state) {
      if (!heldDropped) options.onDeviceStorage?.(state);
    },
  });

  const bucket = (perSecond: number, burst: number): TokenBucket =>
    createTokenBucket({ perSecond, burst, now: clock.now });

  const tell = (peer: Peer, message: Message): void => {
    if (message.type === "ERROR")
      refused[message.message] = (refused[message.message] ?? 0) + 1;
    peer.send(message);
  };

  const { peers, end, endAll, stateOf } = createSubscriptions({
    rooms,
    presence,
    tell,
    editorLeft: hooks.editorLeft,
  });

  const poison = (poisoned: readonly Room[]): void => {
    counted.poisoned += poisoned.length;
    const retryAfterMs = limits.poisonRetryMs;
    for (const room of poisoned)
      endAll(room, syncError("storage_failed", docOf(room), { retryAfterMs }));
  };

  const writePath = createWritePath({
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
      rebuilder.touched(room);
      const patch = viewPatchOf(committed);
      if (patch !== null) {
        const viewed = prepareMessage(patch);
        for (const peer of room.viewers.keys()) peer.send(viewed);
      }
      hooks.committed(committed);
    },
    poisoned: poison,
    schemaRaised(room, toVersion) {
      for (const peer of room.editors.keys())
        if (peer.versions.schema < toVersion) {
          tell(peer, syncError("too_old", docOf(room)));
          end(peer, room.docId);
        }
    },
    ...heal.ports,
    upstream:
      options.upstream === undefined
        ? null
        : {
            enqueue(item) {
              if (item.kind === "set") counted.relayedSets += 1;
              else if (intake.isPaused(item.docId)) return;
              options.upstream?.enqueue(item);
            },
          },
    fullDisk: options.fullDisk ?? "poison",
    held: heldQueue,
    registry: options.registry ?? NO_SETTINGS,
    schemaFloor: options.schemaFloor ?? null,
    checkPush: hooks.checkPush,
    ids: options.ids,
  });
  const rebuilder = createRebuilder({
    ...options,
    limits,
    rooms,
    writePath,
    endAll,
    poisoned: poison,
  });
  const replay = createReplay({ ...options, access, rooms, writePath, limits });
  const intake = createRelayIntake({
    ...options,
    limits,
    rooms,
    writePath,
    held: heldQueue,
    endAll,
  });
  const subscribePorts: SubscribePorts = {
    access,
    rooms,
    limits,
    heal,
    presence,
    writePath,
    rebuilder,
    snapshotOf,
    tell,
    end,
    extras: hooks.subscribed,
  };

  /** The room of a placed document; RangeError for one this node has not placed. */
  function placedRoom(docId: string): Room {
    const place = options.storage.directory.placeOf(docId);
    if (place === null || !isDocKind(place.kind))
      throw new RangeError(`no script ${docId} is placed here`);
    return rooms.room(docId, place.home, place.kind);
  }

  /** Anything else a client sends for a document is ignored. */
  function receiveDocument(
    peer: Peer,
    state: PeerState,
    message: Extract<Message, { docId: string }>,
  ): void {
    const { type, docId } = message;
    if (type === "SUBSCRIBE")
      return subscribe(subscribePorts, peer, state, message);
    if (type === "UNSUBSCRIBE") return end(peer, docId);
    if (!["PUSH", "SET", "SYNC", "AWARENESS"].includes(type)) return;
    const held = state.held.get(docId);
    const notSubscribed = () =>
      tell(
        peer,
        syncError("not_subscribed", { docId, generation: message.generation }),
      );
    if (held === undefined) return notSubscribed();
    const { room, subscription, lastServerSeq } = held;
    if (type === "PUSH") return writePath.push(room, subscription, message);
    if (type === "SET") return writePath.set(room, subscription, message);
    if (subscription.mode !== "edit") return notSubscribed();
    if (type === "AWARENESS")
      counted.awarenessDropped += presence.accept(room, peer, message.update);
    if (type !== "SYNC" || message.step !== "step1") return;
    const step = { vector: message.data, lastServerSeq };
    for (const m of answerStepOne({ rooms, deletions, writePath }, room, step))
      tell(peer, m);
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
    restored: () => heal.restored(),
    requestRebuild: (docId) => rebuilder.request(docId),
    replay,
    async authorityWrite(docId, write) {
      const room = placedRoom(docId);
      try {
        if (!rooms.load(room).ok) return { ok: false, code: "busy" };
        return await new Promise((resolve) =>
          writePath.authority(room, write, resolve),
        );
      } finally {
        rooms.left(room);
      }
    },
    broadcast(docId, kind, data) {
      const room = rooms.find(docId);
      if (room === null || room.doc === null) return;
      const seq = room.row.headSeq;
      const control = prepareMessage({
        type: "CONTROL",
        ...docOf(room),
        seq,
        kind,
        data,
      });
      for (const peer of [...room.editors.keys(), ...room.viewers.keys()])
        peer.send(control);
    },
    ingest: intake.ingest,
    modeChanged(docId) {
      const room = rooms.find(docId);
      if (room !== null) room.mode = modeOf(docId);
    },
    pauseRelay: intake.pauseRelay,
    follow: intake.follow,
    stats() {
      const { acks, relayedSets, ...counts } = counted;
      const { rooms: open, loaded } = rooms.stats();
      const duplicates = acks - counts.appended - relayedSets;
      const sizes = { peers: peers.size, rooms: open, loadedRooms: loaded };
      return {
        ...counts,
        ...sizes,
        ...rebuilder.stats(),
        duplicates,
        refused: { ...refused },
      };
    },
    async shutdown() {
      closing = true;
      writePath.flush();
      heldQueue.retry();
      heldDropped = true;
      heldQueue.retry();
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
