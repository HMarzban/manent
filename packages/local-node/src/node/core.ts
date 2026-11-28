// The node core: the server-core write path for the node's own config, behind the launch guard and
// the node's own routes, with the services of its list, the relay, the mirror, the hand-off and the
// window's upstream status.
import {
  createInlineCheckpointer,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type {
  ManentServer,
  ServerConfig,
  SyncService,
} from "@manent/server-core";
import { encodeUpstreamStatus } from "@manent/sync-client";
import type { UpstreamStatus } from "@manent/sync-client";
import { createHandover } from "../handoff/handoff.ts";
import { bootScript } from "../http/boot-script.ts";
import { createLaunchGuard } from "../http/launch-guard.ts";
import { localRoutes } from "../http/local-routes.ts";
import { workspaceNamed } from "../http/workspace-named.ts";
import { createShellChannel } from "../http/shell-channel.ts";
import type { ShellEnd } from "../http/shell-channel.ts";
import { createCloudSessions, createNodeSignIn } from "../auth/node-sign-in.ts";
import { createRelayBridge } from "../relay/bridge.ts";
import type { RelayBridge } from "../relay/bridge.ts";
import { relayControl } from "../relay/control-relay.ts";
import { nodeDocOf } from "../relay/follow.ts";
import {
  createMirror,
  guardSubscribe,
  mirrorBeforeCreate,
} from "../relay/mirror.ts";
import type { Editor } from "../relay/mirror.ts";
import { createWakeWatch } from "../relay/wake.ts";
import type { NodeCoreOptions } from "./ports.ts";
import { createReseed, watchUpstream } from "./reseed.ts";
import { composeNodeServices } from "./services.ts";

const SSE_HEARTBEAT_MS = 30_000;
const WAKE_TICK_MS = 5_000;
const WAKE_GAP_MS = 15_000;

export interface NodeCore {
  /** The launch guard, then the node's own routes, then server-core. */
  readonly server: ManentServer;
  readonly shell: ShellEnd;
  readonly relay: RelayBridge;
  onFocusRequest(listener: () => void): () => void;
  /** The service shuts down (one last try of what a full disk held), then the relay closes. */
  close(): Promise<void>;
}

function ownerIn(
  storage: NodeCoreOptions["storage"],
  docId: string,
  clientId: number,
): string | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const ledger = storage.open(place.home).log.ledger(docId);
  return ledger.get(clientId)?.userId ?? null;
}

function serviceOf(server: ManentServer): SyncService {
  if (server.sync === null) throw new TypeError("the node serves no documents");
  return server.sync;
}

