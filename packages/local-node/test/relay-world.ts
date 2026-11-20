// One desktop and its cloud, in memory and moved only by the test: windows syncing with the node,
// the node's relay syncing each person's upstream client with the cloud, and people typing at the
// cloud in a browser, over two memory networks, with faults on request.
import {
  ORIGIN_LOAD,
  createDoc,
  scriptBody,
  scriptSettings,
  updateMeta,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import {
  DEFAULT_LIMITS,
  PRODUCT_SETTING_RULES,
  createServer,
  createSignedSessionStore,
  createSyncService,
  createTicketStore,
  peerOf,
} from "@manent/server-core";
import type {
  Clock as ServiceClock,
  Connection,
  ConnectionData,
  ManentServer,
  Peer,
  SyncService,
} from "@manent/server-core";
import {
  createFakeDirectory,
  createFakeSignIn,
} from "@manent/server-core/testing";
import type { Storage, UpdateRow } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  ConnectError,
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type {
  DocEvent,
  DocHandle,
  DocStatus,
  LocalStore,
  Random,
  SyncClient,
  Transport,
  UpstreamStatus,
} from "@manent/sync-client";
import { encodeUpstreamStatus } from "@manent/sync-client";
import {
  createFakeClock,
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import type {
  FakeClock,
  MemoryNetwork,
  ServerEnd,
} from "@manent/sync-client/testing";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type { ControlKind, Message } from "@manent/sync-protocol";
import {
  createHandover,
  createMirror,
  createRelayBridge,
} from "../src/index.ts";
import type { CloudApi, Handover, Mirror, RelayBridge } from "../src/index.ts";
import { createNodeCore } from "../src/index.ts";
import type { NodeCore } from "../src/index.ts";
import { createFakeCloud, createMemoryRecords } from "../src/testing/index.ts";

export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const DOC2 = "0193b1f4-2c1e-7a00-8000-00000000000b";
export const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
export const HOME = `project:${PROJECT}`;
const START_AT = 1_767_225_600_000;
const V1 = Object.freeze({ protocol: 1, schema: 1, engine: 0, table: 0 });
const VERSIONS = Object.freeze({ current: V1, min: V1 });
const MIN_SERVER = Object.freeze({ ...V1, schema: 0 });
const NAMES: Readonly<Record<string, string>> = Object.freeze({
  sam: "Sam Okafor",
  dana: "Dana Reyes",
  leo: "Leo Marsh",
  you: "You",
});
const MAX_STEPS = 20_000;
const IDLE_MS = 1_000;
/** Idle rounds in a row that count as settled: long enough for a rebuild's quiet moment. */
const CALM_ROUNDS = 14;
const NO_FRAMES = { request: () => () => {} };
const SLOW_ADOPT_MS = 3_000;
/** The longest a settle of the core's world runs. */
const SETTLE_SPAN_MS = 120_000;
// peerOf never reads a connection's data, and only server-core can make a real one
const NO_DATA = {} as ConnectionData;
const STORE_WRITES = new Set([
  "create",
  "append",
  "acknowledge",
  "refuse",
  "markApplied",
  "checkpoint",
  "patchMeta",
  "reset",
  "addVersion",
  "markUploaded",
  "dismissRecovered",
]);

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/** A small seeded generator, so a run is the same every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomOf(next: () => number): Random {
  return {
    next,
    clientId: () => Math.floor(next() * 4_294_967_295) + 1,
    bytes: (length) =>
      Uint8Array.from({ length }, () => Math.floor(next() * 256)),
  };
}

/** The lines of a document's script, each block's text. */
export const linesOf = (doc: CrdtDoc): string[] =>
  blocksOf(scriptBody(doc).materialize()).map(blockText);

/** Appends `text` to the last block, or writes the first block. */
export function typeInto(doc: CrdtDoc, text: string): void {
  scriptBody(doc).write((w) => {
    const last = blocksOf(scriptBody(doc).materialize()).at(-1);
    const id = last?.attrs.id;
    if (last === undefined || id == null) {
      const block = `b${Math.floor(doc.clientId).toString(16).padStart(15, "0")}`;
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: block.slice(0, 16), type: "action" },
          content: [{ type: "text", text }],
        },
      ]);
      return;
    }
    w.insertText(id, blockText(last).length, text);
  });
}

interface Hooks {
  /** True: the message is answered here and the service never hears it. */
  heard?(peer: Peer, message: Message): boolean;
  peer?(peer: Peer): Peer;
  closed?(peer: Peer): void;
}

/**
 * One memory-network end served as the socket serves a connection: HELLO, WELCOME, then the
 * service. `active` hears every message either way but the heartbeat's.
 */
function serveEnd(
  service: SyncService,
  end: ServerEnd,
  hooks: Hooks,
  active: () => void,
): void {
  const decoder = createFrameDecoder({ from: "client" });
  let peer: Peer | null = null;
  const connection: Connection = {
    data: NO_DATA,
    bufferedBytes: 0,
    send(frame) {
      end.send(frame);
      return "sent";
    },
    close: (code, reason) => end.close(code, reason),
  };
  end.onClose = () => {
    if (peer === null) return;
    hooks.closed?.(peer);
    service.detach(peer);
  };
  end.onFrame = (frame) => {
    const read = decoder.push(frame);
    if (read.kind !== "message") return;
    const { message } = read;
    if (peer === null) {
      if (message.type !== "HELLO") return end.close(CODE.BAD_FRAME, "hello");
      const identity = { userId: end.userId, name: NAMES[end.userId] ?? "" };
      const session = {
        identity,
        deviceId: message.deviceId,
        versions: message.versions,
        address: "127.0.0.1",
      };
      const made = peerOf(
        connection,
        session,
        createMessageIds(),
        DEFAULT_LIMITS,
      );
      const counted: Peer = {
        ...made,
        send(sent) {
          if (!("type" in sent && sent.type === "PONG")) active();
          made.send(sent);
        },
        close: (code, reason) => made.close(code, reason),
      };
      peer = hooks.peer?.(counted) ?? counted;
      const limits = {
        frameBytes: FRAME_LIMIT_BYTES,
        messageBytes: MESSAGE_LIMIT_BYTES,
      };
      peer.send({
        type: "WELCOME",
        session: identity,
        limits,
        server: VERSIONS,
      });
      service.attach(peer);
      return;
    }
    if (message.type === "PING")
      return peer.send({ type: "PONG", nonce: message.nonce });
    active();
    if (hooks.heard?.(peer, message) === true) return;
    service.receive(peer, message);
  };
}

