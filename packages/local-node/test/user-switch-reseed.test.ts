import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { SCHEMA_VERSION, blockText, blocksOf } from "@manent/schema";
import {
  DEFAULT_LIMITS,
  PRODUCT_SETTING_RULES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  peerOf,
} from "@manent/server-core";
import type {
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
import { createMemoryStorage } from "@manent/storage/testing";
import {
  ConnectError,
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type {
  DocHandle,
  Random,
  SyncClient,
  Transport,
} from "@manent/sync-client";
import {
  createFakeClock,
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "@manent/sync-client/testing";
import type { ServerEnd } from "@manent/sync-client/testing";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type { FrameDecoder, Message } from "@manent/sync-protocol";
import { createNodeCore } from "../src/index.ts";
import type { NodeCore } from "../src/index.ts";
import { createFakeCloud, createMemoryRecords } from "../src/testing/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const HOME = `project:${PROJECT}`;
const NODE_URL = "http://127.0.0.1:5198";
const LAUNCH = "b".repeat(64);
const START_AT = 1_767_225_600_000;
const V1 = Object.freeze({
  protocol: 1,
  schema: SCHEMA_VERSION,
  engine: 0,
  table: 0,
});
const VERSIONS = Object.freeze({ current: V1, min: V1 });
const MIN_SERVER = Object.freeze({ ...V1, schema: 0 });
const PEOPLE = [
  { userId: "sam", name: "Sam Okafor" },
  { userId: "dana", name: "Dana Reyes" },
  { userId: "you", name: "You" },
];
const NAMES: Readonly<Record<string, string>> = Object.freeze({
  sam: "Sam Okafor",
  dana: "Dana Reyes",
  you: "You",
});
const NO_FRAMES = { request: () => () => {} };
const NO_DATA = {} as ConnectionData;

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

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

const linesOf = (handle: DocHandle): string[] =>
  blocksOf(scriptBody(handle.doc()).materialize()).map(blockText);

function writeText(handle: DocHandle, id: string, text: string): void {
  scriptBody(handle.doc()).write((w) => {
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id, type: "action" },
        content: [{ type: "text", text }],
      },
    ]);
  });
}

interface Wire {
  readonly userId: string;
  open: boolean;
  toCore: (Uint8Array | string)[];
  toWindow: Uint8Array[];
  readonly fromCore: FrameDecoder;
  connection: Connection;
  handlers: Parameters<Transport["connect"]>[0];
}

