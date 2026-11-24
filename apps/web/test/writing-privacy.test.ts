import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { StoreError, createSyncClient, soloLeader } from "@manent/sync-client";
import type {
  DocHandle,
  SyncClient,
  SyncClientPorts,
} from "@manent/sync-client";
import {
  createMemoryNetwork,
  createMemoryStoreSpace,
  memoryTabs,
} from "@manent/sync-client/testing";
import type {
  MemoryNetwork,
  MemoryStoreSpace,
} from "@manent/sync-client/testing";
import { createFrameDecoder, indexDocId } from "@manent/sync-protocol";
import { createWorld } from "@manent/testkit";
import { createMessageQueue, createValue } from "@manent/ui";
import { createEditorControl } from "../src/editor-host/control.ts";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { liveEditor } from "../src/editor-host/live-editor.ts";
import { createSyncSessions } from "../src/editor-host/sync-sessions.ts";
import { createPersonServices } from "../src/services/services.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { writingActions } from "../src/state/writing.store.ts";
import { startHandIn } from "../src/writing/hand-in-flow.ts";
import type { HandInOutcome } from "../src/writing/requests.ts";
import { SAM, createIndexWorld } from "./index.fixtures.ts";
import {
  MemoryStorage,
  V1,
  createClock,
  createNavigation,
  fakeApi,
  fixedRandom,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import {
  fakeClient,
  fakeHandle,
  scriptedServer,
  settle,
  turn,
  until,
} from "./sync.fixtures.ts";

withDom();

const DOC_A = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";
const COPY_A = "5d2e8a41-7b3c-4f19-8e06-a9c4b7d3e2f1";
const DOC_B = "7c41e9d2-5b8a-4f36-a1c0-e2d94b6f3a85";
const COPY_B = "2a9f5c13-8e47-4b62-9d0e-c5b1a7f4e396";
const COPY_C = "9e1b3d57-4a6c-4f80-b2e4-1c8d5a3f7b92";

const DEFAULT_INDEX = fakeHandle(indexDocId("user", "dana"), createDoc());
const DEFAULT_BINDABLE = {
  userId: "dana",
  openHandle: async () => DEFAULT_INDEX,
};

const noop = (): void => {};

const block = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

const textOf = (doc: ReturnType<typeof createDoc>): string[] =>
  blocksOf(scriptBody(doc).materialize()).map(blockText);

function docWith(text: string): ReturnType<typeof createDoc> {
  const doc = createDoc();
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [block("block-one-000001", text)]),
  );
  return doc;
}

const FRAMES = {
  request(fn: () => void) {
    let live = true;
    queueMicrotask(() => {
      if (live) fn();
    });
    return () => {
      live = false;
    };
  },
};

function clientOn(options: {
  network: MemoryNetwork;
  space: MemoryStoreSpace;
  clock: SyncClientPorts["clock"];
  leader: SyncClientPorts["leader"];
  seed?: number;
}): SyncClient {
  let clientId = (options.seed ?? 1) * 100;
  return createSyncClient({
    userId: "dana",
    deviceId: "device-1",
    build: "test",
    versions: V1,
    minServer: V1,
    ports: {
      transport: options.network.transport("dana"),
      store: options.space.store("dana"),
      leader: options.leader,
      clock: options.clock,
      random: { ...fixedRandom(), clientId: () => ++clientId },
      frames: FRAMES,
    },
  });
}

afterEach(() => {
  writingActions.bind(DEFAULT_BINDABLE);
  document.body.replaceChildren();
});

