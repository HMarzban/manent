// A SUBSCRIBE in prompter mode: snapshot, live patches, 1 s heartbeats, control fanout and feed listeners.
import type { CrdtDoc } from "@manent/crdt";
import type { Storage } from "@manent/storage";
import type { ControlKind, Message } from "@manent/sync-protocol";
import type { AirWindows } from "../rundown/air-window.ts";
import { syncError } from "../sync/errors.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import type { HandledSubscribe, SubscribeHandler } from "../sync/subscribe.ts";
import {
  HEARTBEAT_BYTES,
  attachUpstreamFeed,
  broadcastControlToPeers,
  docRowOf,
  encodeFeedJson,
  fanoutMessage,
  livePeers,
  notifyFeedListeners,
  rejectFeedPeers,
} from "./hub-fanout.ts";
import type {
  DocFeedState,
  PrompterFeedListener,
  UpstreamPrompterFeed,
} from "./hub-fanout.ts";
import {
  buildPrompterFeed,
  diffPrompterFeed,
  readRundownSnapshot,
} from "./projection.ts";

export type { PrompterFeedListener, UpstreamPrompterFeed };

const HEARTBEAT_MS = 1_000;

export interface PrompterFeedHub {
  subscribe(sub: HandledSubscribe): void;
  publish(rundownId: string, liveDoc?: CrdtDoc | null): void;
  broadcastControl(docId: string, kind: ControlKind, data: Uint8Array): void;
  addFeedListener(docId: string, listener: PrompterFeedListener): () => void;
  stop(): void;
}

export const subscribePrompter: SubscribeHandler = ({ message, tell }) =>
  tell(
    syncError("prompter_unavailable", {
      docId: message.docId,
      generation: message.generation,
    }),
  );

export function createPrompterFeedHub(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  airWindows: Pick<AirWindows, "windowOf">;
  upstreamFeed?: UpstreamPrompterFeed;
  onPrompterSubscribed?: (
    docId: string,
    tell: (message: Message) => void,
    meta: { generation: number; headSeq: number },
  ) => void;
}): PrompterFeedHub {
  const {
    storage,
    sync,
    clock,
    airWindows,
    upstreamFeed,
    onPrompterSubscribed,
  } = options;
  const active = new Map<string, DocFeedState>();

  function teardown(docId: string): void {
    const state = active.get(docId);
    if (state === undefined) return;
    state.cancelHeartbeat?.();
    state.cancelUpstream?.();
    active.delete(docId);
  }

  const rejectAll = (
    docId: string,
    state: DocFeedState,
    code: "prompter_unavailable" | "forbidden" | "deleted",
    generation: number,
  ): void =>
    rejectFeedPeers({
      docId,
      state,
      code,
      generation,
      teardown: () => teardown(docId),
    });

  const fanout = (
    docId: string,
    state: DocFeedState,
    generation: number,
    message: Message,
  ): boolean =>
    fanoutMessage({
      docId,
      state,
      generation,
      message,
      sync,
      onNoPeersAndNoListeners: () => teardown(docId),
    });

  function armHeartbeat(docId: string, state: DocFeedState): void {
    if (state.cancelHeartbeat !== null) return;
    const nextTick = (): void => {
      state.cancelHeartbeat = clock.schedule(() => {
        state.cancelHeartbeat = null;
        if (active.get(docId) !== state) return;
        const row = docRowOf(storage, docId);
        if (row === null) return rejectAll(docId, state, "deleted", 0);
        const sent = fanout(docId, state, row.generation, {
          type: "VIEW_PATCH",
          docId,
          generation: row.generation,
          viewSeq: row.headSeq,
          patch: HEARTBEAT_BYTES,
        });
        if (sent) nextTick();
      }, HEARTBEAT_MS);
    };
    nextTick();
  }

  function ensureState(docId: string): DocFeedState {
    let state = active.get(docId);
    if (state === undefined) {
      state = {
        registries: new Set(),
        listeners: new Set(),
        lastFeed: null,
        cancelHeartbeat: null,
        cancelUpstream: null,
      };
      active.set(docId, state);
    }
    return state;
  }

  return {
    subscribe({ peer, message, access, prompters, tell }) {
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
            content: encodeFeedJson(state.lastFeed),
          });
          onPrompterSubscribed?.(docId, tell, row);
        }
        attachUpstreamFeed({
          docId,
          userId: peer.userId,
          state,
          upstream: upstreamFeed,
          isCurrent: () => active.get(docId) === state,
          storage,
          fanout: (gen, msg) => fanout(docId, state, gen, msg),
          reject: (code, gen) => rejectAll(docId, state, code, gen),
        });
        return;
      }

      const feed = buildPrompterFeed(storage, snap!.home, docId, snap!.rundown);
      state.lastFeed = feed;
      tell({
        type: "VIEW_SNAPSHOT",
        docId,
        generation: snap!.generation,
        viewSeq: snap!.headSeq,
        content: encodeFeedJson(feed),
      });
      onPrompterSubscribed?.(docId, tell, snap!);
      armHeartbeat(docId, state);
    },
    publish(rundownId, liveDoc = null) {
      const state = active.get(rundownId);
      if (state === undefined) return;
      const peers = livePeers(rundownId, state);
      if (peers.length === 0 && state.listeners.size === 0)
        return teardown(rundownId);
      if (upstreamFeed?.isRelayed(rundownId)) return;
      const snap = readRundownSnapshot(storage, rundownId, liveDoc);
      if (snap === null) return rejectAll(rundownId, state, "deleted", 0);
      const next = buildPrompterFeed(
        storage,
        snap.home,
        rundownId,
        snap.rundown,
      );
      const prev = state.lastFeed;
      const patch = prev === null ? null : diffPrompterFeed(prev, next);
      state.lastFeed = next;
      if (prev === null || patch !== null) notifyFeedListeners(state, next);
      if (patch === null || peers.length === 0) return;
      fanout(rundownId, state, snap.generation, {
        type: "VIEW_PATCH",
        docId: rundownId,
        generation: snap.generation,
        viewSeq: snap.headSeq,
        patch: encodeFeedJson(patch),
      });
    },
    broadcastControl(docId, kind, data) {
      broadcastControlToPeers({
        docId,
        state: active.get(docId),
        storage,
        sync,
        kind,
        data,
        onEmpty: () => teardown(docId),
      });
    },
    addFeedListener(docId, listener) {
      const state = ensureState(docId);
      state.listeners.add(listener);
      if (state.lastFeed === null && !upstreamFeed?.isRelayed(docId)) {
        const snap = readRundownSnapshot(storage, docId, null);
        if (snap !== null)
          state.lastFeed = buildPrompterFeed(
            storage,
            snap.home,
            docId,
            snap.rundown,
          );
      }
      if (state.lastFeed !== null)
        notifyFeedListeners(
          { ...state, listeners: new Set([listener]) },
          state.lastFeed,
        );
      return () => {
        state.listeners.delete(listener);
        if (state.listeners.size === 0 && livePeers(docId, state).length === 0)
          teardown(docId);
      };
    },
    stop() {
      for (const docId of active.keys()) teardown(docId);
    },
  };
}