function createHarness(options: { holdWipe?: boolean } = {}) {
  const clock = createFakeClock(START_AT);
  const rand = seeded(73);
  const cloudNet = createMemoryNetwork({ random: rand });
  const cloudStorage = createMemoryStorage({ now: clock.clock.now });
  const emptyCloud = cloudStorage.snapshot();
  const nodeStorage = createMemoryStorage({ now: clock.clock.now });
  const emptyNode = nodeStorage.snapshot();
  const records = createMemoryRecords();
  let upstreamStores = createMemoryStoreSpace();
  const deferred: (() => void)[] = [];
  const cloudDeferred: (() => void)[] = [];
  const cloudPeers = new Set<Peer>();
  const wires = new Set<Wire>();
  const tokens = new Map<string, string>();
  const windowClients = new Map<string, SyncClient>();
  const heard = new Map<string, Message[]>();
  let activity = 0;
  let secretByte = 7;
  let seedId = "seed-1";
  let versionSeq = 0;
  let cloudServer!: ManentServer;
  let cloudService!: SyncService;
  let cloudApi!: ReturnType<typeof createFakeCloud>;
  let wipeGate: ReturnType<typeof Promise.withResolvers<void>> | null = null;
  let wipeStarted: ReturnType<typeof Promise.withResolvers<void>> | null = null;
  let holdWipe = options.holdWipe === true;

  function startCloud(): void {
    const sessions = createSignedSessionStore({
      secret: new Uint8Array(32).fill(secretByte),
      now: clock.clock.now,
    });
    cloudServer = createServer({
      http: {
        allowedHosts: ["127.0.0.1"],
        openUrl: "http://127.0.0.1",
        webDir: null,
      },
      auth: {
        signIn: createFakeSignIn(PEOPLE),
        directory: createFakeDirectory(
          PEOPLE.map((user) => ({ user, workspaces: [] })),
        ),
        sessions,
      },
      demo: { seedId: () => seedId, control: null, controls: null },
      socket: {
        tickets: createTicketStore({ now: clock.clock.now }),
        versions: VERSIONS,
        allowedOrigins: ["http://127.0.0.1"],
      },
      sync: {
        storage: cloudStorage,
        clock: clock.clock,
        defer: (fn) => void cloudDeferred.push(fn),
        ids: () => `v-${++versionSeq}`,
        registry: PRODUCT_SETTING_RULES,
      },
    });
    if (cloudServer.sync === null) throw new TypeError("cloud has no sync");
    cloudService = cloudServer.sync;
    cloudApi = createFakeCloud({ server: cloudServer });
  }

  function serveCloudEnd(end: ServerEnd): void {
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
      cloudPeers.delete(peer);
      cloudService.detach(peer);
    };
    end.onFrame = (frame) => {
      const read = decoder.push(frame);
      if (read.kind !== "message") return;
      const { message } = read;
      if (peer === null) {
        if (message.type !== "HELLO") return end.close(CODE.BAD_FRAME, "hello");
        const identity = { userId: end.userId, name: NAMES[end.userId] ?? "" };
        const made = peerOf(
          connection,
          {
            identity,
            deviceId: message.deviceId,
            versions: message.versions,
            address: "127.0.0.1",
          },
          createMessageIds(),
          DEFAULT_LIMITS,
        );
        peer = {
          ...made,
          send(sent) {
            if (!("type" in sent && sent.type === "PONG")) activity += 1;
            made.send(sent);
          },
          close: (code, reason) => made.close(code, reason),
        };
        cloudPeers.add(peer);
        peer.send({
          type: "WELCOME",
          session: identity,
          limits: {
            frameBytes: FRAME_LIMIT_BYTES,
            messageBytes: MESSAGE_LIMIT_BYTES,
          },
          server: VERSIONS,
        });
        cloudService.attach(peer);
        return;
      }
      if (message.type === "PING")
        return peer.send({ type: "PONG", nonce: message.nonce });
      activity += 1;
      cloudService.receive(peer, message);
    };
  }

  startCloud();
  cloudNet.serve({
    connected: serveCloudEnd,
    createDocument: (userId, request) => {
      const made = cloudService.access.create(userId, request);
      if (made.ok) return { ok: true };
      return {
        ok: false,
        code: made.code === "deleted" ? "deleted" : "forbidden",
      };
    },
    replay: (userId, request) =>
      cloudService.replay(userId, JSON.parse(JSON.stringify(request))),
  });

  async function verifyCloudToken(token: string | null): Promise<void> {
    if (token === null) throw new ConnectError("sign_in");
    const response = await cloudServer.fetch(
      new Request("http://127.0.0.1/api/ws-ticket", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null || response.status === 401)
      throw new ConnectError("sign_in");
    if (response.status !== 200) throw new ConnectError("unreachable");
  }

  const innerSignIn = createFakeSignIn(PEOPLE);
  const core: NodeCore = createNodeCore({
    storage: nodeStorage,
    records,
    cloud: {
      signIn: (userId) => cloudApi.signIn(userId),
      demo: () => cloudApi.demo(),
      describe: (token, request) => cloudApi.describe(token, request),
      adopt: (token, request) => cloudApi.adopt(token, request),
      forward: (token, request) => cloudApi.forward(token, request),
    },
    upstream: {
      create(userId, token) {
        const deviceId = `node-${userId}`;
        const inner = cloudNet.transport(userId);
        return createSyncClient({
          userId,
          deviceId,
          build: "test",
          versions: V1,
          minServer: MIN_SERVER,
          ports: {
            transport: {
              async connect(handlers) {
                await verifyCloudToken(token());
                return inner.connect(handlers);
              },
              async createDocument(request) {
                await verifyCloudToken(token());
                return inner.createDocument(request);
              },
              async replay(request) {
                await verifyCloudToken(token());
                return inner.replay(request);
              },
            },
            store: upstreamStores.store(userId),
            leader: soloLeader(deviceId),
            clock: clock.clock,
            random: randomOf(seeded(userId.length * 6007)),
            frames: NO_FRAMES,
          },
        });
      },
      store: (userId) => upstreamStores.store(userId),
    },
    clock: clock.clock,
    defer: (fn) => void deferred.push(fn),
    random: randomOf(seeded(43)),
    signIn: {
      describe: () => ({
        choices: innerSignIn
          .describe()
          .choices.map((c) => ({ ...c, registered: c.userId !== "you" })),
      }),
      authenticate: (body) => innerSignIn.authenticate(body),
    },
    directory: createFakeDirectory(
      PEOPLE.map((user) => ({ user, workspaces: [] })),
    ),
    versions: VERSIONS,
    build: "test",
    webDir: null,
    launchToken: LAUNCH,
    registry: PRODUCT_SETTING_RULES,
    renderPdf: async () => new Uint8Array(),
    boot: null,
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    nodeUrl: NODE_URL,
    async wipe() {
      if (holdWipe) {
        wipeStarted?.resolve();
        wipeGate ??= Promise.withResolvers<void>();
        await wipeGate.promise;
      }
      nodeStorage.restore(emptyNode);
      upstreamStores = createMemoryStoreSpace();
    },
  });

  async function callNode(
    method: "GET" | "POST",
    path: string,
    init: { token?: string | null; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { "X-Manent-Launch": LAUNCH };
    if (init.token != null) headers.Authorization = `Bearer ${init.token}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const reqInit: RequestInit = { method, headers };
    if (init.body !== undefined) reqInit.body = JSON.stringify(init.body);
    const answer = await core.server.fetch(
      new Request(`${NODE_URL}${path}`, reqInit),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (answer === null) throw new TypeError(`${path} was upgraded`);
    return answer;
  }

  async function step(): Promise<boolean> {
    await turn();
    const fn = deferred.shift() ?? cloudDeferred.shift();
    if (fn !== undefined) {
      activity += 1;
      fn();
      return true;
    }
    for (const wire of wires) {
      const toCore = wire.toCore.shift();
      if (toCore !== undefined) {
        activity += 1;
        core.server.connections.message(wire.connection, toCore);
        return true;
      }
      const toWindow = wire.toWindow.shift();
      if (toWindow !== undefined) {
        const read = wire.fromCore.push(toWindow);
        if (read.kind === "message") {
          const list = heard.get(wire.userId) ?? [];
          list.push(read.message);
          heard.set(wire.userId, list);
        }
        wire.handlers.onFrame(toWindow);
        return true;
      }
    }
    if (cloudNet.step()) return true;
    await turn();
    return cloudNet.queued() > 0;
  }

  async function settle(): Promise<void> {
    let calm = 0;
    const until = clock.clock.now() + 60_000;
    for (let i = 0; i < 10_000; i++) {
      const before = activity;
      const busy = await step();
      if (!busy) clock.advance(1_000);
      if (activity !== before) calm = 0;
      else if (!busy && ++calm >= 12) return;
      if (clock.clock.now() >= until) return;
    }
  }

  async function drive<T>(promise: Promise<T>): Promise<T> {
    const state = { done: false };
    const watched = promise.finally(() => {
      state.done = true;
    });
    for (let i = 0; !state.done && i < 10_000; i++)
      if (!(await step())) clock.advance(1_000);
    if (!state.done) throw new Error("promise did not settle");
    return watched;
  }

  function windowTransport(userId: string): Transport {
    const token = (): string => {
      const known = tokens.get(userId);
      if (known === undefined) throw new ConnectError("sign_in");
      return known;
    };
    const post = (path: string, body?: unknown) =>
      callNode("POST", path, { token: token(), body });
    return {
      async connect(handlers) {
        const answer = await post("/api/ws-ticket");
        const body: unknown = await answer.json();
        const ticket =
          typeof body === "object" && body !== null && "ticket" in body
            ? body.ticket
            : null;
        if (typeof ticket !== "string") throw new ConnectError("unreachable");
        let data: ConnectionData | null = null;
        await core.server.fetch(
          new Request(`${NODE_URL}/ws?ticket=${ticket}`, {
            headers: {
              "X-Manent-Launch": LAUNCH,
              Origin: new URL(NODE_URL).origin,
            },
          }),
          {
            remoteAddress: "127.0.0.1",
            upgrade(given) {
              data = given;
              return true;
            },
          },
        );
        if (data === null) throw new ConnectError("unreachable");
        const wire: Wire = {
          userId,
          open: true,
          toCore: [],
          toWindow: [],
          fromCore: createFrameDecoder({ from: "server" }),
          handlers,
          connection: {
            data,
            bufferedBytes: 0,
            send(frame) {
              if (wire.open) wire.toWindow.push(new Uint8Array(frame));
              return "sent";
            },
            close(code, reason) {
              if (!wire.open) return;
              wire.open = false;
              wires.delete(wire);
              handlers.onClose(code, reason);
            },
          },
        };
        wires.add(wire);
        core.server.connections.open(wire.connection);
        return {
          send(frame) {
            if (wire.open) wire.toCore.push(new Uint8Array(frame));
          },
          close() {
            if (!wire.open) return;
            wire.open = false;
            wires.delete(wire);
            core.server.connections.close(wire.connection);
          },
        };
      },
      async createDocument({ workspaceId, ...body }) {
        const { status } = await post(
          "/api/docs",
          workspaceId === null ? body : { ...body, workspaceId },
        );
        if (status === 200) return { ok: true };
        if (status === 403) return { ok: false, code: "forbidden" };
        if (status === 410) return { ok: false, code: "deleted" };
        throw new ConnectError("unreachable");
      },
      async replay() {
        throw new ConnectError("unreachable");
      },
    };
  }

  function windowClient(userId: string): SyncClient {
    let client = windowClients.get(userId);
    if (client === undefined) {
      const deviceId = `window-${userId}`;
      client = createSyncClient({
        userId,
        deviceId,
        build: "test",
        versions: V1,
        minServer: MIN_SERVER,
        via: "local_node",
        ports: {
          transport: windowTransport(userId),
          store: createMemoryStore(userId),
          leader: soloLeader(deviceId),
          clock: clock.clock,
          random: randomOf(seeded(deviceId.length * 977)),
          frames: NO_FRAMES,
        },
      });
      windowClients.set(userId, client);
    }
    return client;
  }

  async function seedCloudDoc(text: string): Promise<void> {
    cloudService.access.create("dana", {
      docId: DOC,
      kind: "script",
      home: HOME,
    });
    cloudStorage.directory.setRole(DOC, "sam", "edit", []);
    const seeder = createSyncClient({
      userId: "dana",
      deviceId: `seed-${seedId}`,
      build: "test",
      versions: V1,
      minServer: MIN_SERVER,
      ports: {
        transport: cloudNet.transport("dana"),
        store: createMemoryStore("dana"),
        leader: soloLeader(`seed-${seedId}`),
        clock: clock.clock,
        random: randomOf(seeded(seedId.length * 311)),
        frames: NO_FRAMES,
      },
    });
    const handle = await drive(seeder.open(DOC));
    writeText(handle, `b00000000000000${secretByte}`, text);
    await settle();
    await drive(seeder.close());
  }

  async function chooses(userId: string, waitSettle = true): Promise<string> {
    const answer = await callNode("POST", "/api/sign-in", { body: { userId } });
    const body: unknown = await answer.json();
    const token =
      typeof body === "object" && body !== null && "token" in body
        ? body.token
        : null;
    if (typeof token !== "string") throw new Error(`${userId} sign-in failed`);
    tokens.set(userId, token);
    if (waitSettle) await settle();
    return token;
  }

  async function openInWindow(userId: string): Promise<DocHandle> {
    const handle = await drive(windowClient(userId).open(DOC));
    await settle();
    return handle;
  }

  async function reseedCloud(nextSeedId: string, text: string): Promise<void> {
    for (const peer of cloudPeers) peer.close(1006, "reseed");
    cloudPeers.clear();
    cloudDeferred.length = 0;
    cloudStorage.restore(emptyCloud);
    secretByte += 1;
    seedId = nextSeedId;
    startCloud();
    await seedCloudDoc(text);
  }

  return {
    core,
    records,
    nodeStorage,
    seedCloudDoc,
    chooses,
    openInWindow,
    reseedCloud,
    settle,
    drive,
    step,
    windowClient,
    heardErrors: (userId: string) =>
      (heard.get(userId) ?? []).flatMap((m) =>
        m.type === "ERROR" ? [`${m.code} ${m.message}`] : [],
      ),
    heardTypes: (userId: string) =>
      (heard.get(userId) ?? []).map((m) => m.type),
    expectWipeStart(): Promise<void> {
      holdWipe = true;
      wipeStarted = Promise.withResolvers<void>();
      wipeGate = Promise.withResolvers<void>();
      return wipeStarted.promise;
    },
    releaseWipe(): void {
      holdWipe = false;
      wipeGate?.resolve();
      wipeGate = null;
    },
    async close(): Promise<void> {
      for (const client of windowClients.values()) await drive(client.close());
      await drive(core.close());
    },
  };
}

test("switching to another person on a running node mirrors their role for a shared synced script", async () => {
  const h = createHarness();
  await h.seedCloudDoc("Shared first scene.");
  await h.chooses("sam");
  const sam = await h.openInWindow("sam");
  expect(linesOf(sam)).toEqual(["Shared first scene."]);
  expect(h.heardErrors("sam")).toEqual([]);

  await h.chooses("dana");
  const dana = await h.openInWindow("dana");
  expect(h.heardErrors("dana")).toEqual([]);
  expect(h.heardTypes("dana")).toContain("SUBSCRIBED");
  expect(dana.status.get().side).toEqual([]);
  expect(linesOf(dana)).toEqual(["Shared first scene."]);
  await h.close();
});

test("after a cloud reseed with a rotated secret, switching people wipes cleanly, re-authenticates and opens the script", async () => {
  const h = createHarness();
  await h.seedCloudDoc("Before reseed.");
  await h.chooses("dana");
  const danaOldToken = h.records.person("dana")?.cloudToken ?? null;
  expect(danaOldToken).toEqual(expect.any(String));

  await h.chooses("sam");
  const sam = await h.openInWindow("sam");
  expect(linesOf(sam)).toEqual(["Before reseed."]);
  expect(h.records.seedId()).toBe("seed-1");

  await h.reseedCloud("seed-2", "After reseed.");

  await h.chooses("dana");
  const dana = await h.openInWindow("dana");
  expect(h.heardErrors("dana")).toEqual([]);
  expect(h.heardTypes("dana")).toContain("SUBSCRIBED");
  expect(dana.status.get().side).toEqual([]);
  expect(linesOf(dana)).toEqual(["After reseed."]);
  expect(h.records.seedId()).toBe("seed-2");
  expect(h.records.person("dana")?.cloudToken).not.toBe(danaOldToken);
  await h.close();
});

test("a subscribe arriving during an active reseed wipe waits for the wipe and opens the script", async () => {
  const h = createHarness();
  await h.seedCloudDoc("Before wipe.");
  await h.chooses("sam");
  await h.openInWindow("sam");
  expect(h.records.seedId()).toBe("seed-1");

  const wipeBegun = h.expectWipeStart();
  await h.reseedCloud("seed-2", "After concurrent wipe.");
  // Drive until the reseed wipe is actively paused mid-flight.
  await h.drive(wipeBegun);

  // Switch to Dana and start opening DOC while wipe() is still running.
  await h.chooses("dana", false);
  const opening = h.windowClient("dana").open(DOC);
  for (let i = 0; i < 20; i++) await h.step();

  // Finish the wipe and let Dana's waiting subscribe complete.
  h.releaseWipe();
  const dana = await h.drive(opening);
  await h.settle();

  expect(h.heardErrors("dana")).toEqual([]);
  expect(h.heardTypes("dana")).toContain("SUBSCRIBED");
  expect(dana.status.get().side).toEqual([]);
  expect(linesOf(dana)).toEqual(["After concurrent wipe."]);
  await h.close();
});

test("a local-only person has no upstream client while a cloud person gets one", async () => {
  const h = createHarness();
  await h.chooses("you");
  expect(h.core.relay.clientOf("you")).toBeNull();
  expect(h.core.relay.people()).toEqual([]);

  await h.chooses("sam");
  const client = h.core.relay.clientOf("sam");
  expect(client).not.toBeNull();
  expect(h.core.relay.clientOf("sam")).toBe(client);
  expect(h.core.relay.people()).toEqual(["sam"]);
  await h.close();
});
