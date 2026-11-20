// One person's sync in this tab: the one place the app builds the sync client's options, what the status reads beside
// it, and the test build's hooks into it.
import { browserPorts } from "@manent/client-web";
import {
  StoreError,
  createSubscribable,
  createSyncClient,
} from "@manent/sync-client";
import type {
  DocEvent,
  DocHandle,
  DocStatus,
  LinkFacts,
  LinkIssue,
  LocalStore,
  SideState,
  Subscribable,
  SyncClient,
  SyncClientPorts,
  Transport,
} from "@manent/sync-client";
import type { VersionSet } from "@manent/sync-protocol";
import type { TabPerson } from "../../session.ts";
import type { DeviceMemory } from "./device-memory.ts";
import { startDrain } from "./drain.ts";

/** Documents the drain holds open at once. */
const DRAIN_PARALLEL = 3;

/**
 * `network`: the browser says it is online. `offlineSince`: when this person's link was first lost since it was last
 * online, kept across reloads (milliseconds since the epoch).
 */
export interface PersonSync {
  client: SyncClient;
  store: LocalStore;
  link: Subscribable<LinkFacts>;
  network: Subscribable<boolean>;
  offlineSince: Subscribable<number | null>;
  dispose(): Promise<void>;
}

/** The test build's `__manent.sync`. */
export interface SyncHooks {
  /** The store's next writes reject with this code; null accepts them again. */
  refuseStore(code: "quota" | "write_failed" | null): void;
  /** The sockets this tab holds open. */
  connections(): number;
  /** Laid over the real facts of the document, for its status and its messages; an issue is laid over the link. */
  inject(
    docId: string,
    fact: { side: SideState } | { issue: LinkIssue } | { event: DocEvent },
  ): void;
}

/** What the hooks lay over the client's facts; nothing in production. */
interface Overlay {
  link(link: Subscribable<LinkFacts>): Subscribable<LinkFacts>;
  status(
    docId: string,
    status: Subscribable<DocStatus>,
  ): Subscribable<DocStatus>;
  on(docId: string, listener: (event: DocEvent) => void): () => void;
}

const NO_OVERLAY: Overlay = Object.freeze<Overlay>({
  link: (link) => link,
  status: (_docId, status) => status,
  on: () => () => {},
});

/** Stops both. */
const both = (first: () => void, second: () => void) => (): void => {
  first();
  second();
};

