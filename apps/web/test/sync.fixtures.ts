// A server the tests script over the memory network, and one person's sync over it: a fake clock, a memory store
// and memory storage.
import { createDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { soloLeader } from "@manent/sync-client";
import type {
  DocEvent,
  DocHandle,
  DocStatus,
  DocSummary,
  Frames,
  LinkFacts,
  RecoveredItem,
  SyncClient,
  SyncClientPorts,
  ViewHandle,
} from "@manent/sync-client";
import {
  createFakeClock,
  createMemoryNetwork,
  createMemoryStore,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import type {
  FakeClock,
  MemoryNetwork,
  MemoryStoreSpace,
} from "@manent/sync-client/testing";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type {
  CreateDocumentRequest,
  DocRole,
  Message,
} from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import type { ConnectionMode } from "../src/services/sync/device-memory.ts";
import type { TabPerson } from "../src/session.ts";
import { MemoryStorage, V1, fixedRandom } from "./services.fixtures.ts";

export const START = 1_794_319_800_000;
export const DANA: TabPerson = Object.freeze({
  token: "token-dana",
  userId: "dana",
  name: "Dana Reyes",
});

export interface ScriptedServer {
  /** Every message the clients sent of these types, in the order they arrived. */
  got<T extends Message["type"]>(
    ...types: T[]
  ): Extract<Message, { type: T }>[];
  /** While true, every SET is refused with 4423; otherwise acknowledged. */
  refusingSettings: boolean;
  /** Every document the clients asked the server to create, in order. */
  readonly created: CreateDocumentRequest[];
  doc(docId: string): CrdtDoc;
}

/** HELLO, an edit SUBSCRIBE and step 1 are answered as a server holding an empty script; every PUSH is acknowledged. */
export function scriptedServer(network: MemoryNetwork): ScriptedServer {
  const received: Message[] = [];
  const docs = new Map<string, CrdtDoc>();
  let head = 1;
  const server: ScriptedServer = {
    got: <T extends Message["type"]>(...types: T[]) =>
      received.filter((m): m is Extract<Message, { type: T }> =>
        types.some((t) => t === m.type),
      ),
    refusingSettings: false,
    created: [],
    doc(docId) {
      const doc = docs.get(docId) ?? createDoc({ clientId: 1 });
      docs.set(docId, doc);
      return doc;
    },
  };
  const answer = (send: (m: Message) => void, m: Message): void => {
    if (m.type === "HELLO")
      send({
        type: "WELCOME",
        session: { userId: "dana", name: "Dana Reyes" },
        limits: {
          frameBytes: FRAME_LIMIT_BYTES,
          messageBytes: MESSAGE_LIMIT_BYTES,
        },
        server: { current: V1, min: V1 },
      });
    if (m.type === "PING") send({ type: "PONG", nonce: m.nonce });
    if (m.type === "SUBSCRIBE" && m.mode === "edit") {
      const { docId, generation } = m;
      send({
        type: "SUBSCRIBED",
        docId,
        generation: Math.max(generation, 1),
        role: "edit",
        capabilities: [],
        headSeq: head,
        minSchemaVersion: 1,
        engineVersion: 0,
        lockLevel: 0,
        lockAnchors: null,
        revision: null,
        airWindow: null,
      });
      const data = server.doc(docId).encodeStateVector();
      send({ type: "SYNC", docId, generation: 1, step: "step1", data });
    }
    if (m.type === "SYNC" && m.step === "step1") {
      const data = server.doc(m.docId).diff(m.data);
      send({
        type: "SYNC",
        docId: m.docId,
        generation: 1,
        step: "step2",
        data,
      });
    }
    if (m.type === "PUSH") server.doc(m.docId).applyUpdate(m.update);
    if (m.type === "SET" && server.refusingSettings)
      send({
        type: "ERROR",
        code: CODE.SETTING_REFUSED,
        message: "locked",
        retryAfterMs: null,
        permanent: true,
        doc: { docId: m.docId, generation: 1 },
        clientSeq: m.clientSeq,
      });
    else if (m.type === "PUSH" || m.type === "SET") {
      head += 1;
      const ack = { clientSeq: m.clientSeq, serverSeq: head };
      send({ type: "ACK", docId: m.docId, generation: 1, ...ack });
    }
  };
  network.serve({
    connected(end) {
      const decoder = createFrameDecoder({ from: "client" });
      const encoder = createFrameEncoder({ ids: createMessageIds() });
      const send = (message: Message): void => {
        for (const frame of encoder.encode(message)) end.send(frame);
      };
      end.onFrame = (frame) => {
        const result = decoder.push(frame);
        if (result.kind !== "message") return;
        received.push(result.message);
        answer(send, result.message);
      };
    },
    createDocument(_userId, request) {
      server.created.push(request);
      return { ok: true };
    },
  });
  return server;
}

/** One turn: every queued microtask and the callbacks they lead to run. */
export const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/** Turns until `done` holds, as long as loading a module may take; throws after that. */
export async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 5_000; i++) {
    if (done()) return;
    await turn();
  }
  throw new RangeError("it never came about");
}

/** Delivers everything the network holds, and what that causes, until nothing moves. */
export async function settle(network: MemoryNetwork): Promise<void> {
  for (let i = 0; i < 10_000; i++) {
    await turn();
    if (network.step()) continue;
    await turn();
    if (network.queued() === 0) return;
  }
  throw new RangeError("the network never settled");
}

/** A frame is run once the turn ends, as a visible tab draws its next one. */
const FRAMES: Frames = {
  request(fn) {
    let live = true;
    queueMicrotask(() => {
      if (live) fn();
    });
    return () => {
      live = false;
    };
  },
};