/** The deferred work of one process, run when the world says. */
class Deferred {
  readonly queue: (() => void)[] = [];
  held = false;
  readonly defer = (fn: () => void): void => {
    this.queue.push(fn);
  };
  run(): boolean {
    if (this.held || this.queue.length === 0) return false;
    for (let fn = this.queue.shift(); fn !== undefined; fn = this.queue.shift())
      fn();
    return true;
  }
}

/** The cloud: a real server over memory storage, its socket ends served from a memory network. */
class Cloud {
  server!: ManentServer;
  service!: SyncService;
  api!: ReturnType<typeof createFakeCloud>;
  down = false;
  readonly deferred = new Deferred();
  readonly peers = new Set<Peer>();
  readonly refusals: Message[] = [];
  readonly sets: Extract<Message, { type: "SET" }>[] = [];
  /** By user: the client IDs of every push from the node's upstream clients. */
  readonly pushedIds = new Map<string, Set<number>>();
  readonly refusing = new Set<string>();
  /** What the cloud's /api/demo names as its seed. */
  seedId = "seed-1";
  private versionIds = 0;

  constructor(
    readonly storage: MemoryStorage,
    readonly clock: FakeClock,
  ) {
    this.start();
  }

  start(): void {
    this.server = createServer({
      http: {
        allowedHosts: ["127.0.0.1"],
        openUrl: "http://127.0.0.1",
        webDir: null,
      },
      auth: {
        signIn: createFakeSignIn(
          ["sam", "dana", "leo", "you"].map((userId) => ({
            userId,
            name: NAMES[userId] ?? "",
          })),
        ),
        directory: createFakeDirectory(
          Object.entries(NAMES).map(([userId, name]) => ({
            user: { userId, name },
            workspaces: [],
          })),
        ),
        sessions: createSignedSessionStore({
          secret: new Uint8Array(32).fill(7),
          now: this.clock.clock.now,
        }),
      },
      demo: { seedId: () => this.seedId, control: null },
      socket: {
        tickets: createTicketStore({ now: this.clock.clock.now }),
        versions: VERSIONS,
        allowedOrigins: ["http://127.0.0.1"],
      },
      sync: {
        storage: this.storage,
        clock: this.clock.clock,
        defer: this.deferred.defer,
        ids: () => `cloud-version-${++this.versionIds}`,
        registry: PRODUCT_SETTING_RULES,
      },
    });
    const { sync } = this.server;
    if (sync === null) throw new TypeError("the cloud serves no documents");
    this.service = sync;
    this.api = createFakeCloud({ server: this.server });
    this.api.down(this.down);
  }

  /** The process restarts over the same storage: every connection drops. */
  restart(): void {
    for (const peer of this.peers) peer.close(1006, "");
    this.peers.clear();
    this.deferred.queue.length = 0;
    this.start();
  }

  hooks(): Hooks {
    return {
      peer: (made) => {
        const recorded: Peer = {
          ...made,
          send: (message) => {
            if ("type" in message && message.type === "ERROR")
              this.refusals.push(message);
            made.send(message);
          },
          close: (code, reason) => made.close(code, reason),
        };
        this.peers.add(recorded);
        return recorded;
      },
      closed: (peer) => this.peers.delete(peer),
      heard: (peer, message) => {
        const fromNode = peer.deviceId.startsWith("node-");
        if (message.type === "SET") this.sets.push(message);
        if (message.type !== "PUSH" || !fromNode) return false;
        const ids = this.pushedIds.get(peer.userId) ?? new Set<number>();
        for (const { clientId } of updateMeta(message.update))
          ids.add(clientId);
        this.pushedIds.set(peer.userId, ids);
        if (!this.refusing.delete(message.docId)) return false;
        peer.send({
          type: "ERROR",
          code: CODE.VALIDATION_FAILED,
          message: "invalid",
          retryAfterMs: null,
          permanent: true,
          doc: { docId: message.docId, generation: message.generation },
          clientSeq: message.clientSeq,
        });
        return true;
      },
    };
  }
}

/** One node process: its sync service, its relay and its upstream clients, until it dies. */
class NodeLife {
  alive = true;
  readonly deferred = new Deferred();
  readonly service: SyncService;
  readonly bridge: RelayBridge;
  readonly mirror: Mirror;
  readonly handover: Handover;
  readonly peers = new Set<Peer>();
  readonly lastSet = new Map<string, { peer: Peer; message: Message }>();
  device: "ok" | "failing" = "ok";
  /** The connections of this life's upstream clients, closed when it dies. */
  private readonly upstreamLinks = new Set<{
    close(code: number, reason: string): void;
  }>();
  readonly clock: ServiceClock;

