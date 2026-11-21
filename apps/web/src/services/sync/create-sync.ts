// One person's sync in this tab: the one place the app builds the sync client's options, what the status reads beside it, and where the test build's hooks are set.
import { browserPorts, hasLocalDatabase } from "@manent/client-web";
import { createSubscribable, createSyncClient } from "@manent/sync-client";
import type {
  DocHandle,
  LinkFacts,
  LocalStore,
  Subscribable,
  SyncClient,
  SyncClientPorts,
} from "@manent/sync-client";
import type { VersionSet } from "@manent/sync-protocol";
import {
  SLOW_DELAY_MS,
  connectionTransport,
  throughConnection,
} from "../../demo/connection-transport.ts";
import type { ConnectionControl } from "../../demo/connection-transport.ts";
import type { TabPerson } from "../../session.ts";
import { browserStores } from "./device-memory.ts";
import type { ConnectionMode, DeviceMemory } from "./device-memory.ts";
import { DRAIN_PARALLEL, startDrain } from "./drain.ts";
import { NO_OVERLAY, both, createTestHooks } from "./sync-hooks.ts";
import type { Overlay } from "./sync-hooks.ts";

/**
 * `network`: the browser says it is online and the tab's Connection is not Offline. `offlineSince`: when this person's
 * link was first lost since it was last online, kept across reloads (milliseconds since the epoch).
 */
export interface PersonSync {
  userId: string;
  client: SyncClient;
  store: LocalStore;
  link: Subscribable<LinkFacts>;
  network: Subscribable<boolean>;
  offlineSince: Subscribable<number | null>;
  /** The demo's Connection of this tab, kept across reloads. */
  connection: ConnectionControl;
  /** `send`, a request to the app's own routes, unless the Connection is Offline: then it rejects ConnectError("unreachable") at once. */
  throughConnection<T>(send: () => Promise<T>): Promise<T>;
  /** This browser held the person's store before the sync opened it; null where it cannot tell, and over given ports. */
  hadDatabase: boolean | null;
  /** What sync keeps in this browser's storage beside the store. */
  memory: DeviceMemory;
  dispose(): Promise<void>;
}

/** One open of a document: the client's handle, with its own `close`. */
function handleView(
  handle: DocHandle,
  overlay: Overlay,
  close: () => Promise<void>,
): DocHandle {
  return {
    docId: handle.docId,
    doc: () => handle.doc(),
    status: overlay.status(handle.docId, handle.status),
    recovered: handle.recovered,
    settings: handle.settings,
    writeSchema: handle.writeSchema,
    readOnly: handle.readOnly,
    upstream: handle.upstream,
    on: (listener) =>
      both(handle.on(listener), overlay.on(handle.docId, listener)),
    setSetting: (key, value) => handle.setSetting(key, value),
    holdRemote: () => handle.holdRemote(),
    releaseRemote: () => handle.releaseRemote(),
    sendAwareness: (update) => handle.sendAwareness(update),
    onAwareness: (listener) => handle.onAwareness(listener),
    saveVersion: (label) => handle.saveVersion(label),
    adoptClientIds: (ids) => handle.adoptClientIds(ids),
    close,
  };
}

/**
 * The client, with each open of a document its own handle: the client's handle closes once every one of them is
 * closed, so the page, the editor and the drain each close only their own.
 */
