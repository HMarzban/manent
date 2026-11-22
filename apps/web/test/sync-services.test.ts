import { afterEach, expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { StoreError } from "@manent/sync-client";
import type {
  DocMeta,
  DocSummary,
  LinkFacts,
  SyncClient,
} from "@manent/sync-client";
import { createMessageQueue, createValue, statusText } from "@manent/ui";
import type { StatusWords } from "@manent/ui";
import { createApi } from "../src/api.ts";
import type { DocumentServices } from "../src/services/ports.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { createSyncDocumentSource } from "../src/services/sync/document-source.ts";
import { startDrain } from "../src/services/sync/drain.ts";
import type { SyncHooks } from "../src/services/sync/sync-hooks.ts";
import { MemoryStorage, RefusingStorage } from "./services.fixtures.ts";
import {
  DANA,
  ONLINE_LINK,
  START,
  SYNCED_STATUS,
  createSyncWorld,
  fakeClient,
  fakeSync,
  fakeHandle,
  settle,
  turn,
  until,
} from "./sync.fixtures.ts";
import type { FakeHandle, SyncWorld } from "./sync.fixtures.ts";

const DOC = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__manent");
});

const sentence = (words: StatusWords): string =>
  words.spans || words.device === null
    ? words.server
    : `${words.device} · ${words.server}`;

/** What a document's status says, as one sentence. */
const said = (doc: DocumentServices): string =>
  sentence(statusText(doc.status.get()));

/** Each item of `storage`, by key. */
const items = (storage: Storage): Record<string, string | null> =>
  Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? "")
      .toSorted()
      .map((key) => [key, storage.getItem(key)]),
  );

/** The document source over `sync`, and its messages. */
function sourceOver(world: SyncWorld, sync: Promise<PersonSync>) {
  const { clock } = world.fake;
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });
  const source = createSyncDocumentSource({
    signedIn: false,
    sync,
    review: { openCount: () => createValue(0), follow: () => () => {} },
    opened: () => () => {},
    titles: () => "Low Tide",
    messages,
    now: clock.now,
    schedule: clock.schedule,
    removedInfo: async () => null,
  });
  return { source, messages };
}

function storedMeta(docId: string): DocMeta {
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
    moving: null,
  };
}

test("a document opens from the device before anything is asked of the server", async () => {
  const world = createSyncWorld();
  const store = world.space.store(DANA.userId);
  await store.create(storedMeta(DOC));
  await store.checkpoint(DOC, createDoc().encodeState(), 0, true);
  const { source } = sourceOver(world, world.personSync());
  const doc = source.open(DOC);
  await until(() => !doc.status.get().neverSynced);
  expect([said(doc), world.server.got().length]).toEqual([
    "Saved · Syncing…",
    0,
  ]);
});

test("a keystroke that changes no fact of the status leaves the status as it was", async () => {
  const world = createSyncWorld();
  const handle = fakeHandle(DOC, createDoc());
  const typed = { ...SYNCED_STATUS, synced: false, waiting: 1 };
  handle.status.set(typed);
  const { source } = sourceOver(
    world,
    Promise.resolve(fakeSync(fakeClient(() => handle))),
  );
  const { status } = source.open(DOC);
  await until(() => !status.get().neverSynced);
  const heard: string[] = [];
  status.subscribe((facts) => heard.push(sentence(statusText(facts))));
  world.fake.advance(1_000);
  // a keystroke is saved on this device a moment after it is typed
  handle.status.set({ ...typed, saved: false });
  handle.status.set(typed);
  handle.status.set({ ...typed, waiting: 2 });
  expect(heard).toEqual(["Saved · Syncing…"]);
});

test("offline since survives a reload and is cleared only by a connection", async () => {
  const world = createSyncWorld();
  const s = await world.personSync();
  await settle(world.network);
  world.fake.advance(1_000);
  s.client.setOnline(false);
  await settle(world.network);
  expect(s.offlineSince.get()).toBe(START + 1_000);
  await s.dispose();

  // the same tab, reloaded later, still offline
  world.fake.advance(60_000);
  const again = await world.personSync();
  again.client.setOnline(false);
  await settle(world.network);
  expect(again.offlineSince.get()).toBe(START + 1_000);
  again.client.setOnline(true);
  await settle(world.network);
  expect([
    again.offlineSince.get(),
    world.storage.getItem("manent.sync.offline-since.dana"),
  ]).toEqual([null, null]);
});