/** `source` with `lay` applied, told again whenever `source` or `over` changes. */
function laidOver<T>(
  source: Subscribable<T>,
  over: Subscribable<unknown>,
  lay: (value: T) => T,
): Subscribable<T> {
  return {
    get: () => lay(source.get()),
    subscribe(listener) {
      const tell = (): void => listener(lay(source.get()));
      return both(source.subscribe(tell), over.subscribe(tell));
    },
  };
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

type Refusal = Parameters<SyncHooks["refuseStore"]>[0];

/** The store, whose writes reject with `refusal()` while it is not null. */
function refusingStore(store: LocalStore, refusal: () => Refusal): LocalStore {
  const refused = (): Promise<never> | null => {
    const code = refusal();
    return code === null ? null : Promise.reject(new StoreError(code));
  };
  return {
    userId: store.userId,
    load: (docId) => store.load(docId),
    create: (...args) => refused() ?? store.create(...args),
    append: (...args) => refused() ?? store.append(...args),
    acknowledge: (...args) => refused() ?? store.acknowledge(...args),
    refuse: (...args) => refused() ?? store.refuse(...args),
    markApplied: (...args) => refused() ?? store.markApplied(...args),
    checkpoint: (...args) => refused() ?? store.checkpoint(...args),
    patchMeta: (...args) => refused() ?? store.patchMeta(...args),
    reset: (...args) => refused() ?? store.reset(...args),
    addVersion: (...args) => refused() ?? store.addVersion(...args),
    versions: (docId) => store.versions(docId),
    markUploaded: (...args) => refused() ?? store.markUploaded(...args),
    recovered: (docId) => store.recovered(docId),
    dismissRecovered: (...args) => refused() ?? store.dismissRecovered(...args),
    documents: () => store.documents(),
    close: () => store.close(),
  };
}

/** The transport, and the connections it holds open now. */
function countedTransport(transport: Transport): {
  transport: Transport;
  open: Set<object>;
} {
  const open = new Set<object>();
  return {
    open,
    transport: {
      async connect(handlers) {
        const connected = {};
        let closed = false;
        const end = (): void => {
          closed = true;
          open.delete(connected);
        };
        const connection = await transport.connect({
          onFrame: (frame) => handlers.onFrame(frame),
          onClose(code, reason) {
            end();
            handlers.onClose(code, reason);
          },
        });
        if (!closed) open.add(connected);
        return {
          send: (frame) => connection.send(frame),
          close(code, reason) {
            end();
            connection.close(code, reason);
          },
        };
      },
      createDocument: (request) => transport.createDocument(request),
      replay: (request) => transport.replay(request),
    },
  };
}

/** The hooks over `ports`, the ports they watch, and what they lay over the client's facts. */
function createTestHooks(ports: SyncClientPorts): {
  hooks: SyncHooks;
  ports: SyncClientPorts;
  overlay: Overlay;
} {
  let refusal: Refusal = null;
  const counted = countedTransport(ports.transport);
  const sides = createSubscribable<Readonly<Record<string, SideState[]>>>({});
  const issue = createSubscribable<LinkIssue | null>(null);
  const heard = new Set<{ docId: string; listener(event: DocEvent): void }>();
  return {
    ports: {
      ...ports,
      store: refusingStore(ports.store, () => refusal),
      transport: counted.transport,
    },
    hooks: {
      refuseStore(code) {
        refusal = code;
      },
      connections: () => counted.open.size,
      inject(docId, fact) {
        if ("side" in fact) {
          const laid = sides.get()[docId] ?? [];
          sides.set({ ...sides.get(), [docId]: [...laid, fact.side] });
        } else if ("issue" in fact) issue.set(fact.issue);
        else
          for (const one of heard)
            if (one.docId === docId) one.listener(fact.event);
      },
    },
    overlay: {
      link: (link) =>
        laidOver(link, issue, (facts) => ({
          ...facts,
          issue: issue.get() ?? facts.issue,
        })),
      status: (docId, status) =>
        laidOver(status, sides, (facts) => ({
          ...facts,
          side: [...new Set([...facts.side, ...(sides.get()[docId] ?? [])])],
        })),
      on(docId, listener) {
        const one = { docId, listener };
        heard.add(one);
        return () => {
          heard.delete(one);
        };
      },
    },
  };
}

/** The object the test build puts at `__manent`; null in production, which has none. */
function hooksTarget(): object | null {
  const target: unknown = Reflect.get(globalThis, "__manent");
  return typeof target === "object" && target !== null ? target : null;
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

/**
 * The person's sync client over `ports` (the browser's drivers unless given), asked to connect at once when the
 * window comes back online, gets focus or becomes visible, and draining what waits each time it connects. Where the
 * page has the test build's `__manent`, it sets `__manent.sync` to the hooks and removes them in `dispose`.
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
  const { person } = options;
  const given =
    options.ports ??
    (await browserPorts({
      baseUrl: options.baseUrl,
      session: () => person.token,
      userId: person.userId,
    }));
  const target = hooksTarget();
  const test = target === null ? null : createTestHooks(given);
  const ports = test?.ports ?? given;
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
  const network = createSubscribable(navigator.onLine !== false);
  const kept = keepOfflineSince(person.userId, options.memory, link);
  const heard = Object.entries({
    online() {
      network.set(true);
      raw.retryNow();
    },
    offline: () => network.set(false),
    focus: () => raw.retryNow(),
    visibilitychange() {
      if (options.visible()) raw.retryNow();
    },
  });
  for (const [name, hear] of heard)
    options.onlineEvents?.addEventListener(name, hear);
  const stopDrain = startDrain({
    client,
    parallel: DRAIN_PARALLEL,
    trigger: link,
  });
  if (target !== null) Reflect.set(target, "sync", test?.hooks);
  return {
    client,
    store: ports.store,
    link,
    network,
    offlineSince: kept.offlineSince,
    async dispose() {
      for (const [name, hear] of heard)
        options.onlineEvents?.removeEventListener(name, hear);
      stopDrain();
      kept.stop();
      if (target !== null && Reflect.get(target, "sync") === test?.hooks)
        Reflect.deleteProperty(target, "sync");
      await raw.close();
      await ports.store.close();
    },
  };
}