  constructor(private readonly host: RelayWorld) {
    const { clock } = host;
    this.clock = {
      now: clock.clock.now,
      schedule: (fn, delayMs) =>
        clock.clock.schedule(() => {
          if (this.alive) fn();
        }, delayMs),
    };
    const { nodeStorage: storage, records } = host;
    const upstream = {
      create: (userId: string, token: () => string | null) =>
        this.upstreamClient(userId, token),
      store: (userId: string) => this.storeOf(userId),
    };
    this.bridge = createRelayBridge({
      storage,
      records,
      upstream,
      clock: this.clock,
      defer: this.deferred.defer,
      deviceStorage: () => this.device,
      ownerOf: (docId, clientId) => ownerIn(storage, docId, clientId),
      handoffRefused: (docId) => records.handoff(docId)?.refused ?? null,
      onRefused: (docId, userId, data) =>
        this.control(docId, "upstream_refused", data, userId),
    });
    let versionIds = 0;
    this.service = createSyncService({
      storage,
      clock: this.clock,
      defer: this.deferred.defer,
      ids: () => `node-version-${++versionIds}`,
      versions: VERSIONS,
      mode: (docId) =>
        records.docState(docId) === null ? "authority" : "relay",
      fullDisk: "hold",
      onDeviceStorage: (state) => {
        this.device = state;
      },
      upstream: this.bridge,
      registry: PRODUCT_SETTING_RULES,
    });
    this.bridge.attach(this.service);
    const tokenOf = (userId: string): string | null =>
      records.person(userId)?.cloudToken ?? null;
    this.mirror = createMirror({ storage, records, cloud: host.api, tokenOf });
    this.handover = createHandover({
      storage,
      records,
      cloud: host.api,
      relay: this.bridge,
      upstream,
      service: this.service,
      tokenOf,
      clock: this.clock,
      random: randomOf(seeded(host.lives * 31)),
      snapshot: (docId) => host.snapshotOf(docId),
    });
    this.bridge.onStatus((docId, status) => {
      host.statuses.push({ docId, status });
      this.control(
        docId,
        "upstream_status",
        encodeUpstreamStatus(status),
        null,
      );
    });
  }

  /** A CONTROL frame to the windows of `userId`, or of everyone when null. */
  control(
    docId: string,
    kind: ControlKind,
    data: Uint8Array,
    userId: string | null,
  ): void {
    const generation = this.host.nodeGeneration(docId);
    for (const peer of this.peers)
      if (userId === null || peer.userId === userId) {
        this.host.controls.push({ userId: peer.userId, kind, data });
        peer.send({ type: "CONTROL", docId, generation, seq: 0, kind, data });
      }
  }

  hooks(): Hooks {
    return {
      peer: (made) => {
        this.peers.add(made);
        return made;
      },
      closed: (peer) => this.peers.delete(peer),
      heard: (peer, message) => {
        if (message.type === "SET")
          this.lastSet.set(peer.userId, { peer, message });
        return false;
      },
    };
  }

  die(): void {
    this.alive = false;
    this.deferred.queue.length = 0;
    for (const link of this.upstreamLinks) link.close(1006, "");
    for (const peer of this.peers) peer.close(1006, "");
  }

  private upstreamClient(
    userId: string,
    token: () => string | null,
  ): SyncClient {
    const deviceId = `node-${userId}`;
    return createSyncClient({
      userId,
      deviceId,
      build: "test",
      versions: V1,
      minServer: MIN_SERVER,
      ports: {
        transport: this.gated(this.host.cloudNet.transport(userId), token),
        store: this.storeOf(userId),
        leader: soloLeader(deviceId),
        clock: this.clock,
        random: randomOf(seeded(userId.length * 7919 + this.host.lives)),
        frames: NO_FRAMES,
      },
    });
  }

  /** The person's store; a dead process writes nothing, and while the world holds appends none settles. */
  private storeOf(userId: string): LocalStore {
    const inner = this.host.upstreamStores.store(userId);
    const blocked = (method: string): boolean =>
      STORE_WRITES.has(method) &&
      (!this.alive || (method === "append" && this.host.holdingAppends));
    return new Proxy(inner, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) =>
          blocked(String(key))
            ? new Promise(() => {})
            : Reflect.apply(value, target, args);
      },
    });
  }

  /** The cloud's network as this life reaches it: without a token nothing is asked, and a dead life hears nothing. */
  private gated(inner: Transport, token: () => string | null): Transport {
    const check = (): void => {
      if (!this.alive) throw new ConnectError("unreachable");
      if (token() === null) throw new ConnectError("sign_in");
    };
    return {
      connect: async (handlers) => {
        check();
        const connection = await inner.connect({
          onFrame: (frame) => {
            if (this.alive) handlers.onFrame(frame);
          },
          onClose: (code, reason) => {
            if (this.alive) handlers.onClose(code, reason);
          },
        });
        this.upstreamLinks.add(connection);
        return {
          send: (frame) => {
            if (this.alive) connection.send(frame);
          },
          close: (code, reason) => connection.close(code, reason),
        };
      },
      createDocument: async (request) => {
        check();
        return inner.createDocument(request);
      },
      replay: async (request) => {
        check();
        return inner.replay(request);
      },
    };
  }
}

function ownerIn(
  storage: Storage,
  docId: string,
  clientId: number,
): string | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  return (
    storage.open(place.home).log.ledger(docId).get(clientId)?.userId ?? null
  );
}

/** A person's client: a window of the desktop, or a browser at the cloud. */
interface Person {
  client: SyncClient;
  handles: Map<string, DocHandle>;
  events: Map<string, DocEvent[]>;
}

function rowsOf(storage: Storage, docId: string): UpdateRow[] {
  const place = storage.directory.placeOf(docId);
  if (place === null) return [];
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  return row === null ? [] : file.log.tail(docId, row.generation, 0).rows;
}

/** The document's current generation as its log holds it; null for one not placed. The caller destroys it. */
function nodeDocOf(storage: Storage, docId: string): CrdtDoc | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const doc = createDoc();
  for (const { update } of file.log.tail(docId, row.generation, 0).rows)
    doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

function textIn(storage: Storage, docId: string): string[] {
  const doc = nodeDocOf(storage, docId);
  if (doc === null) return [];
  const lines = linesOf(doc);
  doc.destroy();
  return lines;
}