export interface SyncWorld {
  fake: FakeClock;
  network: MemoryNetwork;
  server: ScriptedServer;
  space: MemoryStoreSpace;
  storage: MemoryStorage;
  events: EventTarget;
  visible: { now: boolean };
  /** Connects asked of the transport so far. */
  connects(): number;
  ports(): SyncClientPorts;
  /** Dana's sync in a fresh tab of this browser: the same store and storage, the clock where it is. */
  personSync(): Promise<PersonSync>;
}

export function createSyncWorld(): SyncWorld {
  const fake = createFakeClock(START);
  const network = createMemoryNetwork({ random: () => 0 });
  const server = scriptedServer(network);
  const space = createMemoryStoreSpace();
  const storage = new MemoryStorage();
  const events = new EventTarget();
  const visible = { now: true };
  let connects = 0;
  let tabs = 0;
  const ports = (): SyncClientPorts => {
    const transport = network.transport(DANA.userId);
    return {
      transport: {
        connect(handlers) {
          connects += 1;
          return transport.connect(handlers);
        },
        createDocument: (request) => transport.createDocument(request),
        replay: (request) => transport.replay(request),
      },
      store: space.store(DANA.userId),
      leader: soloLeader(`tab-${++tabs}`),
      clock: fake.clock,
      random: fixedRandom(),
      frames: FRAMES,
    };
  };
  return {
    fake,
    network,
    server,
    space,
    storage,
    events,
    visible,
    connects: () => connects,
    ports,
    personSync: () =>
      createPersonSync({
        person: DANA,
        baseUrl: "http://manent.test",
        deviceId: "device-1",
        build: "test",
        versions: V1,
        minServer: V1,
        ports: ports(),
        memory: createDeviceMemory({ local: storage, session: null }),
        onlineEvents: events,
        visible: () => visible.now,
        now: fake.clock.now,
      }),
  };
}

type Value<T> = Subscribable<T> & { set(value: T): void };

/** Synced, nothing waiting, nothing set aside. */
export const SYNCED_STATUS: DocStatus = Object.freeze({
  saved: true,
  synced: true,
  waiting: 0,
  link: "online",
  docSync: "synced",
  wentOfflineAt: null,
  neverSynced: false,
  recovered: 0,
  side: [],
});

export const ONLINE_LINK: LinkFacts = Object.freeze({
  state: "online",
  issue: "none",
  server: null,
  wentOfflineAt: null,
  leader: true,
});

/** A handle whose facts the test sets; `emit` tells its listeners an event and `replaceDoc` gives `doc()` another document. */
export interface FakeHandle extends DocHandle {
  readonly status: Value<DocStatus>;
  readonly readOnly: Value<ViewHandle | null>;
  emit(event: DocEvent): void;
  replaceDoc(doc: CrdtDoc): void;
  closes(): number;
}

export function fakeHandle(docId: string, initial: CrdtDoc): FakeHandle {
  let doc = initial;
  let closes = 0;
  const listeners = new Set<(event: DocEvent) => void>();
  return {
    docId,
    doc: () => doc,
    status: createValue<DocStatus>(SYNCED_STATUS),
    recovered: createValue<readonly RecoveredItem[]>([]),
    settings: createValue<Readonly<Record<string, unknown>>>({}),
    writeSchema: createValue(1),
    readOnly: createValue<ViewHandle | null>(null),
    upstream: createValue(null),
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSetting() {},
    holdRemote() {},
    releaseRemote() {},
    sendAwareness() {},
    onAwareness: () => () => {},
    saveVersion: async () => {},
    nameVersion: () => Promise.reject(new RangeError("not kept by the fake")),
    restoreLocally: () =>
      Promise.reject(new RangeError("not restored by the fake")),
    deviceVersions: async () => [],
    lastServerSeq: () => 0,
    adoptClientIds() {},
    async close() {
      closes += 1;
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    replaceDoc(next) {
      doc = next;
    },
    closes: () => closes,
  };
}

/** A live view of `blocks` as a person of `role` reads it. */
export function fakeView(
  docId: string,
  role: DocRole,
  blocks: readonly BlockJSON[],
): ViewHandle & { blocks: Value<readonly BlockJSON[]> } {
  return {
    docId,
    blocks: createValue(blocks),
    status: createValue({ link: "online" as const, live: true, role }),
    close() {},
  };
}

const refused = (): never => {
  throw new RangeError("the fake client neither creates nor views");
};

/** A client that opens `handles`, and lists `documents` as the store holds them; `opened` is every open asked. */
export function fakeClient(
  handles: (docId: string) => FakeHandle,
  documents: readonly DocSummary[] = [],
): SyncClient & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    link: createValue(ONLINE_LINK),
    async open(docId) {
      opened.push(docId);
      return handles(docId);
    },
    create: async () => refused(),
    documents: async () => documents,
    setOnline() {},
    retryNow() {},
    view: () => refused(),
    close: async () => {},
  };
}

/** A person's sync over `client`, online, with a memory store. */
export function fakeSync(client: SyncClient): PersonSync {
  return {
    userId: DANA.userId,
    client,
    store: createMemoryStore(DANA.userId),
    link: createValue(ONLINE_LINK),
    network: createValue(true),
    offlineSince: createValue<number | null>(null),
    connection: { mode: createValue<ConnectionMode>("online"), set() {} },
    throughConnection: (send) => send(),
    hadDatabase: null,
    memory: createDeviceMemory({ local: null, session: null }),
    dispose: async () => {},
    onControl: () => () => {},
  };
}
