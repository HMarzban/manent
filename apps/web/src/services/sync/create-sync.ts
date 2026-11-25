// One person's sync in this tab: the one place the app builds the sync client's options, what the status reads beside it, and where the test build's hooks are set.
import { browserPorts, hasLocalDatabase } from "@manent/client-web";
import { createSubscribable, createSyncClient } from "@manent/sync-client";
import type {
  LinkFacts,
  LocalStore,
  Subscribable,
  SyncClient,
  SyncClientOptions,
  SyncClientPorts,
  Transport,
} from "@manent/sync-client";
import type { VersionSet } from "@manent/sync-protocol";
import {
  SLOW_DELAY_MS,
  connectionTransport,
  throughConnection,
} from "../../demo/connection-transport.ts";
import type { ConnectionControl } from "../../demo/connection-transport.ts";
import { createUploader } from "../../history/source.ts";
import type { TabPerson } from "../../session.ts";
import { browserStores } from "./device-memory.ts";
import type { ConnectionMode, DeviceMemory } from "./device-memory.ts";
import { DRAIN_PARALLEL, startDrain } from "./drain.ts";
import { shareHandles } from "./shared-handles.ts";
import type { ControlListener } from "./shared-handles.ts";
import { NO_OVERLAY, createTestHooks } from "./sync-hooks.ts";

/**
 * `network`: the browser says it is online and the tab's Connection is not Offline. `offlineSince`: when this person's
 * link was first lost since it was last online, kept across reloads (milliseconds since the epoch).
 */
export interface PersonSync {
  userId: string;
  /** The person has a session: false for someone who has not signed in. */
  signedIn: boolean;
  client: SyncClient;
  store: LocalStore;
  link: Subscribable<LinkFacts>;
  network: Subscribable<boolean>;
  offlineSince: Subscribable<number | null>;
  /** The demo's Connection of this tab, kept across reloads; through the local node, it never takes the tab's own link down. */
  connection: ConnectionControl;
  /**
   * `send`, a request to the app's own routes, unless the Connection is Offline: then it rejects ConnectError("unreachable")
   * at once. Through the local node, whose link to the cloud the Connection acts on, `send` always.
   */
  throughConnection<T>(send: () => Promise<T>): Promise<T>;
  /** This browser held the person's store before the sync opened it; null where it cannot tell, and over given ports. */
  hadDatabase: boolean | null;
  /** What sync keeps in this browser's storage beside the store. */
  memory: DeviceMemory;
  dispose(): Promise<void>;
  /** Each CONTROL frame of a document this tab holds open; the returned function stops. */
  onControl(listener: ControlListener): () => void;
}

/** Kept per person in `memory`: set when the link is first lost while none is kept, cleared once it is online. */
function keepOfflineSince(
  userId: string,
  memory: DeviceMemory,
  link: Subscribable<LinkFacts>,
): { offlineSince: Subscribable<number | null>; stop(): void } {
  const offlineSince = createSubscribable(memory.offlineSince(userId));
  const follow = (facts: LinkFacts): void => {
    if (facts.state === "online") {
      memory.setOfflineSince(userId, null);
      offlineSince.set(null);
    } else if (facts.wentOfflineAt !== null && offlineSince.get() === null) {
      memory.setOfflineSince(userId, facts.wentOfflineAt);
      offlineSince.set(facts.wentOfflineAt);
    }
  };
  follow(link.get());
  return { offlineSince, stop: link.subscribe(follow) };
}

/** Asks `client` to connect at once when `target` is back online, focused or visible, and keeps `browser` to it. */
function askOnEvents(
  target: EventTarget | null,
  client: SyncClient,
  browser: { set(online: boolean): void },
  visible: () => boolean,
): () => void {
  const heard = Object.entries({
    online() {
      browser.set(true);
      client.retryNow();
    },
    offline: () => browser.set(false),
    focus: () => client.retryNow(),
    visibilitychange() {
      if (visible()) client.retryNow();
    },
  });
  for (const [name, hear] of heard) target?.addEventListener(name, hear);
  return () => {
    for (const [name, hear] of heard) target?.removeEventListener(name, hear);
  };
}

/**
 * Where the demo's Connection acts, by the client's server: on this tab's own link to the server, whose transport it cuts
 * off or slows, whose client it asks to stay offline and whose requests it refuses; or, through the local node, on the
 * node's link to the cloud, which leaves the tab's transport, client and requests as they are.
 */
interface ConnectionPlace {
  transport(given: SyncClientPorts, mode: () => ConnectionMode): Transport;
  /** What the Connection, set to `mode`, asks of the tab's client. */
  ask(client: SyncClient, mode: ConnectionMode): void;
  throughConnection<T>(
    mode: () => ConnectionMode,
    send: () => Promise<T>,
  ): Promise<T>;
}

const CONNECTION_PLACES: Readonly<
  Record<NonNullable<SyncClientOptions["via"]>, ConnectionPlace>
> = Object.freeze({
  server: {
    transport: (given, mode) =>
      connectionTransport({
        transport: given.transport,
        clock: given.clock,
        delayMs: SLOW_DELAY_MS,
        control: { mode },
      }),
    ask: (client, mode) => client.setOnline(mode !== "offline"),
    throughConnection: (mode, send) => throughConnection({ mode }, send),
  },
  local_node: {
    transport: (given) => given.transport,
    ask() {
      // the node is told of the Connection, and keeps the tab's own link to it
    },
    throughConnection: (_mode, send) => send(),
  },
});