export class RelayWorld {
  readonly clock = createFakeClock(START_AT);
  readonly random = seeded(17);
  readonly cloudNet: MemoryNetwork = createMemoryNetwork({
    random: this.random,
  });
  readonly nodeNet: MemoryNetwork = createMemoryNetwork({
    random: this.random,
  });
  readonly cloudStorage = createMemoryStorage({ now: this.clock.clock.now });
  readonly nodeStorage = createMemoryStorage({ now: this.clock.clock.now });
  records: ReturnType<typeof createMemoryRecords>;
  readonly upstreamStores = createMemoryStoreSpace();
  readonly cloud = new Cloud(this.cloudStorage, this.clock);
  readonly statuses: { docId: string; status: UpstreamStatus }[] = [];
  readonly controls: { userId: string; kind: ControlKind; data: Uint8Array }[] =
    [];
  holdingAppends = false;
  lives = 0;
  /** Counts every message and deferred run but the heartbeat's: a settle waits for it to stand still. */
  private activity = 0;
  private readonly active = (): void => {
    this.activity += 1;
  };
  life: NodeLife;
  readonly api: CloudApi;
  /** By document: the workspace its window's POST /api/docs named. */
  readonly workspaces = new Map<string, string>();
  adoptCalls = 0;
  /** A crash in the node's work, which takes the node down as a killed process does. */
  private failure: unknown = null;
  private readonly windows = new Map<string, Person>();
  private readonly browsers = new Map<string, Person>();
  private snapshot: unknown = null;
  /** The person whose window a check reads unless told otherwise. */
  private lastOpened = "sam";
  /** Called after every step of the world. */
  readonly watchers = new Set<() => void>();

  constructor(readonly options: WorldOptions = {}) {
    this.records = createMemoryRecords(
      options.crashOn === undefined ? {} : { crashOn: options.crashOn },
    );
    let drop = options.drop ?? null;
    this.api = {
      signIn: (userId) => this.cloud.api.signIn(userId),
      demo: () => this.cloud.api.demo(),
      describe: (token, request) => this.cloud.api.describe(token, request),
      adopt: async (token, request) => {
        this.adoptCalls += 1;
        if (options.slowAdopt === true)
          await new Promise((resolve) =>
            this.clock.clock.schedule(() => resolve(null), SLOW_ADOPT_MS),
          );
        if (drop !== null) this.cloud.api.drop(drop);
        drop = null;
        const answer = await this.cloud.api.adopt(token, request);
        if (options.downAfterAdopt === true) this.cloudDown(true);
        return answer;
      },
    };
    this.life = this.startLife();
    this.cloudNet.serve({
      connected: (end) =>
        serveEnd(this.cloud.service, end, this.cloud.hooks(), this.active),
      createDocument: (userId, request) => {
        const made = this.cloud.service.access.create(userId, request);
        if (made.ok) return { ok: true };
        return {
          ok: false,
          code: made.code === "deleted" ? "deleted" : "forbidden",
        };
      },
      replay: (userId, request) =>
        this.cloud.service.replay(userId, JSON.parse(JSON.stringify(request))),
    });
    this.nodeNet.serve({
      connected: (end) => {
        if (!this.life.alive) return end.close(1006, "");
        serveEnd(this.life.service, end, this.life.hooks(), this.active);
      },
      createDocument: (userId, request) => {
        const made = this.life.service.access.create(userId, request);
        if (made.ok) return { ok: true };
        return {
          ok: false,
          code: made.code === "deleted" ? "deleted" : "forbidden",
        };
      },
      replay: (userId, request) =>
        this.life.service.replay(userId, JSON.parse(JSON.stringify(request))),
    });
    if (options.madeOnDevice !== true)
      this.cloudMakes(DOC, "dana", ["sam", "leo"]);
  }

  get bridge(): RelayBridge {
    return this.life.bridge;
  }

  get mirror(): Mirror {
    return this.life.mirror;
  }

  /** What a hand-off of the document starts from: the room's state now and where it lives. */
  snapshotOf(docId: string): {
    state: Uint8Array;
    kind: string;
    home: string;
    workspaceId: string | null;
  } {
    const place = this.nodeStorage.directory.placeOf(docId);
    const doc = nodeDocOf(this.nodeStorage, docId);
    if (place === null || doc === null)
      throw new RangeError(`the node holds no ${docId}`);
    const state = doc.encodeState();
    doc.destroy();
    const home = `${place.home.kind}:${place.home.id}`;
    const workspaceId = this.workspaces.get(docId) ?? null;
    return { state, kind: place.kind, home, workspaceId };
  }

  /** The person signs in to sync: the node gets a cloud session for them and hands their scripts over. */
  async signInToSync(userId: string): Promise<void> {
    await this.signedIn(userId);
    this.handOver(userId);
  }

  /** The node hands the person's scripts over, as when their session appears or the cloud comes back. */
  handOver(userId: string): void {
    const life = this.life;
    life.handover.run(userId).catch((error: unknown) => {
      if (life !== this.life) return;
      if (error instanceof Error && error.message.startsWith("crashed in "))
        return this.crashNode();
      this.failure = error;
    });
  }

  cloudHas(docId: string): boolean {
    return this.cloudStorage.directory.placeOf(docId) !== null;
  }

  /** How many times the cloud took the document's whole state in. */
  cloudAdoptions(docId: string): number {
    return this.cloudLog(docId).filter((row) => row.origin === "import").length;
  }

  /** The person's window writes a line of its own, making the script on the node when it has none. */
  async windowWritesLine(
    userId: string,
    docId: string,
    text: string,
  ): Promise<void> {
    const handle =
      this.windows.get(userId)?.handles.get(docId) ??
      (await this.openWindow(userId, docId, {
        kind: "script",
        home: HOME,
        workspaceId: null,
      }));
    const doc = handle.doc();
    scriptBody(doc).write((w) => {
      const last =
        blocksOf(scriptBody(doc).materialize()).at(-1)?.attrs.id ?? null;
      const id = `line${doc.clientId.toString(16)}${blocksOf(scriptBody(doc).materialize()).length}`;
      w.insertBlocks(last, [
        {
          type: "block",
          attrs: { id, type: "action" },
          content: [{ type: "text", text }],
        },
      ]);
    });
  }

  private startLife(): NodeLife {
    this.lives += 1;
    return new NodeLife(this);
  }

