import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CUTS_MAP, jsonMap, scriptBody } from "@manent/crdt";
import { SCHEMA_VERSION } from "@manent/schema";
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
import { SEARCH_INDEX_FILE } from "@manent/storage";
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
  indexDocId,
  projectHome,
  workspaceHome,
} from "@manent/sync-protocol";
import type { SearchResponse } from "@manent/sync-protocol";
import { createNodeCore } from "../src/index.ts";
import type { NodeCore } from "../src/index.ts";
import { createFakeCloud, createMemoryRecords } from "../src/testing/index.ts";

const STUDIO_WS = "studio";
const STUDIO_INDEX = indexDocId("workspace", STUDIO_WS);
const CLOUD_PROJ = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const CLOUD_DOC_1 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const CLOUD_DOC_2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const DANA_PRIV_PROJ = "4b8e5d27-91c4-4f0a-a6d2-7e15c09b4f39";
const DANA_PRIV_DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";
const LOCAL_PROJ = "5b8e5d27-91c4-4f0a-a6d2-7e15c09b4f40";
const LOCAL_DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7d0";
const NODE_URL = "http://127.0.0.1:5199";
const LAUNCH = "c".repeat(64);
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

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "manent-ln-search-"));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

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

function writeScriptText(
  handle: DocHandle,
  id: string,
  text: string,
  cutText?: string,
): void {
  scriptBody(handle.doc()).write((w) => {
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id, type: "action" },
        content: [{ type: "text", text }],
      },
    ]);
  });
  if (cutText !== undefined) {
    jsonMap(handle.doc(), CUTS_MAP).set("cut-1", {
      v: 1,
      blocks: [
        {
          type: "block",
          attrs: { id: "c000000000000001", type: "action" },
          content: [{ type: "text", text: cutText }],
        },
      ],
      origin: { afterBlockId: null, sceneHeadingId: null },
      authorUserId: "dana",
      createdAt: START_AT,
    });
  }
}

interface Wire {
  readonly userId: string;
  open: boolean;
  toCore: (Uint8Array | string)[];
  toWindow: Uint8Array[];
  connection: Connection;
  handlers: Parameters<Transport["connect"]>[0];
}

