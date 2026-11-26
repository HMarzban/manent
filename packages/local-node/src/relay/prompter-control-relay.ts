// Prompter remote-scroll control relay: forwards upstream operator/scroll CONTROL frames to local
// prompter peers and proxies static & parameterized prompter control HTTP routes for synced vs local rundowns.
import { answerPrompterRequest } from "@manent/server-core";
import type {
  Clock,
  Peer,
  PrompterService,
  SessionStore,
} from "@manent/server-core";
import type { Storage } from "@manent/storage";
import { ConnectError } from "@manent/sync-client";
import type { PrompterHandle, PrompterStatus } from "@manent/sync-client";
import {
  encodePrompterOperatorChanged,
  encodePrompterScrollControl,
  isDocId,
  prepareMessage,
} from "@manent/sync-protocol";
import type {
  ErrorResponse,
  Identity,
  Message,
  PrompterFeed,
  PrompterPatch,
  PrompterStory,
} from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { NodeCoreOptions } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";

export type PrompterSubscribe = PrompterService["subscribePrompter"];
export type PrompterRegistry = Parameters<PrompterSubscribe>[0]["prompters"];

export interface RelayedFeed {
  readonly key: string;
  readonly userId: string;
  readonly docId: string;
  readonly registries: Set<PrompterRegistry>;
  readonly handle: PrompterHandle;
  readonly unsubscribes: (() => void)[];
  readonly snapshotted: Set<Peer>;
  lastFeed: PrompterFeed | null;
  lastStatus: PrompterStatus["feed"];
  lastForwardedAt: number | null;
  cancelSweep: (() => void) | null;
  deliverControlSnapshot(peer: Peer, generation: number): void;
}

export const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

export const HEARTBEAT_BYTES = encodeJson({
  v: 1,
  runOrder: null,
  stories: [],
  removed: [],
} satisfies PrompterPatch);

export function sendTo(peers: readonly Peer[], message: Message): void {
  const prepared = prepareMessage(message);
  for (const peer of peers) peer.send(prepared);
}

export function docRowOf(storage: Storage, docId: string) {
  if (storage.directory.tombstoneOf(docId) !== null) return null;
  const place = storage.directory.placeOf(docId);
  if (place === null || place.kind !== "rundown") return null;
  return storage.open(place.home).log.get(docId);
}

export function readFeedFromHandle(handle: PrompterHandle): PrompterFeed {
  const stories: PrompterStory[] = [];
  for (const [storyId, blocks] of handle.stories.get())
    stories.push({ storyId, blocks: [...blocks] });
  return { v: 1, runOrder: [...handle.runOrder.get()], stories };
}

export function livePeers(entry: RelayedFeed): Peer[] {
  const unique = new Set<Peer>();
  for (const registry of entry.registries) {
    const peers = registry.peersOf(entry.docId);
    if (peers.length === 0) entry.registries.delete(registry);
    else
      for (const peer of peers)
        if (peer.userId === entry.userId) unique.add(peer);
  }
  for (const peer of entry.snapshotted)
    if (!unique.has(peer)) entry.snapshotted.delete(peer);
  return [...unique];
}

export function removePeer(entry: RelayedFeed, peer: Peer): void {
  entry.snapshotted.delete(peer);
  for (const registry of entry.registries) registry.remove(entry.docId, peer);
}

/**
 * Subscribes to `handle.operator` and `handle.scroll`, forwarding `prompter_operator_changed`
 * and `prompter_scroll` CONTROL frames to every eligible local prompter peer.
 */
