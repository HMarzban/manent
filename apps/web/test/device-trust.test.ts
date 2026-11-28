import { expect, test } from "bun:test";
import { jsonMap, scriptBody } from "@manent/crdt";
import { clearManentData } from "@manent/client-web";
import { STORE_RETRY_MS } from "@manent/sync-client";
import type { LoadedDocument, StoredUpdate } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { followDemoSeed } from "../src/demo/use-demo.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { markOpen } from "../src/services/sync/device-trust.ts";
import type { TabPerson } from "../src/session.ts";
import { createIndexWorld } from "./index.fixtures.ts";
import type { IndexWorld, TabServices } from "./index.fixtures.ts";
import { B1, B2, B3, action } from "./review.fixtures.ts";
import { MemoryStorage } from "./services.fixtures.ts";
import { turn, until } from "./sync.fixtures.ts";

const YOU: TabPerson = Object.freeze({
  token: "token-you",
  userId: "you",
  name: "You",
});
const DEVICE_ID = "device-laptop";

/** A browser of You's that already has this device's identity. */
function knownDevice(): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", DEVICE_ID);
  return storage;
}

/** Every message the person's services show from now on, in order. */
function toldBy(you: TabServices): string[] {
  const told: string[] = [];
  you.messages.subscribe(() => {
    const text = you.messages.current()?.text;
    if (text !== undefined && told.at(-1) !== text) told.push(text);
  });
  return told;
}

/** A script of You's, open on the device, its marker written once its handle has opened. */
async function openScript(w: IndexWorld, you: TabServices): Promise<string> {
  const { docId } = await you.library.createProject("you", "film");
  you.documents.open(docId);
  await w.settleAll();
  await until(() => you.sync.memory.openMarker("you")?.docId === docId);
  return docId;
}

/** Everything `storage` holds. */
const items = (storage: MemoryStorage) =>
  Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).map(
      (key) => [key, key === null ? null : storage.getItem(key)],
    ),
  );

/** Whether closing the tab now would have the browser ask first. */
function asks(): boolean {
  const closing = new Event("beforeunload", { cancelable: true });
  globalThis.dispatchEvent(closing);
  return closing.defaultPrevented;
}

test("a browser that cleared its data says what came back and what could not", async () => {
  const w = await createIndexWorld();
  // another device of You's wrote what this one held into the private index the server keeps
  const before = await w.personServices({ person: YOU, device: "before" });
  await before.ready;
  const index = await before.sync.client.open(indexDocId("user", "you"));
  const onDevice = jsonMap(index.doc(), "on_device");
  const held = [
    ["0190f1a0-0000-7000-8000-000000000001", "The Lamp Room", true],
    ["0190f1a0-0000-7000-8000-000000000002", "Low Tide", true],
    ["0190f1a0-0000-7000-8000-000000000003", "Salt", true],
    ["0190f1a0-0000-7000-8000-000000000004", "Untitled", false],
  ] as const;
  for (const [docId, title, synced] of held)
    onDevice.set(`${DEVICE_ID}|${docId}`, { title, synced, at: 0 });
  onDevice.set(`device-other|${held[3][0]}`, {
    title: "Untitled",
    synced: false,
    at: 0,
  });
  await w.settleAll();
  await index.close();
  before.dispose();

  const after = await w.personServices({
    person: YOU,
    storage: knownDevice(),
    hadDatabase: false,
  });
  const told = toldBy(after);
  await w.settleAll();
  await until(() => told.length > 0);
  expect(told).toEqual([
    "This browser cleared Manent's offline data. 3 synced scripts are back. 'Untitled' existed only here and cannot be recovered.",
  ]);
  const kept = await after.sync.client.open(indexDocId("user", "you"));
  expect(jsonMap(kept.doc(), "on_device").keys().toSorted()).toEqual(
    [
      ...held.slice(0, 3).map(([docId]) => `${DEVICE_ID}|${docId}`),
      `device-other|${held[3][0]}`,
    ].toSorted(),
  );
});

