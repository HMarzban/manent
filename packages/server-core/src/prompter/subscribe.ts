// A SUBSCRIBE in prompter mode: snapshot, live patches, 1 s heartbeats and optional upstream relay.
import type { CrdtDoc } from "@manent/crdt";
import type { Storage } from "@manent/storage";
import { prepareMessage } from "@manent/sync-protocol";
import type {
  Message,
  PrompterFeed,
  PrompterPatch,
} from "@manent/sync-protocol";
import type { AirWindows } from "../rundown/air-window.ts";
import { syncError } from "../sync/errors.ts";
import type { Clock, Peer, SyncService } from "../sync/ports.ts";
import type { PrompterSubscribers } from "../sync/prompter-subscribers.ts";
import type { HandledSubscribe, SubscribeHandler } from "../sync/subscribe.ts";
import {
  buildPrompterFeed,
  diffPrompterFeed,
  readRundownSnapshot,
} from "./projection.ts";

/** Prompter subscribers receive a heartbeat patch every second to detect feed loss within 3 s. */
const HEARTBEAT_MS = 1_000;

const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

const HEARTBEAT_BYTES = encodeJson({
  v: 1,
  runOrder: null,
  stories: [],
  removed: [],
} satisfies PrompterPatch);

/** An upstream prompter feed for a relayed rundown, supplied by the local node. */
export interface UpstreamPrompterFeed {
  /** True when `docId` is relayed from an upstream authority rather than served locally. */
  isRelayed(docId: string): boolean;
  /** Subscribes to the upstream feed for `docId`; the returned function stops listening. */
  subscribe(
    docId: string,
    userId: string,
    sink: {
      snapshot(feed: PrompterFeed): void;
      patch(patch: PrompterPatch): void;
      error(code: "prompter_unavailable" | "forbidden" | "deleted"): void;
    },
  ): () => void;
}

/** Manages live prompter subscriptions, heartbeats and patch broadcasts for one sync service. */
export interface PrompterFeedHub {
  subscribe(sub: HandledSubscribe): void;
  /** Recomputes `rundownId`'s feed and sends a `VIEW_PATCH` to active subscribers when anything changed. */
  publish(rundownId: string, liveDoc?: CrdtDoc | null): void;
  /** Stops all heartbeat and upstream timers held by this hub. */
  stop(): void;
}

interface DocFeedState {
  readonly registries: Set<PrompterSubscribers>;
  lastFeed: PrompterFeed | null;
  cancelHeartbeat: (() => void) | null;
  cancelUpstream: (() => void) | null;
}

/** Safe fallback when a sync service has no `prompterSubscribe` configured: refuses every prompter. */
export const subscribePrompter: SubscribeHandler = ({ message, tell }) =>
  tell(
    syncError("prompter_unavailable", {
      docId: message.docId,
      generation: message.generation,
    }),
  );

function applyPatchToFeed(
  feed: PrompterFeed,
  patch: PrompterPatch,
): PrompterFeed {
  const runOrder = patch.runOrder ?? feed.runOrder;
  const byId = new Map(feed.stories.map((story) => [story.storyId, story]));
  for (const id of patch.removed) byId.delete(id);
  for (const story of patch.stories) byId.set(story.storyId, story);
  return { v: 1, runOrder, stories: [...byId.values()] };
}