test("a first visit binding immediately waits for private index creation and syncs cleanly", async () => {
  const w = await createIndexWorld();
  const { clock } = w.world.clock;
  const storage = new MemoryStorage();
  const started: { sync: Promise<PersonSync> | null } = { sync: null };
  const services = createPersonServices({
    ...testEnvironment({
      now: clock.now,
      schedule: clock.schedule,
      storage,
      language: "en-GB",
      startSync: (person, deviceId) => {
        const sync = createPersonSync({
          person,
          baseUrl: "http://manent.test",
          deviceId,
          build: "test",
          versions: V1,
          minServer: V1,
          ports: {
            transport: w.world.network.transport(person.userId),
            store: w.space().store(person.userId),
            leader: soloLeader("tab-1"),
            clock,
            random: fixedRandom(),
            frames: { request: (fn) => clock.schedule(fn, 16) },
          },
          memory: createDeviceMemory({ local: storage, session: null }),
          onlineEvents: null,
          visible: () => true,
          now: clock.now,
        });
        started.sync = sync;
        return sync;
      },
    }),
    person: SAM,
    demo: createValue(false),
    api: fakeApi({
      me: async () => ({
        ok: true,
        me: { userId: SAM.userId, name: SAM.name, workspaces: [] },
      }),
    }),
    usePerson: createPersonStore(null),
    router: createNavigation({ routeId: "/", href: "/", search: {} })
      .navigation,
  });

  // Cold mount calls bind before services.ready has finished dynamic imports and openPrivateIndex
  writingActions.bind(services);
  try {
    await services.ready;
    await w.settleAll();
    const userIndexId = indexDocId("user", SAM.userId);
    const handle = await services.openHandle(userIndexId);
    await until(
      () => handle.status.get().synced || handle.status.get().side.length > 0,
    );
    const status = handle.status.get();
    await handle.close();
    expect([status.synced, status.side, w.serverHomeOf(userIndexId)]).toEqual([
      true,
      [],
      "user:sam",
    ]);
  } finally {
    services.dispose();
  }
});

