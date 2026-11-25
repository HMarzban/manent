// Prompter feed hub fanout, peer/upstream helpers, and pure scroll-state transitions.
import type { Storage } from "@manent/storage";
import {
  PROMPTER_DEFAULT_SPEED_LPS,
  isDocId,
  prepareMessage,
} from "@manent/sync-protocol";
import type {
  ControlKind,
  Message,
  PrompterFeed,
  PrompterPatch,
  PrompterScrollCommand,
  PrompterScrollState,
} from "@manent/sync-protocol";
import { syncError } from "../sync/errors.ts";
import type { Peer, SyncService } from "../sync/ports.ts";
import type { PrompterSubscribers } from "../sync/prompter-subscribers.ts";

/** In-process observer of a rundown's prompter feed (e.g. the MOS TCP bridge); null on deletion. */
export type PrompterFeedListener = (feed: PrompterFeed | null) => void;

export interface DocFeedState {
  readonly registries: Set<PrompterSubscribers>;
  readonly listeners: Set<PrompterFeedListener>;
  lastFeed: PrompterFeed | null;
  cancelHeartbeat: (() => void) | null;
  cancelUpstream: (() => void) | null;
}

export const encodeFeedJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

export const HEARTBEAT_BYTES = encodeFeedJson({
  v: 1,
  runOrder: null,
  stories: [],
  removed: [],
} satisfies PrompterPatch);

export function applyPatchToFeed(
  feed: PrompterFeed,
  patch: PrompterPatch,
): PrompterFeed {
  const runOrder = patch.runOrder ?? feed.runOrder;
  const byId = new Map(feed.stories.map((story) => [story.storyId, story]));
  for (const id of patch.removed) byId.delete(id);
  for (const story of patch.stories) byId.set(story.storyId, story);
  return { v: 1, runOrder, stories: [...byId.values()] };
}

export function livePeers(docId: string, state: DocFeedState): Peer[] {
  const unique = new Set<Peer>();
  for (const registry of state.registries) {
    const peers = registry.peersOf(docId);
    if (peers.length === 0) state.registries.delete(registry);
    else for (const peer of peers) unique.add(peer);
  }
  return [...unique];
}

export function removePeerEverywhere(
  docId: string,
  state: DocFeedState,
  peer: Peer,
): void {
  for (const registry of state.registries) registry.remove(docId, peer);
}