/** Composes the node's parts, and nothing else. */
export function createNodeCore(options: NodeCoreOptions): NodeCore {
  const { storage, records, cloud, clock, defer, random } = options;
  const url = new URL(options.nodeUrl);
  const hosts = [`127.0.0.1:${url.port}`, `localhost:${url.port}`];
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: clock.now,
  });
  const tokenOf = (userId: string): string | null =>
    records.person(userId)?.cloudToken ?? null;
  const focus = new Set<() => void>();
  let device: UpstreamStatus["device"] = "ok";
  /** People whose hand-off waits until the disk has taken what it held. */
  const afterDisk = new Set<string>();
  const cloudSessions = createCloudSessions({
    cloud,
    records,
    tokenOf,
    onSignedIn: (userId) => handOver(userId),
  });
  let watched: { editors(): Editor[] } | null = null;

  const control = (
    docId: string,
    kind: "upstream_status" | "upstream_refused",
    data: Uint8Array,
    userId: string | null,
  ): void => {
    for (const editor of watched?.editors() ?? [])
      if (userId === null || editor.userId === userId)
        editor.control(docId, kind, data);
  };
  const sendStatus = (docId: string, status: UpstreamStatus): void =>
    control(docId, "upstream_status", encodeUpstreamStatus(status), null);

  const upstream = watchUpstream({
    upstream: options.upstream,
    records,
    reauthenticate: cloudSessions.reauthenticate,
    onConnected: connected,
  });

  const relay = createRelayBridge({
    storage,
    records,
    upstream,
    clock,
    defer,
    deviceStorage: () => device,
    ownerOf: (docId, clientId) => ownerIn(storage, docId, clientId),
    handoffRefused: (docId) => records.handoff(docId)?.refused ?? null,
    onRefused: (docId, userId, data) =>
      control(docId, "upstream_refused", data, userId),
    onControl: (docId, userId, received) =>
      relayControl(
        (watched?.editors() ?? []).filter((editor) => editor.userId === userId),
        docId,
        received,
      ),
  });
  relay.onStatus(sendStatus);
  const shell = createShellChannel({ clock, heartbeatMs: SSE_HEARTBEAT_MS });
  const clientOf = (userId: string) => relay.clientOf(userId);
  const ids = (): string => random.bytes(16).toHex();
  const composed = composeNodeServices({
    ...options,
    sessions,
    ids,
    sync: () => serviceOf(server),
    shell: shell.shell,
    clientOf,
    reserveClientId: (userId, docId) => relay.reserveClientId(userId, docId),
  });

  const sync: NonNullable<ServerConfig["sync"]> = {
    storage,
    clock,
    defer,
    ids,
    mode: (docId) => (records.docState(docId) === null ? "authority" : "relay"),
    fullDisk: "hold",
    onDeviceStorage(state) {
      device = state;
      const editors = watched?.editors() ?? [];
      const held = new Set(
        editors.flatMap((editor) => [...editor.docs.keys()]),
      );
      for (const docId of held) sendStatus(docId, relay.status(docId));
      if (state === "failing") return;
      for (const userId of afterDisk) handOver(userId);
      afterDisk.clear();
    },
    upstream: relay,
    checkpointer: createInlineCheckpointer({ storage, defer }),
    registry: options.registry,
    ...composed.sync,
  };

  const server = createServer({
    http: {
      allowedHosts: hosts,
      openUrl: options.nodeUrl,
      webDir: options.webDir,
    },
    auth: {
      signIn: createNodeSignIn({
        provider: options.signIn,
        records,
        sessions,
        now: clock.now,
        onChosen: cloudSessions.chosen,
      }),
      directory: options.directory,
      sessions,
    },
    demo: { seedId: () => records.seedId(), control: null, controls: null },
    socket: {
      tickets: createTicketStore({ now: clock.now }),
      versions: options.versions,
      allowedOrigins: [url.origin],
    },
    sync,
    ...composed.config,
  });
  const service = serviceOf(server);
  relay.attach(service);

  const reseed = createReseed({
    storage,
    records,
    cloud,
    relay,
    service,
    sessions: cloudSessions,
    wipe: options.wipe,
    onWiped: () => composed.config.search?.catchUpNow(),
  });

  const mirror = createMirror({
    storage,
    records,
    cloud,
    tokenOf,
    reauthenticate: reseed.reauthenticate,
    waitReseed: reseed.wait,
  });
  const handover = createHandover({
    storage,
    records,
    cloud,
    relay,
    upstream,
    service,
    tokenOf,
    clock,
    random,
    snapshot(docId) {
      const place = storage.directory.placeOf(docId);
      const doc = nodeDocOf(storage, docId);
      if (place === null || doc === null)
        throw new RangeError(`the node holds no ${docId}`);
      const state = doc.encodeState();
      doc.destroy();
      const home =
        place.home.kind === "user"
          ? "user"
          : `${place.home.kind}:${place.home.id}`;
      const workspaceId = records.workspaceOf(docId);
      return { state, kind: place.kind, home, workspaceId };
    },
  });

  const guarded = guardSubscribe({
    inner: server.connections,
    storage,
    records,
    mirror,
    tokenOf,
    waitToken: cloudSessions.waitToken,
    isReseeding: () => reseed.active,
    waitReseed: reseed.wait,
    clock,
    subscribed(editor, docId) {
      editor.control(
        docId,
        "upstream_status",
        encodeUpstreamStatus(relay.status(docId)),
      );
      const { userId } = editor;
      if (userId === null || records.docState(docId)?.state !== "synced")
        return;
      relay.open(userId, docId).catch(() => {
        // a line that could not open is forgotten, and opened again at the window's next subscribe or edit
      });
    },
    acked(docId) {
      if (records.docState(docId)?.state === "synced")
        relay.resendStatus(docId);
    },
  });
  watched = guarded;

  /** Hands the person's scripts over in the background. */
  function handOver(userId: string): void {
    // a snapshot now would leave out the commits the disk holds, and the cloud would refuse them later as a push
    if (device === "failing") return void afterDisk.add(userId);
    handover.run(userId).catch(() => {
      // a run cut short resumes from the key and snapshot it stored, at the person's next connection or launch
    });
  }

  /** On each connection of a person's upstream: their hand-off, and the demo's seed checked. */
  function connected(userId: string): void {
    handOver(userId);
    reseed.check().catch(() => {
      // a reset that could not finish stored no new seed: the next connection runs it again
    });
  }

  const closeCallbacks: (() => void)[] = [];
  const routes = localRoutes({
    records,
    shell,
    sessions,
    clock,
    clientOf,
    onClose: (fn) => void closeCallbacks.push(fn),
    async signInToSync(userId) {
      const person = records.person(userId);
      const token = person === null ? null : await cloudSessions.signIn(person);
      if (token === null) return { ok: false, code: "unreachable" };
      handOver(userId);
      return { ok: true };
    },
    onFocus() {
      for (const listener of focus) listener();
    },
    storeUsage: options.storeUsage,
    setConnection: (mode, delayMs) => relay.setConnection(mode, delayMs),
  });

  const inner: ManentServer = {
    sync: service,
    connections: guarded.connections,
    async fetch(request, context) {
      const handled =
        (await routes(request)) ?? (await composed.forward(request));
      if (handled !== null) return handled;
      await mirrorBeforeCreate({
        request,
        storage,
        mirror,
        resolveUser: (t) => sessions.resolve(t)?.userId ?? null,
        ensureCloudToken: cloudSessions.waitToken,
        waitReseed: reseed.wait,
      });
      const named = await workspaceNamed(request);
      const answer = await server.fetch(request, context);
      if (named !== null && answer?.status === 200)
        records.setWorkspace(named.docId, named.workspaceId);
      return answer;
    },
  };

  const boot = options.boot;
  const session = (): string | null => {
    const current = records.current();
    const person = current === null ? null : records.person(current.userId);
    if (current === null || person === null) return null;
    const { userId, name } = person;
    return JSON.stringify({ token: current.nodeToken, userId, name });
  };
  // a hand-off a stopped process left goes on at launch: no upstream connects for a script the node still holds as its own
  for (const { userId } of records.people()) handOver(userId);

  const stopWake = createWakeWatch({
    clock,
    tickMs: WAKE_TICK_MS,
    gapMs: WAKE_GAP_MS,
    onWake: () => relay.reconnect(),
  });

  return {
    server: createLaunchGuard({
      token: options.launchToken,
      inner,
      bootScript:
        boot === null
          ? null
          : () => bootScript({ ...boot(), session: session() }),
    }),
    shell: shell.shell,
    relay,
    onFocusRequest(listener) {
      focus.add(listener);
      return () => focus.delete(listener);
    },
    async close() {
      stopWake();
      for (const fn of closeCallbacks.splice(0)) fn();
      composed.stop();
      composed.config.search?.stop();
      composed.config.prompter?.stop();
      await service.shutdown();
      await relay.close();
    },
  };
}