export function attachPrompterControlForwarder(options: {
  readonly docId: string;
  readonly handle: PrompterHandle;
  readonly clock: Clock;
  readonly generationOf: () => number | null;
  readonly eligiblePeers: (generation: number) => Peer[];
}): {
  readonly unsubscribes: (() => void)[];
  deliverSnapshot(peer: Peer, generation: number): void;
} {
  const { docId, handle, clock, generationOf, eligiblePeers } = options;
  const unsubscribes: (() => void)[] = [];

  const sendOperator = (peers: readonly Peer[], generation: number): void => {
    if (handle.operator === undefined || peers.length === 0) return;
    const data = encodePrompterOperatorChanged({
      docId,
      operator: handle.operator.get(),
      serverTime: clock.now(),
    });
    sendTo(peers, {
      type: "CONTROL",
      docId,
      generation,
      seq: 0,
      kind: "prompter_operator_changed",
      data,
    });
  };

  const sendScroll = (peers: readonly Peer[], generation: number): void => {
    if (handle.scroll === undefined || peers.length === 0) return;
    const remote = handle.scroll.get();
    if (remote.state === null) return;
    const data = encodePrompterScrollControl({
      docId,
      scroll: remote.state,
      serverTime: clock.now(),
    });
    sendTo(peers, {
      type: "CONTROL",
      docId,
      generation,
      seq: 0,
      kind: "prompter_scroll",
      data,
    });
  };

  if (handle.operator !== undefined) {
    unsubscribes.push(
      handle.operator.subscribe(() => {
        const gen = generationOf();
        if (gen === null) return;
        sendOperator(eligiblePeers(gen), gen);
      }),
    );
  }
  if (handle.scroll !== undefined) {
    unsubscribes.push(
      handle.scroll.subscribe(() => {
        const gen = generationOf();
        if (gen === null) return;
        sendScroll(eligiblePeers(gen), gen);
      }),
    );
  }

  return {
    unsubscribes,
    deliverSnapshot(peer, generation) {
      sendOperator([peer], generation);
      sendScroll([peer], generation);
    },
  };
}

const PARAM_CONTROL = new RegExp("^/api/prompter/([^/]+)/control$");
const PARAM_TAKE = new RegExp("^/api/prompter/([^/]+)/operator/take$");
const PARAM_RELEASE = new RegExp("^/api/prompter/([^/]+)/operator/release$");

const STATIC_PATHS: ReadonlySet<string> = new Set([
  "/api/prompter/control",
  "/api/prompter/operator/take",
  "/api/prompter/operator/release",
]);

function pathDocIdOf(method: string, pathname: string): string | null {
  if (method === "GET") return PARAM_CONTROL.exec(pathname)?.[1] ?? null;
  if (method !== "POST") return null;
  return (
    PARAM_TAKE.exec(pathname)?.[1] ??
    PARAM_RELEASE.exec(pathname)?.[1] ??
    PARAM_CONTROL.exec(pathname)?.[1] ??
    null
  );
}

function isControlRoute(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "POST") return false;
  if (method === "GET" && pathname === "/api/prompter/control") return true;
  if (method === "POST" && STATIC_PATHS.has(pathname)) return true;
  return pathDocIdOf(method, pathname) !== null;
}

async function resolveControlDocId(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromPath = pathDocIdOf(request.method, url.pathname);
  if (fromPath !== null) return isDocId(fromPath) ? fromPath : null;
  if (request.method === "GET") {
    const q = url.searchParams.get("docId");
    return isDocId(q) ? q : null;
  }
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (typeof body !== "object" || body === null || !("docId" in body))
    return null;
  return isDocId(body.docId) ? body.docId : null;
}

/**
 * Proxies static & parameterized prompter operator/control HTTP requests to the cloud for synced
 * rundowns (`records.docState(docId) !== null`) and answers local rundowns via `localPrompter`.
 */
export function createPrompterControlHttpProxy(options: {
  readonly records: NodeRecords;
  readonly sessions: SessionStore;
  readonly cloud: NodeCoreOptions["cloud"];
  readonly localPrompter: PrompterService;
  readonly userOf?: (request: Request) => Identity | null;
}): (request: Request) => Promise<Response | null> {
  const { records, sessions, cloud, localPrompter } = options;
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!isControlRoute(request.method, pathname)) return null;

    const docId = await resolveControlDocId(request);
    if (docId === null)
      return Response.json({ error: "bad_request" } satisfies ErrorResponse, {
        status: 400,
      });

    if (records.docState(docId) === null) {
      const user =
        options.userOf !== undefined
          ? options.userOf(request)
          : (() => {
              const p = readPerson(request, { sessions, records });
              return p === null ? null : { userId: p.userId, name: p.name };
            })();
      return answerPrompterRequest(request, {
        service: localPrompter,
        user: () => user,
      });
    }

    const person = readPerson(request, { sessions, records });
    if (person === null)
      return Response.json(
        { error: "unauthenticated" } satisfies ErrorResponse,
        { status: 401 },
      );
    const unreachable = Response.json(
      { error: "unreachable" } satisfies ErrorResponse,
      { status: 503 },
    );
    if (person.cloudToken === null) return unreachable;
    try {
      return await cloud.forward(person.cloudToken, request);
    } catch (error) {
      if (!(error instanceof ConnectError)) throw error;
      return unreachable;
    }
  };
}