test("the device keys are the fixed ones", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const memory = createDeviceMemory({ local, session });
  memory.setOfflineSince("dana", 1_794_319_800_000);
  memory.setOpenMarker("dana", { docId: DOC, fromLocalSeq: 12 });
  const room = { id: "medium", name: "Writers' room", seeding: null };
  memory.setWorkspaces("dana", [room]);
  memory.setSeed("seed-7");
  memory.setConnection("slow");
  local.setItem("manent.prefs.dana", '{"appearance.theme@device-1":1}');
  local.setItem("manent.keys.dana", '{"edit.undo@device-1":2}');
  expect([items(local), items(session)]).toEqual([
    {
      "manent.keys.dana": '{"edit.undo@device-1":2}',
      "manent.prefs.dana": '{"appearance.theme@device-1":1}',
      "manent.seed": "seed-7",
      "manent.sync.offline-since.dana": "1794319800000",
      "manent.sync.open.dana": `{"docId":"${DOC}","fromLocalSeq":12}`,
      "manent.sync.workspaces.dana":
        '[{"id":"medium","name":"Writers\' room","seeding":null}]',
    },
    { "manent.demo.connection": "slow" },
  ]);
  expect([
    memory.offlineSince("dana"),
    memory.openMarker("dana"),
    memory.workspaces("dana"),
    memory.seed(),
    memory.connection(),
    memory.takeLegacyMaps("dana"),
    memory.takeLegacyMaps("dana"),
  ]).toEqual([
    1_794_319_800_000,
    { docId: DOC, fromLocalSeq: 12 },
    [room],
    "seed-7",
    "slow",
    {
      prefs: { "appearance.theme@device-1": 1 },
      keys: { "edit.undo@device-1": 2 },
    },
    { prefs: null, keys: null },
  ]);

  const refusing = createDeviceMemory({
    local: new RefusingStorage(),
    session: new RefusingStorage(),
  });
  refusing.setOfflineSince("dana", 1_000);
  refusing.setOpenMarker("dana", { docId: DOC, fromLocalSeq: 1 });
  refusing.setWorkspaces("dana", [room]);
  refusing.setSeed("seed-7");
  refusing.setConnection("offline");
  expect([
    refusing.offlineSince("dana"),
    refusing.openMarker("dana"),
    refusing.workspaces("dana"),
    refusing.seed(),
    refusing.connection(),
    refusing.takeLegacyMaps("dana"),
  ]).toEqual([null, null, null, null, null, { prefs: null, keys: null }]);
});

test("documents with changes waiting sync without being opened, three at a time", async () => {
  const ids = ["d1", "d2", "d3", "d4", "d5"];
  const summaries: DocSummary[] = [
    ...ids.map((docId) => ({
      docId,
      neverSynced: false,
      waiting: 2,
      parked: null,
      recovered: 0,
    })),
    { docId: "d6", neverSynced: false, waiting: 0, parked: null, recovered: 0 },
  ];
  const handles = new Map<string, FakeHandle>();
  const client = fakeClient((docId) => {
    const handle = fakeHandle(docId, createDoc());
    handle.status.set({ ...SYNCED_STATUS, synced: false, waiting: 2 });
    handles.set(docId, handle);
    return handle;
  }, summaries);
  const openNow = () =>
    [...handles.values()].filter((h) => h.closes() === 0).map((h) => h.docId);
  const stop = startDrain({
    client,
    parallel: 3,
    trigger: createValue({ ...ONLINE_LINK, state: "offline" }),
  });
  await turn();
  expect(client.opened).toEqual([]);
  stop();

  const trigger = createValue<LinkFacts>({ ...ONLINE_LINK, state: "offline" });
  const stopAgain = startDrain({ client, parallel: 3, trigger });
  trigger.set(ONLINE_LINK);
  const seen: string[][] = [];
  for (let round = 0; round < 6; round++) {
    await turn();
    seen.push(openNow());
    const [first] = openNow();
    handles
      .get(first ?? "")
      ?.status.set({ ...SYNCED_STATUS, synced: true, waiting: 0 });
  }
  stopAgain();
  expect([client.opened, seen]).toEqual([
    ids,
    [
      ["d1", "d2", "d3"],
      ["d2", "d3", "d4"],
      ["d3", "d4", "d5"],
      ["d4", "d5"],
      ["d5"],
      [],
    ],
  ]);
  expect([...handles.values()].map((h) => h.closes())).toEqual([1, 1, 1, 1, 1]);
});

test("a document the device cannot open waits for the next drain, and the others still sync", async () => {
  const summaries: DocSummary[] = ["d1", "d2"].map((docId) => ({
    docId,
    neverSynced: false,
    waiting: 1,
    parked: null,
    recovered: 0,
  }));
  const synced = fakeHandle("d2", createDoc());
  const client = fakeClient(() => synced, summaries);
  let listing = true;
  const failing: SyncClient = {
    ...client,
    open: (docId) =>
      docId === "d1"
        ? Promise.reject(new StoreError("unavailable"))
        : client.open(docId),
    documents: () =>
      listing
        ? client.documents()
        : Promise.reject(new StoreError("unavailable")),
  };
  const trigger = createValue<LinkFacts>({ ...ONLINE_LINK, state: "offline" });
  const stop = startDrain({ client: failing, parallel: 1, trigger });
  trigger.set(ONLINE_LINK);
  await until(() => synced.closes() === 1);
  listing = false;
  trigger.set({ ...ONLINE_LINK, state: "offline" });
  trigger.set(ONLINE_LINK);
  await turn();
  stop();
  expect([client.opened, synced.closes()]).toEqual([["d2"], 1]);
});

