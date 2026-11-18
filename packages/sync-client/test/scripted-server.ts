// A server the test scripts, over the memory network, and the world each sync-client test
// builds around it: a fake clock and frames, a seeded random, a faulty store space.
import { createDoc, loadDoc, scriptBody } from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  encodeMessage,
} from "@manent/sync-protocol";
import type {
  DocumentMessage,
  Message,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import { createSyncClient, soloLeader } from "../src/index.ts";
import type {
  DocEvent,
  DocHandle,
  DocMeta,
  Frames,
  LeaderPort,
  LocalStore,
  Random,
  SyncClient,
  SyncClientOptions,
  Transport,
} from "../src/index.ts";
import {
  createFakeClock,
  createFaultyStoreSpace,
  createMemoryNetwork,
} from "../src/testing/index.ts";
import type {
  FakeClock,
  FaultyStore,
  FaultyStoreSpace,
  MemoryNetwork,
  ServerEnd,
} from "../src/testing/index.ts";

export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const B1 = "block-one-000001";
export const B2 = "block-two-000002";
/** The Yjs client ID of whoever wrote the seed and the server's own changes. */
const SERVER_CLIENT_ID = 1;

export function v(
  protocol: number,
  schema: number,
  engine: number,
  table: number,
): VersionSet {
  return { protocol, schema, engine, table };
}

export function serverVersions(current: VersionSet): ServerVersions {
  return { current, min: v(1, 0, 0, 0) };
}

export function block(id: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "action" },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

/** A script of two empty blocks, B1 and B2, as the server and the seeded device first hold it. */
export function seedState(): Uint8Array {
  const doc = createDoc({ clientId: SERVER_CLIENT_ID });
  scriptBody(doc).write((w) => {
    w.insertBlocks(null, [block(B1, ""), block(B2, "")]);
  });
  return doc.encodeState();
}

export function textOf(doc: CrdtDoc): string {
  return blocksOf(scriptBody(doc).materialize()).map(blockText).join("\n");
}

/** Text typed at the end of the block, as one local change. */
export function typeIn(h: DocHandle, blockId: string, text: string): void {
  scriptBody(h.doc()).write((w) => {
    if (!w.insertText(blockId, Number.MAX_SAFE_INTEGER, text))
      throw new RangeError(`no block ${blockId} to type into`);
  });
}

/** Typing at the end of B1; a script with no B1 gets one. */
export function type(h: DocHandle, text: string): void {
  scriptBody(h.doc()).write((w) => {
    if (!w.insertText(B1, Number.MAX_SAFE_INTEGER, text))
      w.insertBlocks(null, [block(B1, text)]);
  });
}

export function listen(h: DocHandle): DocEvent[] {
  const events: DocEvent[] = [];
  h.on((event) => events.push(event));
  return events;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The document's text after applying these updates, in order, to the seed. */
export function textAfter(updates: readonly Uint8Array[]): string {
  const doc = loadDoc(seedState());
  for (const update of updates) doc.applyUpdate(update);
  return textOf(doc);
}

/** A seeded random (mulberry32), so a run is the same every time. */
function seededRandom(seed: number): Random {
  let state = seed;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    clientId: () => Math.floor(next() * 4_294_967_295) + 1,
    bytes: (length) =>
      Uint8Array.from({ length }, () => Math.floor(next() * 256)),
  };
}

export interface FakeFrames extends Frames {
  /** Runs every frame callback requested so far. */
  fire(): void;
}

export function fakeFrames(): FakeFrames {
  let waiting = new Set<() => void>();
  return {
    request(fn) {
      waiting.add(fn);
      return () => waiting.delete(fn);
    },
    fire() {
      const due = waiting;
      waiting = new Set();
      for (const fn of due) fn();
    },
  };
}

type ServerError = {
  code: number;
  message: string;
  permanent: boolean;
  clientSeq: number | null;
  retryAfterMs?: number | null;
};

/** What a scripted end holds: its codec, and the documents it has been asked for. */
interface ScriptedEnd {
  end: ServerEnd;
  send(message: Message): void;
}

export interface ScriptedServer {
  /** Every message the clients sent of these types, decoded, in the order they arrived. */
  got<T extends Message["type"]>(
    ...types: T[]
  ): Extract<Message, { type: T }>[];
  /**
   * Whether HELLO, an edit SUBSCRIBE and the client's step 1, a view SUBSCRIBE
   * (with SUBSCRIBED and the snapshot), and PING are answered by themselves.
   */
  readonly answer: {
    hello: boolean;
    subscribe: boolean;
    view: boolean;
    ping: boolean;
  };
  versions: ServerVersions;
  /** SUBSCRIBED.headSeq. */
  head: number;
  /** Connections served, and documents created through the route. */
  ends(): number;
  created: { userId: string; docId: string; kind: string; home: string }[];
  /** The server's copy: the seed for DOC, empty for any other. */
  doc(docId: string): CrdtDoc;
  /** Changes the server's copy and returns the update; sends nothing. */
  change(docId: string, fn: (doc: CrdtDoc) => void): Uint8Array;
  write(docId: string, fn: (w: BlockWriter) => void): Uint8Array;
  syncUpdate(docId: string, update: Uint8Array): void;
  ack(docId: string, clientSeq: number, serverSeq: number): void;
  error(docId: string, error: ServerError): void;
  send(message: Message): void;
  sendFrame(frame: Uint8Array): void;
  /** Answers the last SUBSCRIBE as a server holding `state` alone. */
  subscribedWithState(docId: string, state: Uint8Array): void;
  /** SUBSCRIBED, then VIEW_SNAPSHOT of the server's copy, as a reader is answered. */
  snapshot(docId: string): void;
  viewPatch(docId: string, patch: unknown): void;
  /** From now on nothing is answered. */
  silence(): void;
}

function subscribed(docId: string, head: number): DocumentMessage {
  return {
    type: "SUBSCRIBED",
    docId,
    generation: 1,
    role: "edit",
    capabilities: [],
    headSeq: head,
    minSchemaVersion: 1,
    engineVersion: 0,
    lockLevel: 0,
    lockAnchors: null,
    revision: null,
    airWindow: null,
  };
}

function scriptedServer(network: MemoryNetwork): ScriptedServer {
  const received: Message[] = [];
  const docs = new Map<string, CrdtDoc>();
  const ends: ScriptedEnd[] = [];
  let last: ScriptedEnd | null = null;
  const sync = (
    docId: string,
    step: "step1" | "step2" | "update",
    data: Uint8Array,
  ) => last?.send({ type: "SYNC", docId, generation: 1, step, data });

  const server: ScriptedServer = {
    got: <T extends Message["type"]>(...types: T[]) =>
      received.filter((m): m is Extract<Message, { type: T }> =>
        types.some((t) => t === m.type),
      ),
    answer: { hello: true, subscribe: true, view: true, ping: true },
    versions: serverVersions(v(1, 1, 0, 0)),
    head: 1,
    ends: () => ends.length,
    created: [],
    doc(docId) {
      let doc = docs.get(docId);
      if (doc === undefined) {
        doc = docId === DOC ? loadDoc(seedState()) : createDoc();
        docs.set(docId, doc);
      }
      return doc;
    },
    change(docId, fn) {
      const doc = server.doc(docId);
      const updates: Uint8Array[] = [];
      const stop = doc.subscribe((update) => updates.push(update));
      fn(doc);
      stop();
      return updates[0] ?? new Uint8Array();
    },
    write: (docId, fn) =>
      server.change(docId, (doc) => scriptBody(doc).write(fn)),
    syncUpdate(docId, update) {
      server.doc(docId).applyUpdate(update);
      sync(docId, "update", update);
    },
    ack: (docId, clientSeq, serverSeq) =>
      server.send({ type: "ACK", docId, generation: 1, clientSeq, serverSeq }),
    error: (docId, e) =>
      server.send({
        type: "ERROR",
        code: e.code,
        message: e.message,
        retryAfterMs: e.retryAfterMs ?? null,
        permanent: e.permanent,
        doc: { docId, generation: 1 },
        clientSeq: e.clientSeq,
      }),
    send: (message) => last?.send(message),
    sendFrame: (frame) => last?.end.send(frame),
    subscribedWithState(docId, state) {
      docs.set(docId, loadDoc(state));
      server.send(subscribed(docId, server.head));
      sync(docId, "step1", server.doc(docId).encodeStateVector());
      sync(docId, "step2", state);
    },
    snapshot(docId) {
      server.send(subscribed(docId, server.head));
      const sections =
        scriptBody(server.doc(docId)).materialize().content ?? [];
      const blocks = sections.flatMap((section) => section.content ?? []);
      server.send({
        type: "VIEW_SNAPSHOT",
        docId,
        generation: 1,
        viewSeq: server.head,
        content: utf8(JSON.stringify({ v: 1, blocks })),
      });
    },
    viewPatch: (docId, patch) =>
      server.send({
        type: "VIEW_PATCH",
        docId,
        generation: 1,
        viewSeq: server.head,
        patch: utf8(JSON.stringify(patch)),
      }),
    silence() {
      server.answer.hello = false;
      server.answer.subscribe = false;
      server.answer.ping = false;
    },
  };

  const answer = (at: ScriptedEnd, m: Message): void => {
    if (m.type === "HELLO" && server.answer.hello)
      at.send({
        type: "WELCOME",
        session: { userId: at.end.userId, name: at.end.userId },
        limits: {
          frameBytes: FRAME_LIMIT_BYTES,
          messageBytes: MESSAGE_LIMIT_BYTES,
        },
        server: server.versions,
      });
    if (m.type === "PING" && server.answer.ping)
      at.send({ type: "PONG", nonce: m.nonce });
    if (m.type === "SUBSCRIBE" && m.mode === "view") {
      if (server.answer.view) server.snapshot(m.docId);
      return;
    }
    if (!server.answer.subscribe) return;
    if (m.type === "SUBSCRIBE") {
      at.send(subscribed(m.docId, server.head));
      sync(m.docId, "step1", server.doc(m.docId).encodeStateVector());
    }
    if (m.type === "SYNC" && m.step === "step1")
      sync(m.docId, "step2", server.doc(m.docId).diff(m.data));
  };

  network.serve({
    connected(end) {
      const decoder = createFrameDecoder({ from: "client" });
      const encoder = createFrameEncoder({ ids: createMessageIds() });
      const at: ScriptedEnd = {
        end,
        send: (message) => {
          for (const frame of encoder.encode(message)) end.send(frame);
        },
      };
      ends.push(at);
      end.onFrame = (frame) => {
        const result = decoder.push(frame);
        if (result.kind !== "message") return;
        received.push(result.message);
        if (result.message.type === "SUBSCRIBE") last = at;
        answer(at, result.message);
      };
    },
    createDocument(userId, request) {
      server.created.push({ userId, ...request });
      return { ok: true };
    },
  });
  return server;
}

/** SUBSCRIBED for DOC whose role is a member this build does not know. */
export function subscribedWithUnknownRole(): Uint8Array {
  const frame = encodeMessage(subscribed(DOC, 1));
  // type · flags · 16 bytes of docId · generation 1, then the role's index
  frame[19] = 9;
  return frame;
}

export interface World {
  fake: FakeClock;
  frames: FakeFrames;
  network: MemoryNetwork;
  server: ScriptedServer;
  space: FaultyStoreSpace;
  /** Dana's store, holding DOC as synced: the seed, at server sequence 1. */
  store: FaultyStore;
  makeClient(overrides?: {
    userId?: string;
    store?: LocalStore;
    transport?: Transport;
    leader?: LeaderPort;
    frames?: Frames;
    versions?: VersionSet;
    minServer?: VersionSet;
    uploadVersion?: SyncClientOptions["uploadVersion"];
  }): SyncClient;
  /** One turn: every queued microtask runs. */
  turn(): Promise<void>;
  /** Delivers everything the network holds, and what that causes, until nothing moves. */
  settle(): Promise<void>;
  /** Everything settles, the server answering WELCOME with `versions` when given. */
  online(versions?: ServerVersions): Promise<void>;
  connects(): number;
  closes(): number;
  /** Connections the server saw, and documents it was asked to create. */
  serverContacts(): number;
}

export function seededMeta(docId: string): DocMeta {
  return {
    docId,
    generation: 1,
    lastServerSeq: 1,
    clientIds: [],
    ackedClocks: {},
    neverSynced: false,
    create: null,
    parked: null,
    recovering: null,
    lastDeviceVersionAt: 0,
    lastSyncedAt: null,
  };
}

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

export async function setup(): Promise<World> {
  const fake = createFakeClock();
  const frames = fakeFrames();
  const random = seededRandom(7);
  const network = createMemoryNetwork({ random: random.next });
  const server = scriptedServer(network);
  const space = createFaultyStoreSpace();
  const store = space.store("dana");
  await store.create(seededMeta(DOC));
  await store.checkpoint(DOC, seedState(), 0, true);
  const count = { connects: 0, closes: 0 };
  const counted = (transport: Transport): Transport => ({
    connect(handlers) {
      count.connects += 1;
      return transport.connect(handlers).then((connection) => ({
        send: (frame) => connection.send(frame),
        close(code, reason) {
          count.closes += 1;
          connection.close(code, reason);
        },
      }));
    },
    createDocument: (request) => transport.createDocument(request),
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 100_000; i++) {
      await turn();
      if (network.step()) continue;
      await turn();
      if (network.queued() === 0) return;
    }
    throw new RangeError("the network never settled");
  };
  return {
    fake,
    frames,
    network,
    server,
    space,
    store,
    makeClient: (o = {}) =>
      createSyncClient({
        userId: o.userId ?? "dana",
        deviceId: "device-1",
        build: "test",
        versions: o.versions ?? v(1, 1, 0, 0),
        minServer: o.minServer ?? v(1, 0, 0, 0),
        ...(o.uploadVersion === undefined
          ? {}
          : { uploadVersion: o.uploadVersion }),
        ports: {
          transport: counted(
            o.transport ?? network.transport(o.userId ?? "dana"),
          ),
          store: o.store ?? space.store(o.userId ?? "dana"),
          leader: o.leader ?? soloLeader(o.userId ?? "dana"),
          clock: fake.clock,
          random,
          frames: o.frames ?? frames,
        },
      }),
    turn,
    settle,
    async online(versions) {
      if (versions !== undefined) server.versions = versions;
      await settle();
    },
    connects: () => count.connects,
    closes: () => count.closes,
    serverContacts: () => server.ends() + server.created.length,
  };
}