export function docRowOf(
  storage: Storage,
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

export function notifyFeedListeners(
  state: DocFeedState,
  feed: PrompterFeed | null,
): void {
  for (const listener of Array.from(state.listeners)) {
    try {
      listener(feed);
    } catch {
      // isolate listener failures so peers and other listeners stay live
    }
  }
}

/** Sends `message` to every live peer of `docId` that still holds access; revokes any that lost it. */
export function fanoutMessage(options: {
  docId: string;
  state: DocFeedState;
  generation: number;
  message: Message;
  sync: () => SyncService;
  onNoPeersAndNoListeners: () => void;
}): boolean {
  const { docId, state, generation, message, sync, onNoPeersAndNoListeners } =
    options;
  const peers = livePeers(docId, state);
  if (peers.length === 0) {
    if (state.listeners.size === 0) onNoPeersAndNoListeners();
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
    if (state.listeners.size === 0) onNoPeersAndNoListeners();
    return false;
  }
  const prepared = prepareMessage(message);
  for (const peer of eligible) peer.send(prepared);
  return true;
}

/** Sends a CONTROL frame to all eligible prompter-mode peers subscribed to `docId`. */
export function broadcastControlToPeers(options: {
  docId: string;
  state: DocFeedState | undefined;
  storage: Storage;
  sync: () => SyncService;
  kind: ControlKind;
  data: Uint8Array;
  onEmpty: () => void;
}): void {
  const { docId, state, storage, sync, kind, data, onEmpty } = options;
  if (state === undefined) return;
  const row = docRowOf(storage, docId);
  if (row === null) return;
  fanoutMessage({
    docId,
    state,
    generation: row.generation,
    message: {
      type: "CONTROL",
      docId,
      generation: row.generation,
      seq: row.headSeq,
      kind,
      data,
    },
    sync,
    onNoPeersAndNoListeners: onEmpty,
  });
}

export interface UpstreamFeedSink {
  snapshot(feed: PrompterFeed): void;
  patch(patch: PrompterPatch): void;
  error(code: "prompter_unavailable" | "forbidden" | "deleted"): void;
}

export interface UpstreamPrompterFeed {
  /** True when `docId` is relayed from an upstream authority rather than served locally. */
  isRelayed(docId: string): boolean;
  /** Subscribes to the upstream feed for `docId`; the returned function stops listening. */
  subscribe(docId: string, userId: string, sink: UpstreamFeedSink): () => void;
}

export function attachUpstreamFeed(options: {
  docId: string;
  userId: string;
  state: DocFeedState;
  upstream: UpstreamPrompterFeed;
  isCurrent: () => boolean;
  storage: Storage;
  fanout: (generation: number, message: Message) => boolean;
  reject: (
    code: "prompter_unavailable" | "forbidden" | "deleted",
    generation: number,
  ) => void;
}): void {
  const { docId, userId, state, upstream, isCurrent, storage, fanout, reject } =
    options;
  if (state.cancelUpstream !== null) return;
  state.cancelUpstream = upstream.subscribe(docId, userId, {
    snapshot(feed) {
      if (!isCurrent()) return;
      state.lastFeed = feed;
      notifyFeedListeners(state, feed);
      const row = docRowOf(storage, docId);
      if (row === null) return reject("deleted", 0);
      fanout(row.generation, {
        type: "VIEW_SNAPSHOT",
        docId,
        generation: row.generation,
        viewSeq: row.headSeq,
        content: encodeFeedJson(feed),
      });
    },
    patch(patch) {
      if (!isCurrent()) return;
      if (state.lastFeed !== null) {
        state.lastFeed = applyPatchToFeed(state.lastFeed, patch);
        if (
          patch.runOrder !== null ||
          patch.stories.length > 0 ||
          patch.removed.length > 0
        )
          notifyFeedListeners(state, state.lastFeed);
      }
      const row = docRowOf(storage, docId);
      if (row === null) return reject("deleted", 0);
      fanout(row.generation, {
        type: "VIEW_PATCH",
        docId,
        generation: row.generation,
        viewSeq: row.headSeq,
        patch: encodeFeedJson(patch),
      });
    },
    error(code) {
      if (!isCurrent()) return;
      reject(code, docRowOf(storage, docId)?.generation ?? 0);
    },
  });
}

export function rejectFeedPeers(options: {
  docId: string;
  state: DocFeedState;
  code: "prompter_unavailable" | "forbidden" | "deleted";
  generation: number;
  teardown: () => void;
}): void {
  const { docId, state, code, generation, teardown } = options;
  const msg = syncError(code, { docId, generation });
  for (const peer of livePeers(docId, state)) {
    peer.send(msg);
    removePeerEverywhere(docId, state, peer);
  }
  if (code === "deleted") notifyFeedListeners(state, null);
  teardown();
}

export const projectedScrollOffset = (
  scroll: PrompterScrollState,
  now: number,
): number =>
  scroll.playing
    ? scroll.lineOffset +
      (Math.max(0, now - scroll.updatedAt) / 1000) * scroll.linesPerSecond
    : scroll.lineOffset;

export function nextScrollState(
  prev: PrompterScrollState | null,
  cmd: PrompterScrollCommand,
  userId: string,
  now: number,
): PrompterScrollState {
  const base: PrompterScrollState = prev ?? {
    seq: 0,
    playing: false,
    linesPerSecond: PROMPTER_DEFAULT_SPEED_LPS,
    rowId: null,
    lineOffset: 0,
    updatedAt: now,
    operatorUserId: null,
    operatorDeviceId: null,
  };
  const offset = projectedScrollOffset(base, now);
  const next: PrompterScrollState = {
    ...base,
    seq: base.seq + 1,
    updatedAt: now,
    operatorUserId: userId,
    operatorDeviceId: cmd.deviceId,
    lineOffset: offset,
  };
  switch (cmd.action) {
    case "play":
      return {
        ...next,
        playing: true,
        linesPerSecond: cmd.linesPerSecond ?? base.linesPerSecond,
      };
    case "pause":
      return { ...next, playing: false };
    case "speed":
      return { ...next, linesPerSecond: cmd.linesPerSecond };
    case "cue":
      return { ...next, rowId: cmd.rowId, lineOffset: cmd.lineOffset ?? 0 };
    case "nudge":
      return { ...next, lineOffset: Math.max(0, offset + cmd.deltaLines) };
  }
}

export function checkRundownControlAccess(
  storage: Storage,
  sync: SyncService,
  userId: string,
  docId: string,
  requireControlCap: boolean,
):
  | { ok: true; generation: number | null }
  | {
      ok: false;
      code: "bad_request" | "forbidden" | "not_in_rundown" | "deleted";
    } {
  if (!isDocId(docId)) return { ok: false, code: "bad_request" };
  if (storage.directory.tombstoneOf(docId) !== null)
    return { ok: false, code: "deleted" };
  if (requireControlCap) {
    const caps = sync.access.capabilitiesOf(userId, docId);
    if (caps === null || !caps.includes("send_to_prompter"))
      return { ok: false, code: "forbidden" };
  } else {
    const res = sync.access.resolve(userId, docId);
    if (!res.ok)
      return {
        ok: false,
        code: res.code === "deleted" ? "deleted" : "forbidden",
      };
  }
  const place = storage.directory.placeOf(docId);
  if (place === null || place.kind !== "rundown")
    return { ok: false, code: "not_in_rundown" };
  return {
    ok: true,
    generation: storage.open(place.home).log.get(docId)?.generation ?? null,
  };
}