export function createPrompterFeedHub(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  airWindows: Pick<AirWindows, "windowOf">;
  upstreamFeed?: UpstreamPrompterFeed;
}): PrompterFeedHub {
  const { storage, sync, clock, airWindows, upstreamFeed } = options;
  const active = new Map<string, DocFeedState>();

  function livePeers(docId: string, state: DocFeedState): Peer[] {
    const unique = new Set<Peer>();
    for (const registry of state.registries) {
      const peers = registry.peersOf(docId);
      if (peers.length === 0) state.registries.delete(registry);
      else for (const peer of peers) unique.add(peer);
    }
    return [...unique];
  }

  function removePeerEverywhere(
    docId: string,
    state: DocFeedState,
    peer: Peer,
  ): void {
    for (const registry of state.registries) registry.remove(docId, peer);
  }

  function teardown(docId: string): void {
    const state = active.get(docId);
    if (state === undefined) return;
    state.cancelHeartbeat?.();
    state.cancelUpstream?.();
    active.delete(docId);
  }

  function docRowOf(
    docId: string,
  ): { generation: number; headSeq: number } | null {
    if (storage.directory.tombstoneOf(docId) !== null) return null;
    const place = storage.directory.placeOf(docId);
    if (place === null || place.kind !== "rundown") return null;
    const row = storage.open(place.home).log.get(docId);
    return row === null
      ? null
      : { generation: row.generation, headSeq: row.headSeq };
  }

  function rejectAll(
    docId: string,
    state: DocFeedState,
    code: "prompter_unavailable" | "forbidden" | "deleted",
    generation: number,
  ): void {
    const msg = syncError(code, { docId, generation });
    for (const peer of livePeers(docId, state)) {
      peer.send(msg);
      removePeerEverywhere(docId, state, peer);
    }
    teardown(docId);
  }

  /** Sends `message` to every live peer of `docId` that still holds access; revokes any that lost it. */
  function fanout(
    docId: string,
    state: DocFeedState,
    generation: number,
    message: Message,
  ): boolean {
    const peers = livePeers(docId, state);
    if (peers.length === 0) {
      teardown(docId);
      return false;
    }
    const { access } = sync();
    const eligible: Peer[] = [];
    for (const peer of peers) {
      const resolved = access.resolve(peer.userId, docId);
      if (!resolved.ok) {
        peer.send(syncError(resolved.code, { docId, generation }));
        removePeerEverywhere(docId, state, peer);
      } else eligible.push(peer);
    }
    if (eligible.length === 0) {
      teardown(docId);
      return false;
    }
    const prepared = prepareMessage(message);
    for (const peer of eligible) peer.send(prepared);
    return true;
  }

  function armHeartbeat(docId: string, state: DocFeedState): void {
    if (state.cancelHeartbeat !== null) return;
    const scheduleNext = (): void => {
      state.cancelHeartbeat = clock.schedule(() => {
        state.cancelHeartbeat = null;
        if (active.get(docId) !== state) return;
        const row = docRowOf(docId);
        if (row === null) {
          rejectAll(docId, state, "deleted", 0);
          return;
        }
        const sent = fanout(docId, state, row.generation, {
          type: "VIEW_PATCH",
          docId,
          generation: row.generation,
          viewSeq: row.headSeq,
          patch: HEARTBEAT_BYTES,
        });
        if (sent) scheduleNext();
      }, HEARTBEAT_MS);
    };
    scheduleNext();
  }

  function ensureState(docId: string): DocFeedState {
    let state = active.get(docId);
    if (state === undefined) {
      state = {
        registries: new Set(),
        lastFeed: null,
        cancelHeartbeat: null,
        cancelUpstream: null,
      };
      active.set(docId, state);
    }
    return state;
  }

  function startUpstream(
    docId: string,
    userId: string,
    state: DocFeedState,
    upstream: UpstreamPrompterFeed,
  ): void {
    if (state.cancelUpstream !== null) return;
    state.cancelUpstream = upstream.subscribe(docId, userId, {
      snapshot(feed) {
        if (active.get(docId) !== state) return;
        state.lastFeed = feed;
        const row = docRowOf(docId);
        if (row === null) return rejectAll(docId, state, "deleted", 0);
        fanout(docId, state, row.generation, {
          type: "VIEW_SNAPSHOT",
          docId,
          generation: row.generation,
          viewSeq: row.headSeq,
          content: encodeJson(feed),
        });
      },
      patch(patch) {
        if (active.get(docId) !== state) return;
        if (state.lastFeed !== null)
          state.lastFeed = applyPatchToFeed(state.lastFeed, patch);
        const row = docRowOf(docId);
        if (row === null) return rejectAll(docId, state, "deleted", 0);
        fanout(docId, state, row.generation, {
          type: "VIEW_PATCH",
          docId,
          generation: row.generation,
          viewSeq: row.headSeq,
          patch: encodeJson(patch),
        });
      },
      error(code) {
        if (active.get(docId) !== state) return;
        const row = docRowOf(docId);
        rejectAll(docId, state, code, row?.generation ?? 0);
      },
    });
  }

  return {
    subscribe(sub) {
      const { peer, message, access, prompters, tell } = sub;
      const { docId, generation } = message;
      const doc = { docId, generation };
      if (storage.directory.tombstoneOf(docId) !== null)
        return tell(syncError("deleted", doc));
      const place = storage.directory.placeOf(docId);
      if (place === null || place.kind !== "rundown")
        return tell(syncError("prompter_unavailable", doc));
      const row = storage.open(place.home).log.get(docId);
      if (row === null) return tell(syncError("prompter_unavailable", doc));

      const isRelayed = upstreamFeed?.isRelayed(docId) === true;
      const snap = isRelayed ? null : readRundownSnapshot(storage, docId, null);
      if (!isRelayed && snap === null)
        return tell(syncError("prompter_unavailable", doc));

      prompters.add(docId, peer);
      const state = ensureState(docId);
      state.registries.add(prompters);
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
        airWindow: airWindows.windowOf(docId),
      });

      if (isRelayed && upstreamFeed !== undefined) {
        if (state.lastFeed !== null) {
          tell({
            type: "VIEW_SNAPSHOT",
            docId,
            generation: row.generation,
            viewSeq: row.headSeq,
            content: encodeJson(state.lastFeed),
          });
        }
        startUpstream(docId, peer.userId, state, upstreamFeed);
        armHeartbeat(docId, state);
        return;
      }

      const feed = buildPrompterFeed(storage, snap!.home, docId, snap!.rundown);
      state.lastFeed = feed;
      tell({
        type: "VIEW_SNAPSHOT",
        docId,
        generation: snap!.generation,
        viewSeq: snap!.headSeq,
        content: encodeJson(feed),
      });
      armHeartbeat(docId, state);
    },
    publish(rundownId, liveDoc = null) {
      const state = active.get(rundownId);
      if (state === undefined) return;
      if (livePeers(rundownId, state).length === 0) return teardown(rundownId);
      if (upstreamFeed?.isRelayed(rundownId)) return;
      const snap = readRundownSnapshot(storage, rundownId, liveDoc);
      if (snap === null) return rejectAll(rundownId, state, "deleted", 0);
      const next = buildPrompterFeed(
        storage,
        snap.home,
        rundownId,
        snap.rundown,
      );
      const patch =
        state.lastFeed === null ? null : diffPrompterFeed(state.lastFeed, next);
      state.lastFeed = next;
      if (patch === null) return;
      fanout(rundownId, state, snap.generation, {
        type: "VIEW_PATCH",
        docId: rundownId,
        generation: snap.generation,
        viewSeq: snap.headSeq,
        patch: encodeJson(patch),
      });
    },
    stop() {
      for (const docId of active.keys()) teardown(docId);
    },
  };
}
