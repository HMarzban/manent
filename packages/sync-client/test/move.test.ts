import { expect, test } from "bun:test";
import { createDoc, loadDoc, rebuildDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { CODE, isReplayKey } from "@manent/sync-protocol";
import type { ReplayResponse } from "@manent/sync-protocol";
import { ConnectError } from "../src/index.ts";
import type { DocHandle, StoredUpdate, SyncClient } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  listen,
  setup,
  textOf,
  typeIn,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

/** The Yjs client ID a rebuild writes the new generation under. */
const REBUILT_BY = 2;
const NO_CHANGE: ReplayResponse = {
  docId: DOC,
  generation: 2,
  serverSeq: 3,
  applied: 2,
  overlaps: [],
  setAside: [],
};
/** The server's copy, rebuilt for the next generation, with `updates` applied first. */
function rebuilt(w: World, updates: readonly Uint8Array[] = []): Uint8Array {
  const doc = loadDoc(w.server.doc(DOC).encodeState());
  for (const update of updates) doc.applyUpdate(update);
  const built = rebuildDoc(doc, { clientId: REBUILT_BY });
  if (!built.ok) throw new RangeError(`no rebuild: ${built.code}`);
  return built.doc.encodeState();
}

/** Open and synced at server sequence 7, with "draft" in B1 acknowledged. */
async function opened(): Promise<{
  w: World;
  client: SyncClient;
  h: DocHandle;
}> {
  const w = await setup();
  w.server.head = 7;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  typeIn(h, B1, "draft");
  await w.settle();
  const push = w.server.got("PUSH").at(-1)!;
  w.server.doc(DOC).applyUpdate(push.update);
  w.server.ack(DOC, push.clientSeq, 7);
  await w.settle();
  return { w, client, h };
}

/** Typed offline, then back online with the subscription not yet answered. */
async function waitingEdits(): Promise<{
  w: World;
  client: SyncClient;
  h: DocHandle;
}> {
  const made = await opened();
  const { w, client, h } = made;
  client.setOnline(false);
  await w.settle();
  typeIn(h, B1, "x");
  typeIn(h, B2, "y");
  await w.settle();
  w.server.answer.subscribe = false;
  client.setOnline(true);
  await w.settle();
  return made;
}

/** The server's copy with `updates` applied. */
function textWith(w: World, updates: readonly Uint8Array[]): string {
  const doc = loadDoc(w.server.doc(DOC).encodeState());
  for (const update of updates) doc.applyUpdate(update);
  return textOf(doc);
}

async function waitingEntries(w: World): Promise<StoredUpdate[]> {
  return (await w.store.load(DOC))!.entries.filter(
    (e): e is StoredUpdate => e.kind === "update" && e.own && !e.acked,
  );
}

async function waitingUpdates(w: World): Promise<Uint8Array[]> {
  return (await waitingEntries(w)).map((e) => e.update);
}

const editSubscribes = (w: World) =>
  w.server.got("SUBSCRIBE").filter((m) => m.mode === "edit");

const versionsOf = async (w: World) =>
  (await w.store.versions(DOC)).map((v) => [v.kind, v.label]);

test("with nothing waiting, a move reloads the one document under a new client id", async () => {
  const { w, h } = await opened();
  const { server, store } = w;
  const first = h.doc();
  const before = textOf(first);
  const events = listen(h);
  server.answer.subscribe = false;
  server.moved(DOC, 1, 2);
  await w.settle();
  expect(editSubscribes(w).at(-1)).toMatchObject({
    generation: 2,
    lastServerSeq: 0,
  });
  expect(server.replays()).toEqual([]);
  server.subscribedWithState(DOC, rebuilt(w), { generation: 2, headSeq: 1 });
  await w.settle();
  expect(h.doc().clientId).not.toBe(first.clientId);
  expect(textOf(h.doc())).toBe(before);
  expect(events).toEqual([
    { type: "replaced", reason: "generation" },
    { type: "rebuilt", applied: 0, overlaps: 0, setAside: 0 },
  ]);
  expect((await store.load(DOC))!.meta).toMatchObject({
    generation: 2,
    lastServerSeq: 1,
    moving: null,
  });
});

test("waiting edits are replayed once, under one key, then the new document is loaded", async () => {
  const { w, h } = await waitingEdits();
  const { server } = w;
  const events = listen(h);
  const waiting = await waitingUpdates(w);
  const pushed = server.got("PUSH").length;
  server.moved(DOC, 1, 2);
  await w.settle();
  const [request] = server.replays();
  expect(request).toMatchObject({
    docId: DOC,
    generation: 1,
    lastServerSeq: 7,
  });
  expect(isReplayKey(request!.key)).toBe(true);
  expect(request!.updates).toEqual(waiting);
  expect(waiting).toHaveLength(2);
  expect(await versionsOf(w)).toEqual([["device", "before_reconnect"]]);
  expect(h.status.get()).toMatchObject({ docSync: "syncing", waiting: 2 });
  server.answerReplay({ ok: true, response: NO_CHANGE });
  await w.settle();
  server.subscribedWithState(DOC, rebuilt(w, waiting), {
    generation: 2,
    headSeq: 3,
  });
  server.answer.subscribe = true;
  await w.settle();
  expect(events).toEqual([
    { type: "replaced", reason: "generation" },
    { type: "rebuilt", applied: 2, overlaps: 0, setAside: 0 },
  ]);
  expect(textOf(h.doc())).toBe("draftx\ny");
  expect(h.status.get()).toMatchObject({ synced: true, waiting: 0 });
  expect(server.replays()).toHaveLength(1);
  expect(server.got("PUSH").slice(pushed)).toEqual([]);
});

test("a replay whose answer was lost is sent again under the same key, also after a reload", async () => {
  const { w, client } = await waitingEdits();
  const { server, store, fake } = w;
  const through = Math.max(...(await waitingEntries(w)).map((e) => e.localSeq));
  server.moved(DOC, 1, 2);
  await w.settle();
  server.answerReplay(new ConnectError("unreachable"));
  await w.settle();
  expect(server.replays()).toHaveLength(1);
  fake.advance(30_000);
  await w.settle();
  const [first, second] = server.replays();
  expect(second).toEqual(first!);
  await client.close();
  expect((await store.load(DOC))!.meta.moving).toEqual({
    from: 1,
    to: 2,
    key: first!.key,
    throughLocalSeq: through,
  });
  const again = w.makeClient();
  await again.open(DOC);
  await w.online();
  expect(server.replays()).toHaveLength(3);
  expect(server.replays()[2]).toEqual(first!);
  // the closed client's request is answered first, and nothing hears it
  server.answerReplay(NO_CHANGE_ANSWER);
  server.answerReplay(NO_CHANGE_ANSWER);
  fake.advance(1);
  await w.settle();
  expect((await store.load(DOC))!.meta).toMatchObject({
    lastSyncedAt: fake.clock.now(),
    moving: { from: 1, to: 2, key: first!.key },
  });
  expect(editSubscribes(w).at(-1)).toMatchObject({ generation: 2 });
});

const NO_CHANGE_ANSWER = { ok: true, response: NO_CHANGE } as const;

test("a move whose key cannot be stored waits and sends nothing", async () => {
  const { w, h } = await waitingEdits();
  const { server, store, fake } = w;
  const doc = h.doc();
  store.refuseWrites("quota");
  server.answer.subscribe = true;
  server.moved(DOC, 1, 2);
  await w.settle();
  expect(server.replays()).toEqual([]);
  typeIn(h, B2, "z");
  expect([h.doc(), h.status.get().docSync]).toEqual([doc, "local"]);
  const subscribes = editSubscribes(w).length;
  store.refuseWrites(null);
  fake.advance(1_000);
  await w.settle();
  expect(
    editSubscribes(w)
      .slice(subscribes)
      .map((m) => m.generation),
  ).toEqual([1]);
  const [request] = server.replays();
  expect(server.replays()).toHaveLength(1);
  expect((await store.load(DOC))!.meta.moving?.key).toBe(request!.key);
  // what was typed while the store refused is replayed with the rest
  expect(textWith(w, request!.updates)).toBe("draftx\nyz");
});

test("typing while the replay is in flight is merged into the new document", async () => {
  const { w, h } = await waitingEdits();
  const { server } = w;
  server.moved(DOC, 1, 2);
  await w.settle();
  const waiting = server.replays()[0]!.updates;
  typeIn(h, B2, " later");
  await w.settle();
  server.answerReplay(NO_CHANGE_ANSWER);
  await w.settle();
  server.answer.subscribe = true;
  server.subscribedWithState(DOC, rebuilt(w, waiting), {
    generation: 2,
    headSeq: 3,
  });
  await w.settle();
  expect(textOf(h.doc())).toBe("draftx\ny later");
  const pushes = server.got("PUSH").filter((p) => p.generation === 2);
  expect(pushes).toHaveLength(1);
  const check = loadDoc(rebuilt(w, waiting));
  check.applyUpdate(pushes[0]!.update);
  expect(textOf(check)).toBe("draftx\ny later");
});

test("text an input method was composing when the document was replaced is carried into the new one", async () => {
  const { w, h } = await opened();
  const { server } = w;
  const old: CrdtDoc = h.doc();
  const heard: Uint8Array[] = [];
  old.subscribe((update) => heard.push(update));
  h.holdRemote();
  server.answer.subscribe = false;
  server.moved(DOC, 1, 2);
  await w.settle();
  server.subscribedWithState(DOC, rebuilt(w), { generation: 2, headSeq: 1 });
  await w.settle();
  scriptBody(old).write((writer) => writer.insertText(B1, 5, "é"));
  h.releaseRemote();
  await w.settle();
  expect(textOf(h.doc())).toBe("drafté\n");
  const pushes = server.got("PUSH").filter((p) => p.generation === 2);
  expect(pushes).toHaveLength(1);
  // destroyed: what is written into it now is heard by nobody
  const before = heard.length;
  scriptBody(old).write((writer) => writer.insertText(B1, 0, "?"));
  expect(heard.length).toBe(before);
});

test("overlaps and text that could not be placed become Recovered text and are counted", async () => {
  const { w, client, h } = await waitingEdits();
  const { server, store } = w;
  const events = listen(h);
  server.moved(DOC, 1, 2);
  await w.settle();
  const waiting = server.replays()[0]!.updates;
  server.answerReplay({
    ok: true,
    response: {
      ...NO_CHANGE,
      applied: 1,
      overlaps: [{ blockId: B1, text: "mine" }],
      setAside: [
        { blockId: "block-4-00000004", nearBlockId: B2, text: "gone" },
      ],
    },
  });
  await w.settle();
  server.subscribedWithState(DOC, rebuilt(w, waiting), {
    generation: 2,
    headSeq: 3,
  });
  await w.settle();
  const filed = h.recovered
    .get()
    .map((r) => [r.blockId, r.nearBlockId, r.text, r.cause]);
  expect(filed).toEqual([
    [B1, null, "mine", "overlap"],
    ["block-4-00000004", B2, "gone", "merge"],
  ]);
  expect(events.at(-1)).toEqual({
    type: "rebuilt",
    applied: 1,
    overlaps: 1,
    setAside: 1,
  });
  expect(h.status.get().recovered).toBe(2);
  await client.close();
  const g = await w.makeClient().open(DOC);
  expect(
    g.recovered.get().map((r) => [r.blockId, r.nearBlockId, r.text, r.cause]),
  ).toEqual(filed);
  expect(await store.recovered(DOC)).toHaveLength(2);
});

test("a waiting setting is sent again as it is after the move", async () => {
  const { w, h } = await opened();
  const { server } = w;
  h.setSetting("script.paper", "a4");
  await w.settle();
  const [set] = server.got("SET");
  server.moved(DOC, 1, 2);
  await w.settle();
  expect(server.replays()).toEqual([]);
  const sets = server.got("SET");
  expect(sets).toHaveLength(2);
  expect(sets[1]).toEqual({ ...set!, generation: 2 });
});

test("past the window the changes are kept as a recovered version and the script reloads", async () => {
  const { w, h } = await waitingEdits();
  const { server, store } = w;
  const mine = scriptBody(h.doc()).materialize();
  const events = listen(h);
  server.moved(DOC, 1, 2);
  await w.settle();
  server.answerReplay({ ok: false, code: "past_window" });
  await w.settle();
  const versions = await store.versions(DOC);
  expect(versions.map((v) => [v.kind, v.label])).toEqual([
    ["device", "before_reconnect"],
    ["recovered", "past_window"],
  ]);
  expect(versions[1]!.content).toEqual(mine);
  expect(events).toEqual([{ type: "past_window", versionId: versions[1]!.id }]);
  server.subscribedWithState(DOC, rebuilt(w), { generation: 2, headSeq: 1 });
  await w.settle();
  expect(textOf(h.doc())).toBe("draft\n");
  expect(h.status.get().waiting).toBe(0);
  expect(server.replays()).toHaveLength(1);
});

test("a replay the server cannot accept is kept as a recovered version", async () => {
  const refusals = [
    ["invalid", 422],
    ["incomplete", 422],
    ["unknown_generation", 409],
  ] as const;
  for (const [code, status] of refusals) {
    const { w, h } = await waitingEdits();
    const events = listen(h);
    w.server.moved(DOC, 1, 2);
    await w.settle();
    w.server.answerReplay({ ok: false, code });
    await w.settle();
    w.fake.advance(60_000);
    await w.settle();
    expect([code, await versionsOf(w)]).toEqual([
      code,
      [
        ["device", "before_reconnect"],
        ["recovered", "rejected"],
      ],
    ]);
    expect([code, events[0]]).toEqual([
      code,
      { type: "rejected", code: status, replayed: 0, setAside: 0 },
    ]);
    expect([code, w.server.replays().length]).toEqual([code, 1]);
  }
});

test("a second move during the first goes to the newest generation", async () => {
  const { w } = await opened();
  const { server } = w;
  server.answer.subscribe = false;
  server.moved(DOC, 1, 2);
  await w.settle();
  server.moved(DOC, 2, 3);
  await w.settle();
  expect(
    editSubscribes(w)
      .slice(-2)
      .map((m) => m.generation),
  ).toEqual([2, 3]);
  server.subscribedWithState(DOC, rebuilt(w), { generation: 3, headSeq: 1 });
  await w.settle();
  expect((await w.store.load(DOC))!.meta).toMatchObject({
    generation: 3,
    moving: null,
  });
});

test("a refusal of the old generation during a move changes nothing", async () => {
  const { w } = await waitingEdits();
  const { server } = w;
  server.moved(DOC, 1, 2);
  await w.settle();
  const subscribes = editSubscribes(w).length;
  server.error(DOC, {
    code: CODE.GENERATION_MISMATCH,
    message: "generation_moved",
    permanent: false,
    clientSeq: 2,
  });
  await w.settle();
  w.fake.advance(1_000);
  await w.settle();
  expect([editSubscribes(w).length, server.replays().length]).toEqual([
    subscribes,
    1,
  ]);
});

test("access lost during a move keeps the edits as a parked copy", async () => {
  const { w, h } = await waitingEdits();
  const { server, store, fake } = w;
  server.moved(DOC, 1, 2);
  await w.settle();
  const waiting = await waitingUpdates(w);
  const parkedAt = fake.clock.now();
  server.answerReplay({ ok: false, code: "forbidden" });
  await w.settle();
  fake.advance(60_000);
  await w.settle();
  const { meta } = (await store.load(DOC))!;
  expect(meta.parked).toEqual({ reason: "access_removed", parkedAt });
  expect(meta.moving).toMatchObject({ from: 1, to: 2 });
  expect(await waitingUpdates(w)).toEqual(waiting);
  expect(h.status.get().side).toEqual(["access_removed"]);
  expect(server.replays()).toHaveLength(1);
});

test("a move during the recovery of a rejected push continues the recovery in the new generation", async () => {
  const { w, h } = await opened();
  const { server, store } = w;
  typeIn(h, B2, "kept");
  await w.settle();
  server.answer.subscribe = false;
  server.error(DOC, {
    code: CODE.VALIDATION_FAILED,
    message: "invalid",
    permanent: true,
    clientSeq: server.got("PUSH").at(-1)!.clientSeq,
  });
  await w.settle();
  expect((await store.load(DOC))!.meta.recovering).toMatchObject({
    replaying: false,
  });
  server.moved(DOC, 1, 2);
  await w.settle();
  const last = editSubscribes(w).at(-1)!;
  expect(last).toMatchObject({ generation: 2 });
  expect(server.got("SYNC").at(-1)!.data).toEqual(
    createDoc().encodeStateVector(),
  );
  expect(server.replays()).toEqual([]);
  server.subscribedWithState(DOC, rebuilt(w), { generation: 2, headSeq: 1 });
  await w.settle();
  expect(textOf(h.doc())).toBe("draft\nkept");
  const push = server.got("PUSH").at(-1)!;
  expect(push).toMatchObject({ generation: 2 });
  expect((await store.load(DOC))!.meta).toMatchObject({
    generation: 2,
    recovering: { replaying: true },
  });
  server.ack(DOC, push.clientSeq, 2);
  await w.settle();
  expect((await store.load(DOC))!.meta.recovering).toBeNull();
});

test("a move with nothing waiting is taken up again after a reload", async () => {
  const { w, client } = await opened();
  const { server, store } = w;
  server.answer.subscribe = false;
  server.moved(DOC, 1, 2);
  await w.settle();
  await client.close();
  expect((await store.load(DOC))!.meta.moving).toMatchObject({
    from: 1,
    to: 2,
    key: null,
  });
  const g = await w.makeClient().open(DOC);
  await w.online();
  expect(editSubscribes(w).at(-1)).toMatchObject({
    generation: 2,
    lastServerSeq: 0,
  });
  server.subscribedWithState(DOC, rebuilt(w), { generation: 2, headSeq: 1 });
  await w.settle();
  expect([textOf(g.doc()), server.replays()]).toEqual(["draft\n", []]);
  expect((await store.load(DOC))!.meta).toMatchObject({
    generation: 2,
    moving: null,
  });
});