test("the browser's online, visible and focus events ask for a connection at once", async () => {
  const world = createSyncWorld();
  world.network.partition(true);
  await world.personSync();
  // failed connects wait longer each time: long past the half second a connect asked for waits
  for (let i = 0; i < 8; i++) {
    world.fake.advance(30_000);
    await settle(world.network);
  }
  const asked = [world.connects()];
  for (const [event, visible] of [
    ["online", true],
    ["visibilitychange", false],
    ["visibilitychange", true],
    ["focus", true],
  ] as const) {
    world.visible.now = visible;
    world.events.dispatchEvent(new Event(event));
    // the client spreads an asked-for connect over its jitter: half of it at the fixed draw
    world.fake.advance(500);
    await settle(world.network);
    asked.push(world.connects());
  }
  expect(asked.map((n) => n - (asked[0] ?? 0))).toEqual([0, 1, 1, 2, 3]);
});

test("a script setting is shown at once and is a request", async () => {
  const world = createSyncWorld();
  const { source, messages } = sourceOver(world, world.personSync());
  const { scriptBag } = source.open(DOC);
  await settle(world.network);
  world.server.refusingSettings = true;
  scriptBag.write({ "script.paper": "a4" });
  expect(scriptBag.read()).toEqual({ "script.paper": "a4" });
  await settle(world.network);
  expect([
    world.server.got("SET").map((m) => m.key),
    scriptBag.read(),
    messages.current()?.text,
  ]).toEqual([
    ["script.paper"],
    {},
    "Your change to paper size was made before page numbers were locked and was not applied.",
  ]);
});

test("the test hooks exist only in the test flavour", async () => {
  const production = createSyncWorld();
  await production.personSync();
  expect(Reflect.has(globalThis, "__manent")).toBe(false);

  const world = createSyncWorld();
  const page: { sync?: SyncHooks } = {};
  Reflect.set(globalThis, "__manent", page);
  const sync = world.personSync();
  const { source } = sourceOver(world, sync);
  const doc = source.open(DOC);
  await settle(world.network);
  expect([said(doc), page.sync?.connections()]).toEqual(["Saved · Synced", 1]);
  page.sync?.refuseStore("quota");
  const handle = await (await sync).client.open(DOC);
  scriptBody(handle.doc()).write((w) =>
    w.insertBlocks(null, [
      { type: "block", attrs: { id: "block-one-000001", type: "action" } },
    ]),
  );
  await settle(world.network);
  expect(said(doc)).toBe("Not saved on this device · Synced");
  await (await sync).dispose();
  expect([
    Reflect.has(page, "sync"),
    Reflect.get(globalThis, "__manent"),
  ]).toEqual([false, page]);
});

test("a fact laid over by the test hooks reaches the status and the messages", async () => {
  const world = createSyncWorld();
  const page: { sync?: SyncHooks } = {};
  Reflect.set(globalThis, "__manent", page);
  const { source, messages } = sourceOver(world, world.personSync());
  const doc = source.open(DOC);
  await settle(world.network);
  page.sync?.inject(DOC, { issue: "sign_in" });
  const signIn = said(doc);
  page.sync?.inject(DOC, { side: "deleted" });
  const deleted = said(doc);
  page.sync?.inject(DOC, {
    event: { type: "receipt", sent: 4, setAside: 0, overlaps: 0 },
  });
  expect([signIn, deleted, messages.current()?.text]).toEqual([
    "Saved · Sign in to sync",
    "Saved · Deleted",
    "4 changes synced",
  ]);
});

test("who deleted a script is asked of the server, and no record of it is no answer", async () => {
  const removed = {
    deletedByUserId: "dana",
    deletedByName: "Dana Reyes",
    deletedAt: START,
  };
  const answers = [
    Response.json(removed),
    Response.json({ error: "not_found" }, { status: 404 }),
    Response.json({ error: "bad_request" }, { status: 400 }),
  ];
  const asked: [string, string | null, unknown][] = [];
  const answer = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    asked.push([String(input), headers.get("Authorization"), init?.body]);
    const next = answers.shift();
    if (next === undefined) throw new TypeError("Failed to fetch");
    return next;
  };
  const api = createApi({
    fetch: Object.assign(answer, { preconnect: fetch.preconnect }),
    getToken: () => "token-dana",
  });
  expect(await api.removedDoc(DOC)).toEqual(removed);
  expect(await api.removedDoc(DOC)).toBeNull();
  await expect(api.removedDoc(DOC)).rejects.toThrow(
    "POST /api/docs/removed answered 400",
  );
  await expect(api.removedDoc(DOC)).rejects.toThrow(TypeError);
  expect(asked[0]).toEqual([
    "/api/docs/removed",
    "Bearer token-dana",
    `{"docId":"${DOC}"}`,
  ]);
});