  /** `owner` makes the script at the cloud and gives each of `editors` the edit role. */
  cloudMakes(docId: string, owner: string, editors: readonly string[]): void {
    const made = this.cloud.service.access.create(owner, {
      docId,
      kind: "script",
      home: HOME,
    });
    if (!made.ok)
      throw new Error(`the cloud did not make ${docId}: ${made.code}`);
    for (const userId of editors)
      this.cloudStorage.directory.setRole(docId, userId, "edit", []);
  }

  /** The person is on the desktop with a cloud session, as after choosing them and syncing. */
  async signedIn(userId: string): Promise<void> {
    const session = await this.cloud.api.signIn(userId);
    if (!session.ok) throw new Error(`the cloud does not know ${userId}`);
    this.records.savePerson({
      userId,
      name: NAMES[userId] ?? userId,
      wantsCloud: true,
      cloudToken: session.token,
      chosenAt: this.clock.clock.now(),
    });
  }

  /** The person's window opens the document through the node, which mirrors it from the cloud and opens their upstream. */
  async open(userId: string, docId: string): Promise<void> {
    if (this.records.person(userId)?.cloudToken == null)
      await this.signedIn(userId);
    const mirrored = await this.mirror.ensure(userId, docId);
    if (!mirrored.ok)
      throw new Error(`${docId} was not mirrored: ${mirrored.code}`);
    await this.drive(this.bridge.open(userId, docId));
    await this.openWindow(userId, docId);
  }

  async openWindow(
    userId: string,
    docId: string,
    create?: { kind: string; home: string; workspaceId: string | null },
  ): Promise<DocHandle> {
    this.lastOpened = userId;
    const person = this.personIn(this.windows, userId, "window");
    const known = person.handles.get(docId);
    if (known !== undefined) return known;
    const opening =
      create === undefined
        ? person.client.open(docId)
        : person.client.open(docId, { create });
    const handle = await this.drive(opening);
    this.watch(person, docId, handle);
    await this.settle();
    this.life.control(
      docId,
      "upstream_status",
      encodeUpstreamStatus(this.bridge.status(docId)),
      userId,
    );
    await this.settle();
    return handle;
  }

  private watch(person: Person, docId: string, handle: DocHandle): void {
    person.handles.set(docId, handle);
    const events: DocEvent[] = [];
    person.events.set(docId, events);
    handle.on((event) => events.push(event));
  }

  private personIn(
    map: Map<string, Person>,
    userId: string,
    side: "window" | "browser",
  ): Person {
    const known = map.get(userId);
    if (known !== undefined) return known;
    const deviceId = `${side}-${userId}`;
    const network = side === "window" ? this.nodeNet : this.cloudNet;
    const client = createSyncClient({
      userId,
      deviceId,
      build: "test",
      versions: V1,
      minServer: MIN_SERVER,
      via: side === "window" ? "local_node" : "server",
      ports: {
        transport: network.transport(userId),
        store: createMemoryStore(userId),
        leader: soloLeader(deviceId),
        clock: this.clock.clock,
        random: randomOf(seeded(deviceId.length * 104_729 + map.size)),
        frames: NO_FRAMES,
      },
    });
    const person = { client, handles: new Map(), events: new Map() };
    map.set(userId, person);
    return person;
  }

  private windowHandle(
    docId: string,
    userId: string = this.lastOpened,
  ): DocHandle {
    const handle = this.windows.get(userId)?.handles.get(docId);
    if (handle === undefined)
      throw new Error(`${userId} has no window on ${docId}`);
    return handle;
  }

  windowTypes(userId: string, docId: string, text: string): void {
    typeInto(this.windowHandle(docId, userId).doc(), text);
  }

  windowSets(userId: string, docId: string, key: string, value: unknown): void {
    this.windowHandle(docId, userId).setSetting(key, value);
  }

  windowText(docId: string, userId?: string): string[] {
    return linesOf(this.windowHandle(docId, userId).doc());
  }

  windowStatus(docId: string, userId?: string): DocStatus {
    return this.windowHandle(docId, userId).status.get();
  }

  windowEvents(docId: string, userId: string = this.lastOpened): DocEvent[] {
    return this.windows.get(userId)?.events.get(docId) ?? [];
  }

  /** The person types at the cloud, in a browser. */
  async cloudTypes(userId: string, docId: string, text: string): Promise<void> {
    typeInto((await this.browserHandle(userId, docId)).doc(), text);
  }

  async browserHandle(userId: string, docId: string): Promise<DocHandle> {
    const person = this.personIn(this.browsers, userId, "browser");
    const known = person.handles.get(docId);
    if (known !== undefined) return known;
    const handle = await this.drive(person.client.open(docId));
    this.watch(person, docId, handle);
    await this.settle();
    return handle;
  }

  browserText(userId: string, docId: string): string[] {
    const handle = this.browsers.get(userId)?.handles.get(docId);
    return handle === undefined ? [] : linesOf(handle.doc());
  }

  /** The client IDs a person's browser wrote with. */
  browserClientIds(userId: string, docId: string): number[] {
    const handle = this.browsers.get(userId)?.handles.get(docId);
    if (handle === undefined) return [];
    return [...this.cloudLedger(docId)]
      .filter(([, owner]) => owner === userId)
      .map(([id]) => id)
      .filter((id) => id === handle.doc().clientId);
  }

  cloudLedger(docId: string): Map<number, string> {
    const place = this.cloudStorage.directory.placeOf(docId);
    if (place === null) return new Map();
    const ledger = this.cloudStorage.open(place.home).log.ledger(docId);
    return new Map([...ledger].map(([id, { userId }]) => [id, userId]));
  }

  cloudText(docId: string): string[] {
    return textIn(this.cloudStorage, docId);
  }

  cloudLog(docId: string): UpdateRow[] {
    return rowsOf(this.cloudStorage, docId);
  }

  /** Pushes the cloud appended to the document's log. */
  cloudPushes(docId: string): number {
    return this.cloudLog(docId).filter((row) => row.origin === "edit").length;
  }

  cloudAuthors(docId: string): Set<string> {
    return new Set(
      this.cloudLog(docId)
        .filter((row) => row.origin === "edit")
        .map((row) => row.userId),
    );
  }