test("a tab locks the shared script read-only when another tab chooses Privately before its copy entry arrives", async () => {
  const world = await createWorld({
    seed: 1,
    users: ["dana"],
    devicesPerUser: 0,
  });
  const { network } = world;
  const { clock } = world.clock;
  const space = createMemoryStoreSpace();
  const space3 = createMemoryStoreSpace();
  const tabs = memoryTabs();
  const userIndexId = indexDocId("user", "dana");
  const pushedDocs: string[] = [];
  const rawTransport = network.transport("dana");
  const watchedTransport: SyncClientPorts["transport"] = {
    async connect(handlers) {
      const connection = await rawTransport.connect(handlers);
      const decoder = createFrameDecoder({ from: "client" });
      return {
        send(frame) {
          const read = decoder.push(frame);
          if (read.kind === "message" && read.message.type === "PUSH")
            pushedDocs.push(read.message.docId);
          connection.send(frame);
        },
        close: (code, reason) => connection.close(code, reason),
      };
    },
    createDocument: (request) => rawTransport.createDocument(request),
    replay: (request) => rawTransport.replay(request),
  };

  const client1 = createSyncClient({
    userId: "dana",
    deviceId: "device-1",
    build: "test",
    versions: V1,
    minServer: V1,
    ports: {
      transport: watchedTransport,
      store: space.store("dana"),
      leader: tabs.port("tab-1"),
      clock,
      random: { ...fixedRandom(), clientId: () => 101 },
      frames: FRAMES,
    },
  });
  const client2 = clientOn({
    network,
    space,
    clock,
    leader: tabs.port("tab-2"),
    seed: 2,
  });
  const client3 = clientOn({
    network,
    space: space3,
    clock,
    leader: soloLeader("device-3"),
    seed: 3,
  });

  // Seed DOC_B, COPY_B, and userIndexId on the real server
  const home = {
    kind: "project" as const,
    id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5",
  };
  const userHome = { kind: "user" as const, id: "dana" };
  for (const [id, kind, docHome] of [
    [DOC_B, "script", home],
    [COPY_B, "private", userHome],
    [userIndexId, "index", userHome],
  ] as const) {
    world.storage.directory.place(id, docHome, kind, "dana");
    world.storage.open(docHome).log.create({
      id,
      kind,
      ownerUserId: kind === "private" ? "dana" : null,
      schemaVersion: V1.schema,
      engineVersion: V1.engine,
    });
    world.storage.directory.setRole(id, "dana", "owner", []);
  }
  const room3 = await client3.open(DOC_B);
  const copy3 = await client3.open(COPY_B);
  const idx3 = await client3.open(userIndexId);
  await until(
    () =>
      !room3.status.get().neverSynced &&
      !copy3.status.get().neverSynced &&
      !idx3.status.get().neverSynced,
    () => world.settle(),
  );
  scriptBody(room3.doc()).write((w) =>
    w.insertBlocks(null, [block("block-room-00001", "Shared room text.")]),
  );
  scriptBody(copy3.doc()).write((w) =>
    w.insertBlocks(null, [block("block-copy-00001", "Private copy text.")]),
  );
  await until(
    () =>
      room3.status.get().synced &&
      room3.status.get().waiting === 0 &&
      copy3.status.get().synced &&
      copy3.status.get().waiting === 0 &&
      idx3.status.get().synced,
    () => world.settle(),
  );

  writingActions.bind({
    userId: "dana",
    openHandle: (docId) => client1.open(writingActions.openTarget(docId)),
  });
  const session = createSyncSessions({
    client: Promise.resolve(client1),
    schedule: clock.schedule,
  }).open(DOC_B, "screenplay");
  const idx2 = await client2.open(userIndexId, {
    create: { kind: "index", home: "user", workspaceId: null },
  });
  await until(
    () =>
      writingActions.isWritable(DOC_B) &&
      textOf(session.doc())[0] === "Shared room text.",
    () => world.settle(),
  );

  const services = testServices({ userId: "dana" });
  const element = document.body.appendChild(document.createElement("div"));
  const mount = createEditorMount({
    sessions: { open: () => session },
    services: () => services,
    control: createEditorControl(),
    keys: { resolve: () => null, run: () => false },
    ports: {
      fonts: { add: noop },
      makeFace: () => ({ load: () => new Promise<never>(noop) }),
      wait: () => new Promise<never>(noop),
      defer: (run) => run(),
      whenIdle: noop,
      userAgent: "test",
    },
    frames: FRAMES,
    timers: clock,
    platform: "mac",
    ids: () => "block-next-00001",
    random: () => "r",
  });
  const disposeMount = mount.mount({
    docId: DOC_B,
    element,
    facts: { publish: noop },
    outline: { publish: noop },
    settings: services.openScriptStore(DOC_B),
    guard: { enter: noop, leave: noop },
  });
  await until(() => liveEditor(DOC_B)?.view.editable === true);
  const pushesBefore = pushedDocs.filter((id) => id === DOC_B).length;

  // Device 3 queues private_copies push without settling network; Tab 2 sets writing over BroadcastChannel first
  jsonMap(idx3.doc(), "private_copies").set(DOC_B, {
    privateDocId: COPY_B,
    createdAt: 1000,
    handedInAt: null,
  });
  jsonMap(idx2.doc(), "writing").set(DOC_B, { position: "private", at: 1001 });
  await until(() => writingActions.index()?.writing.get(DOC_B) !== null);

  const writableBeforeCopies = writingActions.isWritable(DOC_B);
  const readOnlyBeforeCopies = session.readOnly.get() !== null;
  const view = liveEditor(DOC_B)?.view;
  const editableBeforeCopies = view?.editable ?? null;
  if (view !== undefined) view.dispatch(view.state.tr.insertText("LEAK ", 2));
  await turn();
  world.clock.advance(50);
  await turn();

  // Once WebSocket delivers private_copies, Tab 1 swaps to COPY_B and unlocks
  await until(
    () =>
      textOf(session.doc())[0] === "Private copy text." &&
      writingActions.isWritable(DOC_B),
    () => world.settle(),
  );
  const pushesForRoomDuringLock =
    pushedDocs.filter((id) => id === DOC_B).length - pushesBefore;
  const roomAfterSettle = textOf(room3.doc());
  const writableAfterCopies = writingActions.isWritable(DOC_B);
  const readOnlyAfterCopies = session.readOnly.get();

  disposeMount();
  session.close();
  await room3.close();
  await copy3.close();
  await idx2.close();
  await idx3.close();
  await client1.close();
  await client2.close();
  await client3.close();

  expect([
    writableBeforeCopies,
    readOnlyBeforeCopies,
    editableBeforeCopies,
    pushesForRoomDuringLock,
    roomAfterSettle,
    writingActions.openTarget(DOC_B),
    writableAfterCopies,
    readOnlyAfterCopies,
  ]).toEqual([
    false,
    true,
    false,
    0,
    ["Shared room text."],
    COPY_B,
    true,
    null,
  ]);
});