function createHarness(options: { searchDir?: string } = {}) {
  const clock = createFakeClock(START_AT);
  const rand = seeded(91);
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
  let activity = 0;
  let secretByte = 9;
  let seedId = "seed-1";
  let versionSeq = 0;
  let cloudOffline = false;
  let cloudCallsWhileOffline = 0;
  let cloudServer!: ManentServer;
  let cloudService!: SyncService;
  let cloudApi!: ReturnType<typeof createFakeCloud>;

  const directory = createFakeDirectory([
    {
      user: { userId: "dana", name: "Dana Reyes" },
      workspaces: [{ id: STUDIO_WS, name: "Studio", seeding: null }],
    },
    {
      user: { userId: "sam", name: "Sam Okafor" },
      workspaces: [{ id: STUDIO_WS, name: "Studio", seeding: null }],
    },
    { user: { userId: "you", name: "You" }, workspaces: [] },
  ]);

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
        directory,
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
    if (cloudOffline) {
      cloudCallsWhileOffline += 1;
      throw new ConnectError("unreachable");
    }
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

  function guardCloud<T>(run: () => Promise<T>): Promise<T> {
    if (cloudOffline) {
      cloudCallsWhileOffline += 1;
      return Promise.reject(new ConnectError("unreachable"));
    }
    return run();
  }

  const innerSignIn = createFakeSignIn(PEOPLE);
  const core: NodeCore = createNodeCore({
    storage: nodeStorage,
    records,
    cloud: {
      signIn: (userId) => guardCloud(() => cloudApi.signIn(userId)),
      demo: () => guardCloud(() => cloudApi.demo()),
      describe: (token, request) =>
        guardCloud(() => cloudApi.describe(token, request)),
      adopt: (token, request) =>
        guardCloud(() => cloudApi.adopt(token, request)),
      forward: (token, request) =>
        guardCloud(() => cloudApi.forward(token, request)),
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
    directory,
    versions: VERSIONS,
    build: "test",
    webDir: null,
    launchToken: LAUNCH,
    registry: PRODUCT_SETTING_RULES,
    renderPdf: async () => new Uint8Array(),
    boot: null,
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    nodeUrl: NODE_URL,
    searchDir: options.searchDir,
    async wipe() {
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

  async function seedCloudWorkspace(seed: {
    docId: string;
    title: string;
    body: string;
    cutText?: string;
    privateBody?: string;
  }): Promise<void> {
    cloudService.access.create("dana", {
      docId: STUDIO_INDEX,
      kind: "index",
      home: workspaceHome(STUDIO_WS),
    });
    cloudStorage.directory.setRole(STUDIO_INDEX, "sam", "view", []);

    cloudService.access.create("dana", {
      docId: seed.docId,
      kind: "script",
      home: projectHome(CLOUD_PROJ),
      workspaceId: STUDIO_WS,
    });
    cloudStorage.directory.setRole(seed.docId, "sam", "view", []);

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

    const wsHandle = await drive(seeder.open(STUDIO_INDEX));
    jsonMap(wsHandle.doc(), "projects").set(CLOUD_PROJ, {
      title: "Studio Film",
      kind: "film",
      createdAt: START_AT,
      createdByUserId: "dana",
      folderId: null,
    });
    jsonMap(wsHandle.doc(), "documents").set(seed.docId, {
      projectId: CLOUD_PROJ,
      title: seed.title,
      kind: "script",
      createdAt: START_AT,
      editedAt: START_AT,
      editedByUserId: "dana",
      airDate: null,
      rundownId: null,
      trashedAt: null,
      trashedByUserId: null,
    });

    const docHandle = await drive(seeder.open(seed.docId));
    writeScriptText(
      docHandle,
      `b00000000000000${secretByte}`,
      seed.body,
      seed.cutText,
    );

    if (seed.privateBody !== undefined) {
      const danaIndex = indexDocId("user", "dana");
      cloudService.access.create("dana", {
        docId: danaIndex,
        kind: "index",
        home: "user",
      });
      cloudService.access.create("dana", {
        docId: DANA_PRIV_DOC,
        kind: "script",
        home: projectHome(DANA_PRIV_PROJ),
      });
      const privIdx = await drive(seeder.open(danaIndex));
      const pf = jsonMap(privIdx.doc(), "private_folder");
      pf.set(DANA_PRIV_PROJ, {
        title: "Dana Private",
        kind: "film",
        createdAt: START_AT,
        createdByUserId: "dana",
        folderId: null,
      });
      pf.set(DANA_PRIV_DOC, {
        projectId: DANA_PRIV_PROJ,
        title: "Dana Secret Draft",
        kind: "script",
        createdAt: START_AT,
        editedAt: START_AT,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      const privDoc = await drive(seeder.open(DANA_PRIV_DOC));
      writeScriptText(
        privDoc,
        `p00000000000000${secretByte}`,
        seed.privateBody,
      );
    }

    await settle();
    await drive(seeder.close());
  }

  async function chooses(userId: string): Promise<string> {
    const answer = await callNode("POST", "/api/sign-in", { body: { userId } });
    const body: unknown = await answer.json();
    const token =
      typeof body === "object" && body !== null && "token" in body
        ? body.token
        : null;
    if (typeof token !== "string") throw new Error(`${userId} sign-in failed`);
    tokens.set(userId, token);
    await settle();
    return token;
  }

  async function openDoc(userId: string, docId: string): Promise<DocHandle> {
    const handle = await drive(windowClient(userId).open(docId));
    await settle();
    return handle;
  }

  async function createLocalPrivateDoc(
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const token = tokens.get(userId)!;
    const userIndex = indexDocId("user", userId);
    const createdIdx = await callNode("POST", "/api/docs", {
      token,
      body: { docId: userIndex, kind: "index", home: "user" },
    });
    expect(createdIdx.status).toBe(200);
    const createdDoc = await callNode("POST", "/api/docs", {
      token,
      body: {
        docId: LOCAL_DOC,
        kind: "script",
        home: projectHome(LOCAL_PROJ),
      },
    });
    expect(createdDoc.status).toBe(200);

    const idxHandle = await openDoc(userId, userIndex);
    const pf = jsonMap(idxHandle.doc(), "private_folder");
    pf.set(LOCAL_PROJ, {
      title: "Solo Film",
      kind: "film",
      createdAt: START_AT,
      createdByUserId: userId,
      folderId: null,
    });
    pf.set(LOCAL_DOC, {
      projectId: LOCAL_PROJ,
      title,
      kind: "script",
      createdAt: START_AT,
      editedAt: START_AT,
      editedByUserId: userId,
      airDate: null,
      rundownId: null,
      trashedAt: null,
      trashedByUserId: null,
    });
    const docHandle = await openDoc(userId, LOCAL_DOC);
    writeScriptText(docHandle, "local-b1", body);
    await settle();
  }

  async function search(
    userId: string | null,
    query: string,
  ): Promise<{ status: number; body: unknown }> {
    const token = userId === null ? null : (tokens.get(userId) ?? null);
    const res = await callNode("GET", `/api/search?${query}`, { token });
    return { status: res.status, body: await res.json() };
  }

  async function reseedCloud(
    nextSeedId: string,
    docId: string,
    title: string,
    body: string,
  ): Promise<void> {
    for (const client of windowClients.values()) await drive(client.close());
    windowClients.clear();
    for (const peer of cloudPeers) peer.close(1006, "reseed");
    cloudPeers.clear();
    cloudDeferred.length = 0;
    cloudStorage.restore(emptyCloud);
    secretByte += 1;
    seedId = nextSeedId;
    startCloud();
    await seedCloudWorkspace({ docId, title, body });
  }

  return {
    core,
    records,
    nodeStorage,
    seedCloudWorkspace,
    chooses,
    openDoc,
    createLocalPrivateDoc,
    search,
    reseedCloud,
    settle,
    goOffline() {
      cloudOffline = true;
      cloudCallsWhileOffline = 0;
      core.relay.setConnection("offline", 0);
      for (const peer of cloudPeers) peer.close(1006, "offline");
      cloudPeers.clear();
    },
    cloudCallsWhileOffline: () => cloudCallsWhileOffline,
    async close(): Promise<void> {
      for (const client of windowClients.values()) await drive(client.close());
      await drive(core.close());
    },
  };
}

test("local-node answers /api/search offline for local authority and synced relayed scripts with strict access control", async () => {
  const searchDir = makeTempDir();
  const h = createHarness({ searchDir });

  // 1. Seed cloud workspace script (Dana owner, Sam viewer) + Dana's private script
  await h.seedCloudWorkspace({
    docId: CLOUD_DOC_1,
    title: "Harbour Watch",
    body: "Harbour foghorn echoes across the quay.",
    cutText: "Secret obsidian cut only for editors.",
    privateBody: "Dana keeps the velvet compass locked away.",
  });

  // 2. Dana mirrors workspace index, workspace script, and her private index + script
  await h.chooses("dana");
  await h.openDoc("dana", STUDIO_INDEX);
  await h.openDoc("dana", CLOUD_DOC_1);
  await h.openDoc("dana", indexDocId("user", "dana"));
  await h.openDoc("dana", DANA_PRIV_DOC);

  // Sam mirrors workspace index + workspace script as viewer
  await h.chooses("sam");
  await h.openDoc("sam", STUDIO_INDEX);
  await h.openDoc("sam", CLOUD_DOC_1);

  // 3. Local-only user creates an authority script offline without touching cloud
  await h.chooses("you");
  await h.createLocalPrivateDoc(
    "you",
    "Local Pilot",
    "Midnight lighthouse keepers tend the lantern.",
  );

  // 4. Cut the cloud completely offline — every search below must be answered locally
  h.goOffline();
  expect(existsSync(join(searchDir, SEARCH_INDEX_FILE))).toBe(true);

  // Local-only authority doc found offline
  const localRes = await h.search("you", "q=lighthouse");
  expect(localRes.status).toBe(200);
  expect((localRes.body as SearchResponse).results).toEqual([
    {
      docId: LOCAL_DOC,
      workspaceId: null,
      title: "Local Pilot",
      projectTitle: "Solo Film",
      kind: "script",
      changedAt: START_AT,
      excerpt: "Midnight lighthouse keepers tend the lantern.",
    },
  ]);

  // Relayed workspace script found offline by Dana (both global and workspace-scoped)
  const globalRelayed = await h.search("dana", "q=foghorn");
  expect(globalRelayed.status).toBe(200);
  expect((globalRelayed.body as SearchResponse).results).toEqual([
    {
      docId: CLOUD_DOC_1,
      workspaceId: STUDIO_WS,
      title: "Harbour Watch",
      projectTitle: "Studio Film",
      kind: "script",
      changedAt: START_AT,
      excerpt: "Harbour foghorn echoes across the quay.",
    },
  ]);

  const wsRelayed = await h.search(
    "dana",
    `q=foghorn&workspaceId=${STUDIO_WS}`,
  );
  expect(wsRelayed).toEqual(globalRelayed);

  // Editor-only cut text is searchable by owner (Dana) offline, NEVER by viewer (Sam)
  const ownerCut = await h.search(
    "dana",
    `q=obsidian&workspaceId=${STUDIO_WS}`,
  );
  expect((ownerCut.body as SearchResponse).results.map((r) => r.docId)).toEqual(
    [CLOUD_DOC_1],
  );
  const viewerBody = await h.search(
    "sam",
    `q=foghorn&workspaceId=${STUDIO_WS}`,
  );
  expect(
    (viewerBody.body as SearchResponse).results.map((r) => r.docId),
  ).toEqual([CLOUD_DOC_1]);
  const viewerCut = await h.search(
    "sam",
    `q=obsidian&workspaceId=${STUDIO_WS}`,
  );
  expect(viewerCut).toEqual({ status: 200, body: { results: [] } });

  // Strict Private-folder & workspace access isolation:
  // Dana finds her private doc; Sam and You NEVER see Dana's private doc; Sam NEVER sees You's local doc
  const danaPriv = await h.search("dana", "q=compass");
  expect((danaPriv.body as SearchResponse).results.map((r) => r.docId)).toEqual(
    [DANA_PRIV_DOC],
  );
  expect(await h.search("sam", "q=compass")).toEqual({
    status: 200,
    body: { results: [] },
  });
  expect(await h.search("you", "q=compass")).toEqual({
    status: 200,
    body: { results: [] },
  });
  expect(await h.search("sam", "q=lighthouse")).toEqual({
    status: 200,
    body: { results: [] },
  });

  // Unauthenticated -> 401; non-member workspace search -> 403
  expect(await h.search(null, "q=foghorn")).toEqual({
    status: 401,
    body: { error: "unauthenticated" },
  });
  expect(await h.search("you", `q=foghorn&workspaceId=${STUDIO_WS}`)).toEqual({
    status: 403,
    body: { error: "forbidden" },
  });

  // Zero cloud calls were made while offline
  expect(h.cloudCallsWhileOffline()).toBe(0);
  await h.close();
});

test("after cloud reseed and wipe, stale pre-reseed documents disappear and newly mirrored documents are found offline", async () => {
  const h = createHarness();

  await h.seedCloudWorkspace({
    docId: CLOUD_DOC_1,
    title: "Before Reseed",
    body: "Harbour foghorn echoes before reseed.",
  });
  await h.chooses("dana");
  await h.openDoc("dana", STUDIO_INDEX);
  await h.openDoc("dana", CLOUD_DOC_1);

  const before = await h.search("dana", `q=foghorn&workspaceId=${STUDIO_WS}`);
  expect((before.body as SearchResponse).results.map((r) => r.docId)).toEqual([
    CLOUD_DOC_1,
  ]);

  // Reseed cloud with the SAME workspace index ID and a brand-new script
  await h.reseedCloud(
    "seed-2",
    CLOUD_DOC_2,
    "After Reseed",
    "Starlight beacon signal shines after reseed.",
  );
  // Opening a fresh session after reseed triggers wipe + search cache reset + mirroring Seed 2
  await h.chooses("sam");
  await h.chooses("dana");
  await h.openDoc("dana", STUDIO_INDEX);
  await h.openDoc("dana", CLOUD_DOC_2);

  h.goOffline();
  expect(await h.search("dana", "q=foghorn")).toEqual({
    status: 200,
    body: { results: [] },
  });
  const after = await h.search("dana", `q=Starlight&workspaceId=${STUDIO_WS}`);
  expect(after.status).toBe(200);
  expect((after.body as SearchResponse).results).toEqual([
    {
      docId: CLOUD_DOC_2,
      workspaceId: STUDIO_WS,
      title: "After Reseed",
      projectTitle: "Studio Film",
      kind: "script",
      changedAt: START_AT,
      excerpt: "Starlight beacon signal shines after reseed.",
    },
  ]);
  expect(h.cloudCallsWhileOffline()).toBe(0);
  await h.close();
});
