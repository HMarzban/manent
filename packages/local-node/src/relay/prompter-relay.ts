// Prompter feed relay on the desktop node: answers prompter SUBSCRIBE for a relayed rundown from
// the person's upstream prompter handle, forwarding snapshots, patches, heartbeats, control frames and feed loss.
import { diffPrompterFeed, syncError } from "@manent/server-core";
import type { Clock, Peer, SyncService } from "@manent/server-core";
import type { Storage } from "@manent/storage";
import type { PrompterStatus, SyncClient } from "@manent/sync-client";
import type { UpstreamFactory } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";
import {
  HEARTBEAT_BYTES,
  attachPrompterControlForwarder,
  docRowOf,
  encodeJson,
  livePeers,
  readFeedFromHandle,
  removePeer,
  sendTo,
} from "./prompter-control-relay.ts";
import type {
  PrompterSubscribe,
  RelayedFeed,
} from "./prompter-control-relay.ts";

/** Interval for reaping upstream handles once every local prompter window has closed or unsubscribed. */
const SWEEP_MS = 1_000;
/** Retry delay carried by the transient error that signals upstream feed loss to the window. */
const LOST_RETRY_MS = 1_000;

export interface PrompterRelayOptions {
  storage: Storage;
  records: NodeRecords;
  upstream: UpstreamFactory;
  sync: () => SyncService;
  clock: Clock;
  airWindowOf(docId: string): { startsAt: number; endsAt: number } | null;
}

export interface PrompterRelay {
  /** Handles SUBSCRIBE in prompter mode for a relayed rundown. */
  readonly subscribe: PrompterSubscribe;
  /** Closes every active upstream prompter handle, cached upstream client and sweep timer. */
  stop(): void;
}

