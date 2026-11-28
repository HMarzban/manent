// The node core: the server-core write path for the node's own config, behind the launch guard and
// the node's own routes, with the services of its list, the relay, the mirror, the hand-off and the
// window's upstream status.
import {
  createInlineCheckpointer,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type { ManentServer, ServerConfig } from "@manent/server-core";
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
import {
  createMirror,
  guardSubscribe,
  mirrorBeforeCreate,
} from "../relay/mirror.ts";
import type { Editor } from "../relay/mirror.ts";
import { createWakeWatch } from "../relay/wake.ts";
import { createCloudStatus } from "./cloud-status.ts";
import type { ConnectionMode } from "./cloud-status.ts";
import {
  closeNodeParts,
  createNodeFetch,
  currentSessionJson,
  onDeviceStorageChange,
  ownerIn,
  resumeCloudPeople,
  sendEditorControl,
  serviceOf,
  snapshotForHandoff,
} from "./core-helpers.ts";
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

/** Composes the node's parts, and nothing else. */
export function createNodeCore(options: NodeCoreOptions): NodeCore {
  const { storage, records, clock, defer, random } = options;
  const url = new URL(options.nodeUrl);
  const hosts = [`127.0.0.1:${url.port}`, `localhost:${url.port}`];
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: clock.now,
  });
  const cloudStatus = createCloudStatus({
    cloud: options.cloud,
    clock,
    onOnlineChange: (online) =>
      shell.shell.send({ v: 1, t: "cloud_state", online }),
    onRecovered: () => recover(),
  });
  const { cloud } = cloudStatus;
  const currentCloudState = () =>
    ({ v: 1, t: "cloud_state", online: cloudStatus.status().online }) as const;
  const shell = createShellChannel({
    clock,
    heartbeatMs: SSE_HEARTBEAT_MS,
    onOpen: (send) => send(currentCloudState()),
  });
  shell.shell.onMessage((m) => {
    if (m.t === "first_frame") shell.shell.send(currentCloudState());
  });
  const tokenOf = (userId: string): string | null =>
    records.person(userId)?.cloudToken ?? null;
  const focus = new Set<() => void>();
  let device: UpstreamStatus["device"] = "ok";
  const afterDisk = new Set<string>();
  const cloudSessions = createCloudSessions({
    cloud,
    records,
    tokenOf,
    onSignedIn(userId) {
      handOver(userId);
      rawRelay.reconnect();
    },
  });
  let watched: { editors(): Editor[] } | null = null;
  const sendStatus = (docId: string, status: UpstreamStatus): void =>
    sendEditorControl(
      watched?.editors() ?? [],
      docId,
      "upstream_status",
      encodeUpstreamStatus(status),
      null,
    );
  const upstream = watchUpstream({
    upstream: options.upstream,
    records,
    reauthenticate: cloudSessions.reauthenticate,
    onConnected: connected,
    onReachability: (up) =>
      up ? cloudStatus.reportReachable() : cloudStatus.reportUnreachable(),
  });
  const rawRelay = createRelayBridge({
    storage,
    records,
    upstream,
    clock,
    defer,
    deviceStorage: () => device,
    ownerOf: (docId, clientId) => ownerIn(storage, docId, clientId),
    handoffRefused: (docId) => records.handoff(docId)?.refused ?? null,
    onRefused: (docId, userId, data) =>
      sendEditorControl(
        watched?.editors() ?? [],
        docId,
        "upstream_refused",
        data,
        userId,
      ),
    onControl: (docId, userId, received) =>
      relayControl(
        (watched?.editors() ?? []).filter((e) => e.userId === userId),
        docId,
        received,
      ),
  });
  const setConnection = (mode: ConnectionMode, delayMs: number): void => {
    rawRelay.setConnection(mode, delayMs);
    cloudStatus.setMode(mode);
  };
  const relay: RelayBridge = { ...rawRelay, setConnection };
  relay.onStatus(sendStatus);
  const ids = (): string => random.bytes(16).toHex();
  const composed = composeNodeServices({
    ...options,
    cloud,
    sessions,
    ids,
    sync: () => serviceOf(server),
    shell: shell.shell,
    clientOf: relay.clientOf,
    reserveClientId: relay.reserveClientId,
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
      onDeviceStorageChange({
        state,
        editors: watched?.editors() ?? [],
        afterDisk,
        statusOf: relay.status,
        sendStatus,
        handOver,
      });
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
    reauthenticate: reseed.reauthenticate,
    clock,
    random,
    snapshot: (docId) => snapshotForHandoff(storage, records, docId),
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
      if (userId !== null && records.docState(docId)?.state === "synced")
        relay.open(userId, docId).catch(() => {});
    },
    acked(docId) {
      if (records.docState(docId)?.state === "synced")
        relay.resendStatus(docId);
    },
  });
  watched = guarded;
  function handOver(userId: string): void {
    if (device === "failing") return void afterDisk.add(userId);
    handover.run(userId).catch(() => {});
  }
  function connected(userId: string): void {
    handOver(userId);
    reseed.check().catch(() => {});
  }
  function recover(): void {
    rawRelay.reconnect();
    resumeCloudPeople({
      records,
      onlyWantingCloud: true,
      choose: cloudSessions.chosen,
      handOver,
    });
    reseed.check().catch(() => {});
  }

  const closeCallbacks: (() => void)[] = [];
  const routes = localRoutes({
    records,
    shell,
    sessions,
    clock,
    clientOf: relay.clientOf,
    cloudStatus: cloudStatus.status,
    probeCloud: () => cloudStatus.probe().then(() => undefined),
    onClose: (fn) => void closeCallbacks.push(fn),
    async signInToSync(userId) {
      const person = records.person(userId);
      const token = person === null ? null : await cloudSessions.signIn(person);
      if (token === null) return { ok: false, code: "unreachable" };
      handOver(userId);
      return { ok: true };
    },
    onFocus: () => {
      for (const listener of focus) listener();
    },
    storeUsage: options.storeUsage,
    setConnection,
  });

  const inner: ManentServer = {
    sync: service,
    connections: guarded.connections,
    fetch: createNodeFetch({
      records,
      routes,
      forward: composed.forward,
      beforeFetch: (request) =>
        mirrorBeforeCreate({
          request,
          storage,
          mirror,
          resolveUser: (t) => sessions.resolve(t)?.userId ?? null,
          ensureCloudToken: cloudSessions.waitToken,
          waitReseed: reseed.wait,
        }),
      workspaceNamed,
      serverFetch: server.fetch,
      isOnline: () => cloudStatus.status().online,
      sessions,
      handOver,
    }),
  };

  const boot = options.boot;
  resumeCloudPeople({
    records,
    onlyWantingCloud: false,
    choose: cloudSessions.chosen,
    handOver,
  });
  void cloudStatus.probe();

  const stopWake = createWakeWatch({
    clock,
    tickMs: WAKE_TICK_MS,
    gapMs: WAKE_GAP_MS,
    onWake: () => {
      relay.reconnect();
      void cloudStatus.probe();
    },
  });

  return {
    server: createLaunchGuard({
      token: options.launchToken,
      inner,
      bootScript:
        boot === null
          ? null
          : () =>
              bootScript({
                ...boot(),
                session: currentSessionJson(records),
              }),
    }),
    shell: shell.shell,
    relay,
    onFocusRequest(listener) {
      focus.add(listener);
      return () => focus.delete(listener);
    },
    close: () =>
      closeNodeParts({
        stopWake,
        stopCloud: cloudStatus.stop,
        stopHandover: handover.stop,
        closeShell: shell.close,
        closeCallbacks,
        stopComposed: composed.stop,
        stopSearch: composed.config.search?.stop,
        stopPrompter: composed.config.prompter?.stop,
        shutdownService: () => service.shutdown(),
        closeRelay: () => rawRelay.close(),
      }),
  };
}