function shareHandles(
  client: SyncClient,
  overlay: Overlay,
  link: Subscribable<LinkFacts>,
): SyncClient {
  const held = new Map<string, { opens: number; handle: Promise<DocHandle> }>();
  const closing = new Map<string, Promise<void>>();
  const hold = async (
    docId: string,
    open: () => Promise<DocHandle>,
  ): Promise<DocHandle> => {
    await closing.get(docId);
    const entry = held.get(docId) ?? { opens: 0, handle: open() };
    held.set(docId, entry);
    entry.opens += 1;
    // an open that failed is asked of the client again next time
    const forget = () => held.get(docId) === entry && held.delete(docId);
    void entry.handle.catch(forget);
    const handle = await entry.handle;
    let closed = false;
    return handleView(handle, overlay, async () => {
      if (closed) return;
      closed = true;
      entry.opens -= 1;
      if (entry.opens > 0 || held.get(docId) !== entry) return;
      held.delete(docId);
      const done = handle.close();
      closing.set(docId, done);
      await done;
      if (closing.get(docId) === done) closing.delete(docId);
    });
  };
  return {
    link,
    open: (docId, options) => hold(docId, () => client.open(docId, options)),
    async create(request) {
      const handle = await client.create(request);
      return hold(handle.docId, async () => handle);
    },
    documents: () => client.documents(),
    setOnline: (wanted) => client.setOnline(wanted),
    retryNow: () => client.retryNow(),
    view: (docId) => client.view(docId),
    close: () => client.close(),
  };
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
 * The tab's Connection, kept in `memory`: Offline asks `client` to stay offline, anything else to connect at once.
 * `network` is false while the browser is offline or the Connection is.
 */
function followConnection(options: {
  mode: Subscribable<ConnectionMode> & { set(mode: ConnectionMode): void };
  memory: DeviceMemory;
  client: SyncClient;
  browser: Subscribable<boolean>;
}): { connection: ConnectionControl; network: Subscribable<boolean> } {
  const { mode, memory, client, browser } = options;
  const reachable = (): boolean => browser.get() && mode.get() !== "offline";
  const network = createSubscribable(reachable());
  browser.subscribe(() => network.set(reachable()));
  const connection: ConnectionControl = {
    mode,
    set(next) {
      memory.setConnection(next);
      mode.set(next);
      network.set(reachable());
      client.setOnline(next !== "offline");
    },
  };
  if (mode.get() === "offline") client.setOnline(false);
  return { connection, network };
}

/**
 * The person's sync client over `ports` (the browser's drivers unless given), draining what waits each time it connects.
 * Where the page has the test build's `__manent`, it sets `__manent.sync` to the hooks and removes them in `dispose`.
 */
export async function createPersonSync(options: {
  person: TabPerson;
  baseUrl: string;
  deviceId: string;
  build: string;
  versions: VersionSet;
  minServer: VersionSet;
  ports?: SyncClientPorts;
  memory: DeviceMemory;
  onlineEvents: EventTarget | null;
  visible: () => boolean;
  now: () => number;
}): Promise<PersonSync> {
  const { person, onlineEvents, visible } = options;
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
  const mode = createSubscribable(options.memory.connection() ?? "online");
  const transport = connectionTransport({
    transport: given.transport,
    clock: given.clock,
    delayMs: SLOW_DELAY_MS,
    control: { mode: () => mode.get() },
  });
  // the hooks make a script as the Library does, each in a project of its own
  const test = createTestHooks({ ...given, transport }, async (docId) =>
    (await import("./create-script.ts")).createScript(client, {
      docId,
      projectId: docId,
      language: navigator.language,
    }),
  );
  const ports = test?.ports ?? { ...given, transport };
  const overlay = test?.overlay ?? NO_OVERLAY;
  const raw = createSyncClient({
    userId: person.userId,
    deviceId: options.deviceId,
    build: options.build,
    versions: options.versions,
    minServer: options.minServer,
    ports,
  });
  const link = overlay.link(raw.link);
  const client = shareHandles(raw, overlay, link);
  // undefined outside a browser, which is never offline
  const browser = createSubscribable(navigator.onLine !== false);
  const { connection, network } = followConnection({
    mode,
    memory: options.memory,
    client: raw,
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
    client,
    store: ports.store,
    link,
    network,
    offlineSince: kept.offlineSince,
    connection,
    throughConnection: (send) =>
      throughConnection({ mode: () => mode.get() }, send),
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
  };
}