/** Relays prompter subscriptions for synced rundowns through each person's upstream prompter handle. */
export function createPrompterRelay(
  options: PrompterRelayOptions,
): PrompterRelay {
  const { storage, records, upstream, sync, clock, airWindowOf } = options;
  const active = new Map<string, RelayedFeed>();
  const clients = new Map<string, { client: SyncClient; refs: number }>();

  function acquireClient(userId: string): SyncClient {
    const known = clients.get(userId);
    if (known !== undefined) {
      known.refs += 1;
      return known.client;
    }
    const client = upstream.create(
      userId,
      () => records.person(userId)?.cloudToken ?? null,
    );
    // only the dedicated prompter socket connects; the client's document link stays offline
    client.setOnline(false);
    clients.set(userId, { client, refs: 1 });
    return client;
  }

  function releaseClient(userId: string): void {
    const known = clients.get(userId);
    if (known === undefined) return;
    known.refs -= 1;
    if (known.refs > 0) return;
    clients.delete(userId);
    void known.client.close();
  }

  function teardown(entry: RelayedFeed): void {
    if (active.get(entry.key) !== entry) return;
    active.delete(entry.key);
    entry.cancelSweep?.();
    entry.cancelSweep = null;
    for (const stop of entry.unsubscribes) stop();
    entry.unsubscribes.length = 0;
    entry.snapshotted.clear();
    entry.handle.close();
    releaseClient(entry.userId);
  }

  function rejectAll(
    entry: RelayedFeed,
    code: "forbidden" | "deleted",
    generation: number,
  ): void {
    const msg = syncError(code, { docId: entry.docId, generation });
    for (const peer of livePeers(entry)) {
      peer.send(msg);
      removePeer(entry, peer);
    }
    teardown(entry);
  }

  function eligiblePeers(entry: RelayedFeed, generation: number): Peer[] {
    const peers = livePeers(entry);
    if (peers.length === 0) {
      teardown(entry);
      return [];
    }
    const { access } = sync();
    const eligible: Peer[] = [];
    for (const peer of peers) {
      const resolved = access.resolve(peer.userId, entry.docId);
      if (!resolved.ok) {
        peer.send(syncError(resolved.code, { docId: entry.docId, generation }));
        removePeer(entry, peer);
      } else eligible.push(peer);
    }
    if (eligible.length === 0) teardown(entry);
    return eligible;
  }

  const rowOf = (docId: string) => docRowOf(storage, docId);

  function deliverLive(
    entry: RelayedFeed,
    status: PrompterStatus,
    isStatusEvent: boolean,
  ): void {
    if (active.get(entry.key) !== entry) return;
    const row = rowOf(entry.docId);
    if (row === null) return rejectAll(entry, "deleted", 0);
    const eligible = eligiblePeers(entry, row.generation);
    if (eligible.length === 0) return;

    const nextFeed = readFeedFromHandle(entry.handle);
    const needSnapshot = eligible.filter((p) => !entry.snapshotted.has(p));
    const alreadyLive = eligible.filter((p) => entry.snapshotted.has(p));
    const base = {
      docId: entry.docId,
      generation: row.generation,
      viewSeq: row.headSeq,
    };

    if (needSnapshot.length > 0) {
      sendTo(needSnapshot, {
        type: "VIEW_SNAPSHOT",
        ...base,
        content: encodeJson(nextFeed),
      });
      for (const peer of needSnapshot) {
        entry.snapshotted.add(peer);
        entry.deliverControlSnapshot(peer, row.generation);
      }
    }
    const patch =
      entry.lastFeed === null
        ? null
        : diffPrompterFeed(entry.lastFeed, nextFeed);
    entry.lastFeed = nextFeed;

    const heartbeatDue =
      isStatusEvent &&
      status.lastReceivedAt !== null &&
      status.lastReceivedAt !== entry.lastForwardedAt;
    if (alreadyLive.length > 0 && (patch !== null || heartbeatDue)) {
      sendTo(alreadyLive, {
        type: "VIEW_PATCH",
        ...base,
        patch: patch === null ? HEARTBEAT_BYTES : encodeJson(patch),
      });
      entry.lastForwardedAt = status.lastReceivedAt;
    }
    if (needSnapshot.length > 0) entry.lastForwardedAt = status.lastReceivedAt;
    entry.lastStatus = "live";
  }

  function handleLost(entry: RelayedFeed): void {
    if (active.get(entry.key) !== entry || entry.lastStatus === "lost") return;
    entry.lastStatus = "lost";
    entry.snapshotted.clear();
    const row = rowOf(entry.docId);
    if (row === null) return rejectAll(entry, "deleted", 0);
    const eligible = eligiblePeers(entry, row.generation);
    if (eligible.length === 0) return;
    sendTo(
      eligible,
      syncError(
        "busy",
        { docId: entry.docId, generation: row.generation },
        { retryAfterMs: LOST_RETRY_MS },
      ),
    );
  }

  function armSweep(entry: RelayedFeed): void {
    if (entry.cancelSweep !== null) return;
    const scheduleNext = (): void => {
      entry.cancelSweep = clock.schedule(() => {
        entry.cancelSweep = null;
        if (active.get(entry.key) !== entry) return;
        if (livePeers(entry).length === 0) return teardown(entry);
        const row = rowOf(entry.docId);
        if (row === null) return rejectAll(entry, "deleted", 0);
        if (eligiblePeers(entry, row.generation).length === 0) return;
        scheduleNext();
      }, SWEEP_MS);
    };
    scheduleNext();
  }

  function ensureEntry(userId: string, docId: string): RelayedFeed {
    const key = `${userId}:${docId}`;
    const existing = active.get(key);
    if (existing !== undefined) return existing;
    const handle = acquireClient(userId).prompter(docId);
    const entry: RelayedFeed = {
      key,
      userId,
      docId,
      registries: new Set(),
      handle,
      unsubscribes: [],
      snapshotted: new Set(),
      lastFeed: null,
      lastStatus: handle.status.get().feed,
      lastForwardedAt: null,
      cancelSweep: null,
      deliverControlSnapshot: () => {},
    };
    active.set(key, entry);
    const control = attachPrompterControlForwarder({
      docId,
      handle,
      clock,
      generationOf: () => rowOf(docId)?.generation ?? null,
      eligiblePeers: (generation) => eligiblePeers(entry, generation),
    });
    entry.deliverControlSnapshot = control.deliverSnapshot;
    const onData = (): void => {
      const status = handle.status.get();
      if (status.feed === "live") deliverLive(entry, status, false);
    };
    const onStatus = (status: PrompterStatus): void => {
      if (status.feed === "live") deliverLive(entry, status, true);
      else if (status.feed === "lost") handleLost(entry);
      else if (status.feed === "refused")
        rejectAll(entry, "forbidden", rowOf(docId)?.generation ?? 0);
    };
    entry.unsubscribes.push(
      handle.runOrder.subscribe(onData),
      handle.stories.subscribe(onData),
      handle.status.subscribe(onStatus),
      ...control.unsubscribes,
    );
    armSweep(entry);
    return entry;
  }

  return {
    subscribe(sub) {
      const { peer, message, access, prompters, tell } = sub;
      const { docId, generation } = message;
      const doc = { docId, generation };
      if (storage.directory.tombstoneOf(docId) !== null)
        return tell(syncError("deleted", doc));
      const row = rowOf(docId);
      if (row === null) return tell(syncError("prompter_unavailable", doc));

      prompters.add(docId, peer);
      const entry = ensureEntry(peer.userId, docId);
      entry.registries.add(prompters);
      entry.snapshotted.delete(peer);
      tell({
        type: "SUBSCRIBED",
        docId,
        generation: row.generation,
        role: access.role,
        capabilities: [...access.capabilities],
        headSeq: row.headSeq,
        minSchemaVersion: row.schemaVersion,
        engineVersion: row.engineVersion ?? 0,
        lockLevel: 0,
        lockAnchors: null,
        revision: null,
        airWindow: airWindowOf(docId),
      });

      const status = entry.handle.status.get();
      if (status.feed === "live") {
        const feed = entry.lastFeed ?? readFeedFromHandle(entry.handle);
        entry.lastFeed = feed;
        entry.snapshotted.add(peer);
        tell({
          type: "VIEW_SNAPSHOT",
          docId,
          generation: row.generation,
          viewSeq: row.headSeq,
          content: encodeJson(feed),
        });
        entry.deliverControlSnapshot(peer, row.generation);
      } else if (status.feed === "refused") {
        rejectAll(entry, "forbidden", row.generation);
      }
    },
    stop() {
      for (const entry of active.values()) teardown(entry);
    },
  };
}
