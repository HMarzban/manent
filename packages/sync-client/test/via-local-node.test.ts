import { expect, test } from "bun:test";
import { loadDoc, rebuildDoc } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import {
  createMemoryStore,
  encodeUpstreamRefused,
  encodeUpstreamStatus,
} from "../src/index.ts";
import type {
  DocHandle,
  LocalStore,
  RecoveredItem,
  UpstreamStatus,
} from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  listen,
  seedState,
  setup,
  textOf,
  type,
  typeIn,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

/** What the node says of a script the server holds, every edit synced. */
const UP: UpstreamStatus = {
  v: 1,
  link: "online",
  synced: true,
  waiting: 0,
  wentOfflineAt: null,
  neverSynced: false,
  side: [],
  device: "ok",
  recovered: [],
  lastSyncedAt: null,
  handoffRefused: null,
  events: [],
};

const ITEM: RecoveredItem = {
  id: "item-1",
  docId: DOC,
  blockId: B1,
  nearBlockId: null,
  text: "the lamp went out",
  recoveredAt: 1_700_000_000_000,
  cause: "merge",
  mine: null,
  theirs: null,
  otherClientIds: [],
};

/** A window whose store is in memory, its document open and subscribed to the node. */
async function windowOnNode(): Promise<{
  w: World;
  h: DocHandle;
  store: LocalStore;
}> {
  const w = await setup();
  const store = createMemoryStore("dana");
  const client = w.makeClient({ store, via: "local_node" });
  const h = await client.open(DOC);
  await w.online();
  return { w, h, store };
}

async function upstream(w: World, status: UpstreamStatus): Promise<void> {
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "upstream_status",
    data: encodeUpstreamStatus(status),
  });
  await w.settle();
}

test("Saved on the desktop is the node's acknowledgement, Synced is the cloud's", async () => {
  const { w, h } = await windowOnNode();
  type(h, "a");
  await w.settle();
  // the memory store took it; the node has not
  expect(h.status.get()).toMatchObject({
    saved: false,
    synced: false,
    waiting: 1,
  });
  w.server.ackAll(DOC);
  await w.settle();
  expect(h.status.get()).toMatchObject({ saved: true, synced: false });
  await upstream(w, { ...UP, synced: false, waiting: 1 });
  expect(h.status.get()).toMatchObject({
    saved: true,
    synced: false,
    waiting: 1,
    link: "online",
  });
  await upstream(w, UP);
  expect(h.status.get()).toMatchObject({
    saved: true,
    synced: true,
    waiting: 0,
  });
});

test("seed 3: Synced on the desktop waits until the cloud holds the edit", async () => {
  const { w, h } = await windowOnNode();
  await upstream(w, UP);
  const before = h.status.get().synced;
  type(h, "a");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  // the node's latest status was sent before it took the edit
  const acknowledged = h.status.get();
  await upstream(w, UP);
  expect([before, acknowledged, h.status.get().synced]).toEqual([
    true,
    {
      saved: true,
      synced: false,
      waiting: 0,
      link: "online",
      docSync: "syncing",
      wentOfflineAt: null,
      neverSynced: false,
      recovered: 0,
      side: [],
    },
    true,
  ]);
});

test("a window on the desktop says synced only once it holds what the node holds", async () => {
  const w = await setup();
  w.server.answer.subscribe = false;
  const store = createMemoryStore("dana");
  const h = await w.makeClient({ store, via: "local_node" }).open(DOC);
  await w.online();
  await upstream(w, UP);
  const before = h.status.get();
  w.server.subscribedWithState(DOC, w.server.doc(DOC).encodeState());
  await w.settle();
  expect([before, h.status.get().synced]).toEqual([
    {
      saved: true,
      synced: false,
      waiting: 0,
      link: "online",
      docSync: "local",
      wentOfflineAt: null,
      neverSynced: false,
      recovered: 0,
      side: [],
    },
    true,
  ]);
});

test("a window on the desktop says synced during a move only once it holds the new document", async () => {
  const { w, h } = await windowOnNode();
  typeIn(h, B1, " typed");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  await upstream(w, UP);
  // an update from the node waits for a frame when the move loads, which applies it first
  const dana = w.server.writeAs(DOC, 77, (writer) =>
    writer.insertText(B2, 0, "dana"),
  );
  w.server.syncUpdate(DOC, dana);
  await w.settle();
  // the node moved without the typed text, which it set aside
  const kept = loadDoc(seedState());
  kept.applyUpdate(dana);
  const built = rebuildDoc(kept, { clientId: 2 });
  if (!built.ok) throw new RangeError(`no rebuild: ${built.code}`);
  const seen: string[] = [];
  h.status.subscribe((status) => {
    if (status.synced) seen.push(textOf(h.doc()));
  });
  w.server.answer.subscribe = false;
  w.server.moved(DOC, 1, 2);
  await w.settle();
  w.server.subscribedWithState(DOC, built.doc.encodeState(), {
    generation: 2,
    headSeq: 1,
  });
  await w.settle();
  expect(seen).toEqual(["\ndana"]);
});

test("the upstream's offline time, never-synced state and sides reach the window", async () => {
  const { w, h } = await windowOnNode();
  const before = [h.status.get(), h.upstream.get()];
  const offline: UpstreamStatus = {
    ...UP,
    link: "offline",
    synced: false,
    wentOfflineAt: 1_700_000_000_000,
    neverSynced: true,
    side: ["sign_in"],
  };
  await upstream(w, offline);
  expect([...before, h.status.get(), h.upstream.get()]).toEqual([
    {
      saved: true,
      synced: false,
      waiting: 0,
      link: "connecting",
      docSync: "syncing",
      wentOfflineAt: null,
      neverSynced: false,
      recovered: 0,
      side: [],
    },
    null,
    {
      saved: true,
      synced: false,
      waiting: 0,
      link: "offline",
      docSync: "syncing",
      wentOfflineAt: 1_700_000_000_000,
      neverSynced: true,
      recovered: 0,
      side: ["sign_in"],
    },
    offline,
  ]);
});

