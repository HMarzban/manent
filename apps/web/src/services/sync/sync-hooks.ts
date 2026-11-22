// The test build's hooks into one person's sync: a store that refuses on request, the sockets counted, facts laid
// over the real ones, and a script made at an address; never defined in production.
import { StoreError, createSubscribable } from "@manent/sync-client";
import type {
  DocEvent,
  DocStatus,
  LinkFacts,
  LinkIssue,
  LocalStore,
  SideState,
  Subscribable,
  SyncClientPorts,
  Transport,
} from "@manent/sync-client";

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
  /** Makes the script `docId` as the Library makes one, in a project of its own. */
  createScript(docId: string): Promise<void>;
}

/** What the hooks lay over the client's facts; nothing in production. */
export interface Overlay {
  link(link: Subscribable<LinkFacts>): Subscribable<LinkFacts>;
  status(
    docId: string,
    status: Subscribable<DocStatus>,
  ): Subscribable<DocStatus>;
  on(docId: string, listener: (event: DocEvent) => void): () => void;
}

export const NO_OVERLAY: Overlay = Object.freeze<Overlay>({
  link: (link) => link,
  status: (_docId, status) => status,
  on: () => () => {},
});

export const both = (first: () => void, second: () => void) => (): void => {
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

/**
 * Where the page has the test build's `__manent`: it, the hooks over `ports`, the ports they watch and what they lay;
 * `createScript` makes a script.
 */
export function createTestHooks(
  ports: SyncClientPorts,
  createScript: (docId: string) => Promise<void>,
): {
  hooks: SyncHooks;
  target: object;
  ports: SyncClientPorts;
  overlay: Overlay;
} | null {
  const target: unknown = Reflect.get(globalThis, "__manent");
  if (typeof target !== "object" || target === null) return null;
  let refusal: Refusal = null;
  const counted = countedTransport(ports.transport);
  const sides = createSubscribable<Readonly<Record<string, SideState[]>>>({});
  const issue = createSubscribable<LinkIssue | null>(null);
  const heard = new Set<{ docId: string; listener(event: DocEvent): void }>();
  return {
    target,
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
      createScript,
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