  cloudRefusals(): Message[] {
    return this.cloud.refusals.filter((m) => m.type === "ERROR" && m.permanent);
  }

  cloudSettings(docId: string): Readonly<Record<string, unknown>> {
    const doc = nodeDocOf(this.cloudStorage, docId);
    if (doc === null) return {};
    const entries = scriptSettings(doc).entries();
    doc.destroy();
    return entries;
  }

  cloudRebuilds(docId: string): void {
    this.cloud.service.requestRebuild(docId);
  }

  /** The cloud answers the next push of the document from the node `4422 invalid`, for good. */
  cloudRefusesNext(docId: string): void {
    this.cloud.refusing.add(docId);
  }

  /** What the cloud stores now, for `restoreCloud`. */
  snapshotCloud(): void {
    this.snapshot = this.cloudStorage.snapshot();
  }

  /** The cloud's storage is put back to the snapshot and its process restarts. */
  restoreCloud(): void {
    this.cloudStorage.restore(this.snapshot);
    this.cloud.restart();
    this.cloud.service.restored();
  }

  /** The cloud's network and HTTP are cut, or come back. */
  cloudDown(down: boolean): void {
    this.cloudNet.partition(down);
    this.cloud.down = down;
    this.cloud.api.down(down);
  }

  nodeLog(docId: string): UpdateRow[] {
    return rowsOf(this.nodeStorage, docId);
  }

  nodeText(docId: string): string[] {
    return textIn(this.nodeStorage, docId);
  }

  nodeGeneration(docId: string): number {
    const place = this.nodeStorage.directory.placeOf(docId);
    if (place === null) return 0;
    return this.nodeStorage.open(place.home).log.get(docId)?.generation ?? 0;
  }

  /** While true, no append to an upstream store settles. */
  upstreamStoreHolds(hold: boolean): void {
    this.holdingAppends = hold;
  }

  /** The node's deferred work waits while held, as a turn that has not ended. */
  holdNodeTurns(hold: boolean): void {
    this.life.deferred.held = hold;
  }

  /** The window sends its last setting request again, as after a lost acknowledgement. */
  resendLastSet(userId: string): void {
    const last = this.life.lastSet.get(userId);
    if (last === undefined) throw new Error(`${userId} sent no setting`);
    this.life.service.receive(last.peer, last.message);
  }

  /** The node's process dies: nothing it held in memory survives, its stores and records do. */
  crashNode(): void {
    this.life.die();
    this.holdingAppends = false;
  }

  /** A new process over the same files: the records it reads are what the last one wrote, with no step failing. */
  async restartNode(): Promise<void> {
    const kept = this.records.snapshot();
    this.records = createMemoryRecords();
    this.records.restore(kept);
    this.life = this.startLife();
    for (const person of this.records.people())
      if (person.cloudToken !== null) this.handOver(person.userId);
    await this.settle();
  }

  /** Runs `promise` to its end while the world moves. */
  async drive<T>(promise: Promise<T>): Promise<T> {
    const state = { done: false };
    const watched = promise.finally(() => {
      state.done = true;
    });
    for (let step = 0; !state.done && step < MAX_STEPS; step++)
      await this.round(true);
    if (!state.done)
      throw new Error("the world stopped before the promise settled");
    return watched;
  }

  /** Delivers, runs deferred work and advances the clock until nothing but heartbeats has happened for a while. */
  async settle(options: { cloud: boolean } = { cloud: true }): Promise<void> {
    let calm = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      const before = this.activity;
      const busy = await this.round(options.cloud);
      if (this.activity !== before) calm = 0;
      else if (!busy && ++calm >= CALM_ROUNDS) return;
    }
    throw new Error(`the world did not settle in ${MAX_STEPS} steps`);
  }

  /** Only the node and its windows move. */
  settleNode(): Promise<void> {
    return this.settle({ cloud: false });
  }

  /** Moves the world without moving the clock: true when anything happened. */
  async flush(): Promise<void> {
    while (await this.step(true));
  }

  private async step(cloud: boolean): Promise<boolean> {
    const moved = await this.move(cloud);
    for (const watcher of this.watchers) watcher();
    return moved;
  }

  private async move(cloud: boolean): Promise<boolean> {
    await turn();
    if (this.failure !== null) throw this.failure;
    if (this.life.deferred.run() || (cloud && this.cloud.deferred.run())) {
      this.active();
      return true;
    }
    if (this.nodeNet.step() || (cloud && this.cloudNet.step())) return true;
    await turn();
    return this.nodeNet.queued() > 0 || (cloud && this.cloudNet.queued() > 0);
  }

  /** True when anything happened; otherwise the clock moves on. */
  private async round(cloud: boolean): Promise<boolean> {
    if (await this.step(cloud)) return true;
    this.clock.advance(IDLE_MS);
    return false;
  }
}

export interface WorldOptions {
  /** DOC is made on the device, and the cloud has never seen it; otherwise Dana made it at the cloud for Sam and Leo. */
  madeOnDevice?: boolean;
  /** The adoption's answer takes SLOW_ADOPT_MS to come. */
  slowAdopt?: boolean;
  /** The first adoption request, or its answer, is lost. */
  drop?: "request" | "response";
  /** The cloud goes down as soon as it has answered an adoption. */
  downAfterAdopt?: boolean;
  /** That step of the node's records fails as a killed process would, until the node restarts. */
  crashOn?: "startHandoff" | "finishHandoff";
}

export function world(options?: WorldOptions): RelayWorld {
  return new RelayWorld(options);
}

/** The node's address, which no socket listens on: requests reach the core in memory. */
const NODE_URL = "http://127.0.0.1:5197";
const LAUNCH = "a".repeat(64);
const NODE_PEOPLE = [
  { userId: "sam", name: "Sam Okafor" },
  { userId: "dana", name: "Dana Reyes" },
  { userId: "you", name: "You" },
];