test("a failing device on the node reads as not saved, whatever the window holds", async () => {
  const { w, h } = await windowOnNode();
  await upstream(w, { ...UP, device: "failing" });
  expect(h.status.get()).toMatchObject({
    saved: false,
    synced: false,
    side: ["not_saved"],
  });
});

test("text the node set aside is the window's Recovered text", async () => {
  const { w, h } = await windowOnNode();
  await upstream(w, { ...UP, recovered: [ITEM] });
  expect([h.recovered.get(), h.status.get().recovered]).toEqual([[ITEM], 1]);
});

test("seed 9: text the window filed itself is its Recovered text beside the node's", async () => {
  const { w, h } = await windowOnNode();
  await upstream(w, { ...UP, recovered: [ITEM] });
  typeIn(h, B2, "kept");
  await w.settle();
  const [push] = w.server.got("PUSH");
  w.server.write(DOC, (writer) => writer.deleteBlock(B2));
  w.server.answer.subscribe = false;
  w.server.error(DOC, {
    code: CODE.VALIDATION_FAILED,
    message: "invalid",
    permanent: true,
    clientSeq: push!.clientSeq,
  });
  await w.settle();
  w.server.subscribedWithState(DOC, w.server.doc(DOC).encodeState());
  await w.settle();
  expect(h.recovered.get().map((item) => [item.text, item.cause])).toEqual([
    [ITEM.text, ITEM.cause],
    ["kept", "rejected"],
  ]);
});

test("a setting the cloud refused upstream drops the overlay", async () => {
  const { w, h } = await windowOnNode();
  const events = listen(h);
  h.setSetting("paper", "a4");
  await w.settle();
  const shown = h.settings.get();
  const [set] = w.server.got("SET");
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "upstream_refused",
    data: encodeUpstreamRefused(set!.clientSeq, "locked"),
  });
  await w.settle();
  expect([shown, h.settings.get(), events]).toEqual([
    { paper: "a4" },
    {},
    [{ type: "setting_refused", key: "paper", message: "locked" }],
  ]);
});

test("in this mode the window sets no text aside itself", async () => {
  const { w, h, store } = await windowOnNode();
  const events = listen(h);
  typeIn(h, B1, " typed");
  await w.settle();
  w.server.syncUpdate(
    DOC,
    w.server.write(DOC, (writer) => writer.deleteBlock(B1)),
  );
  await w.settle();
  w.frames.fire();
  await w.settle();
  expect([h.recovered.get(), await store.recovered(DOC), events]).toEqual([
    [],
    [],
    [],
  ]);
});

test("an event of the upstream reaches the window once", async () => {
  const { w, h } = await windowOnNode();
  const events = listen(h);
  const rebuilt = {
    n: 3,
    event: { type: "rebuilt", applied: 1, overlaps: 0, setAside: 0 },
  } as const;
  const past = {
    n: 4,
    event: { type: "past_window", versionId: "v4" },
  } as const;
  const restarted = {
    n: 1,
    event: { type: "past_window", versionId: "v1" },
  } as const;
  await upstream(w, { ...UP, events: [rebuilt] });
  const first = [...events];
  await upstream(w, { ...UP, events: [rebuilt, past] });
  await upstream(w, { ...UP, events: [rebuilt, past] });
  const again = [...events];
  await upstream(w, { ...UP, events: [restarted] });
  expect([first, again, events]).toEqual([
    [],
    [past.event],
    [past.event, restarted.event],
  ]);
});

test("for a relayed document the window's own move says nothing", async () => {
  const seen = [];
  for (const neverSynced of [false, true]) {
    const { w, h } = await windowOnNode();
    await upstream(w, { ...UP, neverSynced });
    const events = listen(h);
    w.server.answer.subscribe = false;
    w.server.moved(DOC, 1, 2);
    await w.settle();
    const doc = loadDoc(w.server.doc(DOC).encodeState());
    const built = rebuildDoc(doc, { clientId: 2 });
    if (!built.ok) throw new RangeError(`no rebuild: ${built.code}`);
    w.server.subscribedWithState(DOC, built.doc.encodeState(), {
      generation: 2,
      headSeq: 1,
    });
    await w.settle();
    seen.push(events);
  }
  expect(seen).toEqual([
    [{ type: "replaced", reason: "generation" }],
    [
      { type: "replaced", reason: "generation" },
      { type: "rebuilt", applied: 0, overlaps: 0, setAside: 0 },
    ],
  ]);
});

test("the day the script last synced is the cloud's, not the node's", async () => {
  const { w, h, store } = await windowOnNode();
  const lastSynced = async () => (await store.load(DOC))!.meta.lastSyncedAt;
  const subscribed = await lastSynced();
  await upstream(w, { ...UP, lastSyncedAt: 1_699_990_000_000 });
  type(h, "a");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  const acknowledged = await lastSynced();
  type(h, "b");
  await w.settle();
  w.server.answer.subscribe = false;
  w.server.moved(DOC, 1, 2);
  await w.settle();
  w.server.answerReplay({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 3,
      applied: 1,
      overlaps: [],
      setAside: [],
    },
  });
  await w.settle();
  expect([
    subscribed,
    acknowledged,
    w.server.replays().length,
    await lastSynced(),
  ]).toEqual([null, 1_699_990_000_000, 1, 1_699_990_000_000]);
});