test("a hand-in in a following tab waits until unsaved local edits reach the leader and server", async () => {
  const network = createMemoryNetwork({ random: () => 0 });
  const server = scriptedServer(network);
  const space = createMemoryStoreSpace();
  const tabs = memoryTabs();
  const clock = createClock();

  scriptBody(server.doc(COPY_C)).write((w) =>
    w.insertBlocks(null, [block("block-priv-00001", "Initial private.")]),
  );

  const client1 = clientOn({
    network,
    space,
    clock,
    leader: tabs.port("tab-1"),
    seed: 4,
  });
  const client2 = clientOn({
    network,
    space,
    clock,
    leader: tabs.port("tab-2"),
    seed: 5,
  });
  const copy1 = await client1.open(COPY_C);
  const copy2 = await client2.open(COPY_C);
  await settle(network);

  // Edit in follower tab 2 and immediately start hand-in before tab/network flush
  scriptBody(copy2.doc()).write((w) =>
    w.insertText("block-priv-00001", "Initial private.".length, " Last edit."),
  );
  const statusRightAfterEdit = copy2.status.get();
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });
  let requestCalls = 0;
  let serverTextAtRequest: string[] = [];
  const handIn = startHandIn(
    { openHandle: () => client2.open(COPY_C), messages },
    DOC_A,
    {
      key: "0123456789abcdef0123456789abcdef",
      now: clock.now,
      async request() {
        requestCalls += 1;
        serverTextAtRequest = textOf(server.doc(COPY_C));
        return {
          ok: true,
          handedIn: { versionId: "v1", scenes: 1, overlaps: 0 },
        } satisfies HandInOutcome;
      },
    },
  );
  await turn();
  const callsBeforeFlush = requestCalls;

  await settle(network);
  const outcome = await handIn.outcome;

  await copy1.close();
  await copy2.close();
  await client1.close();
  await client2.close();

  expect([
    statusRightAfterEdit.saved,
    statusRightAfterEdit.synced,
    statusRightAfterEdit.waiting,
    callsBeforeFlush,
    requestCalls,
    serverTextAtRequest,
    outcome,
  ]).toEqual([
    false,
    true,
    0,
    0,
    1,
    ["Initial private. Last edit."],
    { ok: true, handedIn: { versionId: "v1", scenes: 1, overlaps: 0 } },
  ]);
});

test("an unbound private document is not writable or bound before its session settles, and a non-local move clears a stale copy", async () => {
  const index = fakeHandle(indexDocId("user", "sam"), createDoc());
  writingActions.bind({ userId: "sam", openHandle: async () => index });
  await until(() => writingActions.index() !== null);

  // Part 1: binding === undefined while position === "private"
  const room = fakeHandle(DOC_A, docWith("Room."));
  let openRoom!: (handle: DocHandle) => void;
  const pendingClient: SyncClient = {
    ...fakeClient(() => room),
    open: (docId) =>
      docId === DOC_A
        ? new Promise<DocHandle>((resolve) => {
            openRoom = resolve;
          })
        : Promise.reject(new StoreError("unavailable")),
  };
  const session = createSyncSessions({
    client: Promise.resolve(pendingClient),
    schedule: createClock().schedule,
  }).open(DOC_A, "screenplay");
  await turn();

  writingActions.keep(DOC_A, {
    position: "private",
    at: 100,
    privateDocId: COPY_A,
  });
  const writableWhileUnbound = writingActions.isWritable(DOC_A);
  let settledOutcome: string | null = null;
  const boundPromise = writingActions.whenBound(DOC_A, COPY_A).then((out) => {
    settledOutcome = out;
    return out;
  });
  await turn();
  const outcomeWhileUnbound = settledOutcome;

  openRoom(room);
  const finalOutcome = await boundPromise;
  session.close();

  // Part 2: stale made entry cleared on non-local move
  const idx = writingActions.index();
  writingActions.keep(DOC_A, {
    position: "private",
    at: 10,
    privateDocId: COPY_A,
  });
  idx?.writing.set(DOC_A, { position: "everyone", at: 20 });
  idx?.copies.set(DOC_A, {
    privateDocId: COPY_B,
    createdAt: 25,
    handedInAt: 40,
  });
  idx?.writing.set(DOC_A, { position: "private", at: 30 });

  expect([
    writableWhileUnbound,
    outcomeWhileUnbound,
    finalOutcome,
    writingActions.openTarget(DOC_A),
    writingActions.writingPositionOf(DOC_A).get(),
    writingActions.isWritable(DOC_A),
  ]).toEqual([false, null, "refused", DOC_A, "everyone", false]);
});