/** The demo's choices on the node: You starts without an account at the cloud. */
const nodeSignIn = (): ReturnType<typeof createFakeSignIn> => {
  const inner = createFakeSignIn(NODE_PEOPLE);
  return {
    describe: () => ({
      choices: inner
        .describe()
        .choices.map((c) => ({ ...c, registered: c.userId !== "you" })),
    }),
    authenticate: (body) => inner.authenticate(body),
  };
};

/** One window's socket to the core, delivered when the world steps. */
interface Wire {
  open: boolean;
  toCore: (Uint8Array | string)[];
  toWindow: Uint8Array[];
  connection: Connection;
  handlers: Parameters<Transport["connect"]>[0];
}

/** The core itself over memory parts, its windows reaching it through its server and connections, and the cloud as in the relay's world. */
export class CoreWorld {
  readonly clock = createFakeClock(START_AT);
  readonly random = seeded(41);
  readonly cloudNet: MemoryNetwork = createMemoryNetwork({
    random: this.random,
  });
  readonly cloudStorage = createMemoryStorage({ now: this.clock.clock.now });
  readonly nodeStorage = createMemoryStorage({ now: this.clock.clock.now });
  readonly records = createMemoryRecords();
  upstreamStores = createMemoryStoreSpace();
  readonly cloud = new Cloud(this.cloudStorage, this.clock);
  readonly deferred = new Deferred();
  readonly core: NodeCore;
  readonly tokens = new Map<string, string>();
  private readonly empty = this.nodeStorage.snapshot();
  private readonly wires = new Set<Wire>();
  private readonly windows = new Map<string, Person>();
  private activity = 0;
  private readonly active = (): void => {
    this.activity += 1;
  };

  constructor() {
    this.cloudNet.serve({
      connected: (end) =>
        serveEnd(this.cloud.service, end, this.cloud.hooks(), this.active),
      createDocument: (userId, request) => {
        const made = this.cloud.service.access.create(userId, request);
        if (made.ok) return { ok: true };
        const code = made.code === "deleted" ? "deleted" : "forbidden";
        return { ok: false, code };
      },
      replay: (userId, request) =>
        this.cloud.service.replay(userId, JSON.parse(JSON.stringify(request))),
    });
    const cloud: CloudApi = {
      signIn: (userId) => this.cloud.api.signIn(userId),
      demo: () => this.cloud.api.demo(),
      describe: (token, request) => this.cloud.api.describe(token, request),
      adopt: (token, request) => this.cloud.api.adopt(token, request),
    };
    this.core = createNodeCore({
      storage: this.nodeStorage,
      records: this.records,
      cloud,
      upstream: {
        create: (userId, token) => this.upstreamClient(userId, token),
        store: (userId) => this.upstreamStores.store(userId),
      },
      clock: this.clock.clock,
      defer: this.deferred.defer,
      random: randomOf(seeded(43)),
      signIn: nodeSignIn(),
      directory: createFakeDirectory(
        NODE_PEOPLE.map((user) => ({ user, workspaces: [] })),
      ),
      versions: VERSIONS,
      build: "test",
      webDir: null,
      launchToken: LAUNCH,
      registry: PRODUCT_SETTING_RULES,
      boot: null,
      storeUsage: () => ({ scripts: 0, bytes: 0 }),
      nodeUrl: NODE_URL,
      wipe: async () => {
        this.nodeStorage.restore(this.empty);
        this.upstreamStores = createMemoryStoreSpace();
      },
    });
  }