/**
 * The tab's Connection, kept in `memory`: each change is passed to `ask`, and Offline at the start too. `network` is false
 * while the browser is offline or the Connection is.
 */
function followConnection(options: {
  mode: Subscribable<ConnectionMode> & { set(mode: ConnectionMode): void };
  memory: DeviceMemory;
  ask: (mode: ConnectionMode) => void;
  browser: Subscribable<boolean>;
}): { connection: ConnectionControl; network: Subscribable<boolean> } {
  const { mode, memory, ask, browser } = options;
  const reachable = (): boolean => browser.get() && mode.get() !== "offline";
  const network = createSubscribable(reachable());
  browser.subscribe(() => network.set(reachable()));
  const connection: ConnectionControl = {
    mode,
    set(next) {
      memory.setConnection(next);
      mode.set(next);
      network.set(reachable());
      ask(next);
    },
  };
  if (mode.get() === "offline") ask("offline");
  return { connection, network };
}

/** What the person's sync is made of; `ports` are the browser's drivers unless given. */
interface PersonSyncOptions {
  person: TabPerson;
  baseUrl: string;
  deviceId: string;
  build: string;
  versions: VersionSet;
  minServer: VersionSet;
  ports?: SyncClientPorts;
  via?: SyncClientOptions["via"];
  memory: DeviceMemory;
  onlineEvents: EventTarget | null;
  visible: () => boolean;
  now: () => number;
}

/** The ports the sync is given, or the browser's for `person`, and whether this browser held their store before. */
async function portsOf(
  options: PersonSyncOptions,
): Promise<{ given: SyncClientPorts; hadDatabase: boolean | null }> {
  const { person } = options;
  // looked for before the browser's store is opened, which makes it
  const hadDatabase =
    options.ports === undefined
      ? await hasLocalDatabase(browserStores().indexedDb, person.userId)
      : null;
  const given =
    options.ports ??
    (await browserPorts({
      baseUrl: options.baseUrl,
      session: () => person.token,
      userId: person.userId,
    }));
  return { given, hadDatabase };
}

/** The sync client over `given`, through the test build's hooks where the page has them, with its handles shared. */
function startClient(
  options: PersonSyncOptions,
  given: SyncClientPorts,
): {
  raw: SyncClient;
  client: SyncClient;
  link: Subscribable<LinkFacts>;
  ports: SyncClientPorts;
  controls: Set<ControlListener>;
  test: ReturnType<typeof createTestHooks>;
} {
  const { person } = options;
  // the hooks make a script as the Library does, each in a project of its own
  const test = createTestHooks(given, async (docId) =>
    (await import("./create-script.ts")).createScript(client, {
      docId,
      projectId: docId,
      language: navigator.language,
    }),
  );
  const ports = test?.ports ?? given;
  const overlay = test?.overlay ?? NO_OVERLAY;
  const raw = createSyncClient({
    userId: person.userId,
    deviceId: options.deviceId,
    build: options.build,
    versions: options.versions,
    minServer: options.minServer,
    ports,
    uploadVersion: createUploader({
      fetch,
      token: () => person.token,
      deviceId: options.deviceId,
    }),
    via: options.via,
  });
  const link = overlay.link(raw.link);
  const controls = new Set<ControlListener>();
  const client = shareHandles(raw, overlay, link, controls);
  return { raw, client, link, ports, controls, test };
}

/**
 * The person's sync client over `ports` (the browser's drivers unless given), draining what waits each time it connects;
 * `via` also says where the demo's Connection acts. Where the page has the test build's `__manent`, it sets
 * `__manent.sync` to the hooks and removes them in `dispose`.
 */
export async function createPersonSync(
  options: PersonSyncOptions,
): Promise<PersonSync> {
  const { person, onlineEvents, visible } = options;
  const { given, hadDatabase } = await portsOf(options);
  const mode = createSubscribable(options.memory.connection() ?? "online");
  const current = (): ConnectionMode => mode.get();
  const place = CONNECTION_PLACES[options.via ?? "server"];
  const transport = place.transport(given, current);
  const { raw, client, link, ports, controls, test } = startClient(options, {
    ...given,
    transport,
  });
  // undefined outside a browser, which is never offline
  const browser = createSubscribable(navigator.onLine !== false);
  const { connection, network } = followConnection({
    mode,
    memory: options.memory,
    ask: (next) => place.ask(raw, next),
    browser,
  });
  const kept = keepOfflineSince(person.userId, options.memory, link);
  const stopAsking = askOnEvents(onlineEvents, raw, browser, visible);
  const stopDrain = startDrain({
    client,
    parallel: DRAIN_PARALLEL,
    trigger: link,
  });
  if (test !== null) Reflect.set(test.target, "sync", test.hooks);
  return {
    userId: person.userId,
    signedIn: person.token !== null,
    client,
    store: ports.store,
    link,
    network,
    offlineSince: kept.offlineSince,
    connection,
    throughConnection: (send) => place.throughConnection(current, send),
    hadDatabase,
    memory: options.memory,
    async dispose() {
      stopAsking();
      stopDrain();
      kept.stop();
      if (test !== null && Reflect.get(test.target, "sync") === test.hooks)
        Reflect.deleteProperty(test.target, "sync");
      await raw.close();
      await ports.store.close();
    },
    onControl(listener) {
      controls.add(listener);
      return () => controls.delete(listener);
    },
  };
}