test("a new seed clears everything this browser kept for Manent, before any store opens", async () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem("manent.device.id", DEVICE_ID);
  local.setItem("manent.seed", "seed-1");
  local.setItem("manent.sync.offline-since.you", "1794319800000");
  local.setItem("other.app", "kept");
  session.setItem("manent.demo.connection", "slow");
  const reloads: number[] = [];
  let followed = false;
  void followDemoSeed({
    demo: async () => ({ demo: true, seedId: "seed-2", control: null }),
    memory: createDeviceMemory({ local, session }),
    clear: () => clearManentData({ indexedDb: null, local, session }),
    reload: () => reloads.push(reloads.length),
  }).then(() => {
    followed = true;
  });
  await until(() => reloads.length > 0);
  for (let i = 0; i < 10; i++) await turn();
  expect({
    local: items(local),
    session: items(session),
    reloads,
    followed,
  }).toEqual({
    local: {
      "manent.device.id": DEVICE_ID,
      "manent.seed": "seed-2",
      "other.app": "kept",
    },
    session: {},
    reloads: [0],
    followed: false,
  });
});

test("after a crash the script says its last changes were already saved", async () => {
  const w = await createIndexWorld();
  const storage = knownDevice();
  const crashed = await w.personServices({ person: YOU, storage });
  const docId = await openScript(w, crashed);
  const handle = await crashed.sync.client.open(docId);
  const body = scriptBody(handle.doc());
  const first = body.materialize().content?.[0]?.content?.[0]?.attrs?.id;
  if (typeof first !== "string") throw new RangeError("no first block");
  for (const [after, id] of [
    [first, B1],
    [B1, B2],
    [B2, B3],
  ] as const)
    body.write((writer) => writer.insertBlocks(after, [action(id, "Rain.")]));
  w.world.network.partition(true);
  await w.settleAll();
  // the tab ends without leaving: nothing is closed and no pagehide comes
  await crashed.sync.dispose();

  const reopened = await w.personServices({ person: YOU, storage });
  const told = toldBy(reopened);
  reopened.documents.open(docId);
  await w.settleAll();
  expect(told).toEqual(["Your last 3 changes were already saved."]);
});

test("closing asks only while the device cannot save", async () => {
  const w = await createIndexWorld();
  const you = await w.personServices({ person: YOU });
  const docId = await openScript(w, you);
  const saving = asks();
  w.refuseChanges(docId, true);
  const handle = await you.sync.client.open(docId);
  const body = scriptBody(handle.doc());
  body.write((writer) => writer.insertBlocks(null, [action(B1, "Rain.")]));
  await w.settleAll();
  const refusing = asks();
  w.refuseChanges(docId, false);
  // the refused change is written again at the next retry
  w.world.clock.advance(STORE_RETRY_MS);
  await w.settleAll();
  expect({ saving, refusing, savingAgain: asks() }).toEqual({
    saving: false,
    refusing: true,
    savingAgain: false,
  });
  you.dispose();
});

test("markOpen scales past spread argument limits for stored entries", async () => {
  const w = await createIndexWorld();
  const you = await w.personServices({ person: YOU });
  const docId = "0190f1a0-0000-7000-8000-000000000099";
  const large = 700_000;
  const empty = new Uint8Array();
  const entries: StoredUpdate[] = [];
  for (let seq = 1; seq <= large; seq++)
    entries.push({
      kind: "update",
      localSeq: seq,
      update: empty,
      own: false,
      acked: true,
      applied: true,
      elements: [],
    });
  const loaded: LoadedDocument = {
    meta: {
      docId,
      generation: 1,
      clientIds: [],
      lastServerSeq: 0,
      ackedClocks: {},
      neverSynced: false,
      create: null,
      recovering: null,
      moving: null,
      parked: null,
      lastSyncedAt: null,
      lastDeviceVersionAt: 0,
    },
    checkpoint: null,
    syncedBase: null,
    entries,
  };
  const sync = {
    ...you.sync,
    store: {
      ...you.sync.store,
      load: async () => loaded,
    },
  };
  const stop = markOpen(sync, { docId, messages: you.messages });
  await until(() => you.sync.memory.openMarker("you") !== null);
  expect(you.sync.memory.openMarker("you")).toEqual({
    docId,
    fromLocalSeq: large + 1,
  });
  stop();
  you.dispose();
});