  /** A request to the core as the window sends it: the launch header, and the person's node token when given. */
  async request(
    method: "GET" | "POST",
    path: string,
    options: { token?: string | null; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { "X-Manent-Launch": LAUNCH };
    const token = options.token ?? null;
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const answer = await this.core.server.fetch(
      new Request(`${NODE_URL}${path}`, init),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (answer === null) throw new TypeError(`${path} was upgraded`);
    return answer;
  }

  /** The person chooses themselves at the node, as the window's chooser does. */
  async chooses(userId: string): Promise<string> {
    const answer = await this.request("POST", "/api/sign-in", {
      body: { userId },
    });
    const body: unknown = await answer.json();
    const token =
      typeof body === "object" && body !== null && "token" in body
        ? body.token
        : null;
    if (typeof token !== "string")
      throw new Error(`${userId} was not signed in`);
    this.tokens.set(userId, token);
    await this.settle();
    return token;
  }

  /** The window's handle on the document, opened as the window would; `create` makes it on the node. */
  async open(
    userId: string,
    docId: string,
    create = false,
  ): Promise<DocHandle> {
    const person = this.windowOf(userId);
    const known = person.handles.get(docId);
    if (known !== undefined) return known;
    const made = { kind: "script", home: HOME, workspaceId: null };
    const opening = create
      ? person.client.open(docId, { create: made })
      : person.client.open(docId);
    const handle = await this.drive(opening);
    person.handles.set(docId, handle);
    await this.settle();
    return handle;
  }

  /** The person opens a script Dana made at the cloud, through the node, which mirrors and relays it. */
  async openSynced(userId: string, docId: string): Promise<DocHandle> {
    if (!this.cloudHas(docId))
      this.cloud.service.access.create("dana", {
        docId,
        kind: "script",
        home: HOME,
      });
    this.cloudStorage.directory.setRole(docId, userId, "edit", []);
    if (!this.tokens.has(userId)) await this.chooses(userId);
    return this.open(userId, docId);
  }

  windowTypes(userId: string, docId: string, text: string): void {
    const handle = this.windowOf(userId).handles.get(docId);
    if (handle === undefined)
      throw new Error(`${userId} has no window on ${docId}`);
    typeInto(handle.doc(), text);
  }

  windowStatus(userId: string, docId: string): DocStatus {
    const handle = this.windowOf(userId).handles.get(docId);
    if (handle === undefined)
      throw new Error(`${userId} has no window on ${docId}`);
    return handle.status.get();
  }

  cloudHas(docId: string): boolean {
    return this.cloudStorage.directory.placeOf(docId) !== null;
  }

  cloudText(docId: string): string[] {
    return textIn(this.cloudStorage, docId);
  }

  nodeText(docId: string): string[] {
    return textIn(this.nodeStorage, docId);
  }

  async drive<T>(promise: Promise<T>): Promise<T> {
    const state = { done: false };
    const watched = promise.finally(() => {
      state.done = true;
    });
    for (let step = 0; !state.done && step < MAX_STEPS; step++)
      if (!(await this.step())) this.clock.advance(IDLE_MS);
    if (!state.done)
      throw new Error("the world stopped before the promise settled");
    return watched;
  }

  /** As the relay's world settles; a world that keeps retrying, as one offline does, stops after SETTLE_SPAN_MS. */
  async settle(): Promise<void> {
    let calm = 0;
    const until = this.clock.clock.now() + SETTLE_SPAN_MS;
    for (let step = 0; step < MAX_STEPS; step++) {
      const before = this.activity;
      const busy = await this.step();
      if (!busy) this.clock.advance(IDLE_MS);
      if (this.activity !== before) calm = 0;
      else if (!busy && ++calm >= CALM_ROUNDS) return;
      if (this.clock.clock.now() >= until) return;
    }
    throw new Error(`the world did not settle in ${MAX_STEPS} steps`);
  }

  private async step(): Promise<boolean> {
    await turn();
    if (this.deferred.run() || this.cloud.deferred.run()) {
      this.active();
      return true;
    }
    for (const wire of this.wires) {
      const toCore = wire.toCore.shift();
      if (toCore !== undefined) {
        this.active();
        this.core.server.connections.message(wire.connection, toCore);
        return true;
      }
      const toWindow = wire.toWindow.shift();
      if (toWindow !== undefined) {
        wire.handlers.onFrame(toWindow);
        return true;
      }
    }
    if (this.cloudNet.step()) return true;
    await turn();
    return this.cloudNet.queued() > 0;
  }

  private windowOf(userId: string): Person {
    const known = this.windows.get(userId);
    if (known !== undefined) return known;
    const deviceId = `window-${userId}`;
    const client = createSyncClient({
      userId,
      deviceId,
      build: "test",
      versions: V1,
      minServer: MIN_SERVER,
      via: "local_node",
      ports: {
        transport: this.windowTransport(userId),
        store: createMemoryStore(userId),
        leader: soloLeader(deviceId),
        clock: this.clock.clock,
        random: randomOf(seeded(deviceId.length * 977)),
        frames: NO_FRAMES,
      },
    });
    const person = { client, handles: new Map(), events: new Map() };
    this.windows.set(userId, person);
    return person;
  }

  /** The window's transport: its requests reach the core's server, and its socket the core's connections. */
  private windowTransport(userId: string): Transport {
    const token = (): string => {
      const known = this.tokens.get(userId);
      if (known === undefined) throw new ConnectError("sign_in");
      return known;
    };
    const post = async (path: string, body?: unknown): Promise<Response> =>
      this.request("POST", path, { token: token(), body });
    return {
      connect: async (handlers) => {
        const ticketAnswer = await post("/api/ws-ticket");
        const read: unknown = await ticketAnswer.json();
        const ticket =
          typeof read === "object" && read !== null && "ticket" in read
            ? read.ticket
            : null;
        if (typeof ticket !== "string") throw new ConnectError("unreachable");
        let data: ConnectionData | null = null;
        await this.core.server.fetch(
          new Request(`${NODE_URL}/ws?ticket=${ticket}`, {
            headers: {
              "X-Manent-Launch": LAUNCH,
              Origin: new URL(NODE_URL).origin,
            },
          }),
          {
            remoteAddress: "127.0.0.1",
            upgrade: (given) => {
              data = given;
              return true;
            },
          },
        );
        if (data === null) throw new ConnectError("unreachable");
        const wire: Wire = {
          open: true,
          toCore: [],
          toWindow: [],
          handlers,
          connection: {
            data,
            bufferedBytes: 0,
            send: (frame) => {
              if (wire.open) wire.toWindow.push(new Uint8Array(frame));
              return "sent";
            },
            close: (code, reason) => {
              if (!wire.open) return;
              wire.open = false;
              this.wires.delete(wire);
              handlers.onClose(code, reason);
            },
          },
        };
        this.wires.add(wire);
        this.core.server.connections.open(wire.connection);
        return {
          send: (frame) => {
            if (wire.open) wire.toCore.push(new Uint8Array(frame));
          },
          close: () => {
            if (!wire.open) return;
            wire.open = false;
            this.wires.delete(wire);
            this.core.server.connections.close(wire.connection);
          },
        };
      },
      createDocument: async ({ workspaceId, ...request }) => {
        const named = workspaceId === null ? {} : { workspaceId };
        const { status } = await post("/api/docs", { ...request, ...named });
        if (status === 200) return { ok: true };
        if (status === 403) return { ok: false, code: "forbidden" };
        if (status === 410) return { ok: false, code: "deleted" };
        throw new ConnectError("unreachable");
      },
      replay: async () => {
        throw new ConnectError("unreachable");
      },
    };
  }

  private upstreamClient(
    userId: string,
    token: () => string | null,
  ): SyncClient {
    const deviceId = `node-${userId}`;
    const inner = this.cloudNet.transport(userId);
    const gated = (): void => {
      if (token() === null) throw new ConnectError("sign_in");
    };
    return createSyncClient({
      userId,
      deviceId,
      build: "test",
      versions: V1,
      minServer: MIN_SERVER,
      ports: {
        transport: {
          connect: async (handlers) => {
            gated();
            return inner.connect(handlers);
          },
          createDocument: async (request) => {
            gated();
            return inner.createDocument(request);
          },
          replay: async (request) => {
            gated();
            return inner.replay(request);
          },
        },
        store: this.upstreamStores.store(userId),
        leader: soloLeader(deviceId),
        clock: this.clock.clock,
        random: randomOf(seeded(userId.length * 6007)),
        frames: NO_FRAMES,
      },
    });
  }
}

export function nodeWorld(): CoreWorld {
  return new CoreWorld();
}
