import { expect, test } from "bun:test";
import {
  createDoc,
  deletionsOf,
  loadDoc,
  scriptBody,
  updateMeta,
} from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import * as entry from "../src/index.ts";
import type { DeviceVersion, DocHandle } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  block,
  listen,
  seededMeta,
  setup,
  subscribed,
  textAfter,
  textOf,
  type,
  typeIn,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const A = "block-A-0000000";
const B = "block-B-0000000";
const C = "block-C-0000000";
const D = "block-D-0000000";
const N = "block-N-0000000";
const X = "block-X-0000000";
const Y = "block-Y-0000000";
/** The empty state vector a fresh SUBSCRIBE of a recovery sends. */
const EMPTY_VECTOR = createDoc().encodeStateVector();

/** A script of these blocks, written by the server's own client. */
function stateOf(blocks: [string, string][]): Uint8Array {
  const doc = createDoc({ clientId: 1 });
  scriptBody(doc).write((w) =>
    w.insertBlocks(
      null,
      blocks.map(([id, text]) => block(id, text)),
    ),
  );
  return doc.encodeState();
}

/** DOC2 as this device last synced it, and as the server holds it now. */
async function seed2(w: World, synced: Uint8Array, server: Uint8Array) {
  await w.store.create({ ...seededMeta(DOC2), lastServerSeq: 10 });
  await w.store.checkpoint(DOC2, synced, 0, true);
  w.server.doc(DOC2).applyUpdate(server);
  w.server.head = 10;
}

function write(h: DocHandle, fn: (w: BlockWriter) => void): void {
  scriptBody(h.doc()).write(fn);
}

function refuse(w: World, docId: string, clientSeq: number | null): void {
  w.server.error(docId, {
    code: CODE.VALIDATION_FAILED,
    message: "invalid",
    permanent: true,
    clientSeq,
  });
}

const lastPush = (w: World) => w.server.got("PUSH").at(-1)!;

/** The Yjs client IDs whose structs an update carries. */
const clientsOf = (update: Uint8Array): number[] =>
  updateMeta(update).map((m) => m.clientId);

/** DOC2's text on the server once these updates are applied to its copy. */
function textAfter2(w: World, updates: readonly Uint8Array[]): string {
  const doc = loadDoc(w.server.doc(DOC2).encodeState());
  for (const update of updates) doc.applyUpdate(update);
  return textOf(doc);
}

test("a permanently rejected push is kept as a recovered version and written back under a new client ID", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const events = listen(h);
  const first: CrdtDoc = h.doc();
  typeIn(h, B1, "kept");
  typeIn(h, B2, "also kept");
  await w.settle();
  server.answer.subscribe = false;
  refuse(w, DOC, lastPush(w).clientSeq);
  await w.settle();
  expect(server.got("UNSUBSCRIBE")).toHaveLength(1);
  const fresh = server.got("SUBSCRIBE").at(-1)!.clientIds;
  expect(fresh.slice(0, -1)).toEqual([first.clientId]);
  expect(fresh.at(-1)).not.toBe(first.clientId);
  expect(server.got("SYNC").at(-1)!.data).toEqual(EMPTY_VECTOR);
  expect(h.status.get().side).toEqual(["rejected"]);
  const pushed = server.got("PUSH").length;
  server.subscribedWithState(DOC, server.doc(DOC).encodeState());
  await w.settle();
  expect(h.doc()).not.toBe(first);
  expect(h.doc().clientId).toBe(fresh.at(-1)!);
  expect(textOf(h.doc())).toBe("kept\nalso kept");
  const pushes = server.got("PUSH").slice(pushed);
  expect(new Set(pushes.flatMap((p) => clientsOf(p.update)))).toEqual(
    new Set([fresh.at(-1)!]),
  );
  expect(textAfter(pushes.map((p) => p.update))).toBe("kept\nalso kept");
  expect((await store.load(DOC))!.meta.recovering).toMatchObject({
    replaying: true,
  });
  server.ack(DOC, pushes.at(-1)!.clientSeq, 2);
  await w.settle();
  expect(h.recovered.get()).toEqual([]);
  expect((await store.versions(DOC)).map((x) => [x.kind, x.label])).toEqual([
    ["recovered", "rejected"],
  ]);
  expect(events).toEqual([
    { type: "replaced", reason: "rejected" },
    { type: "rejected", code: 4422, replayed: 2, setAside: 0 },
  ]);
  expect(h.status.get()).toMatchObject({ side: [], recovered: 0 });
  const meta = (await store.load(DOC))!.meta;
  expect([meta.recovering, meta.clientIds]).toEqual([null, fresh]);
});

test("after a rejected push, a block both sides changed merges by character", async () => {
  const w = await setup();
  const base = stateOf([[B, "rain"]]);
  await seed2(w, base, base);
  const client = w.makeClient();
  const h = await client.open(DOC2);
  await w.online();
  const events = listen(h);
  write(h, (writer) => writer.insertText(B, 0, "cold "));
  await w.settle();
  w.server.write(DOC2, (writer) => writer.insertText(B, 4, " falls"));
  w.server.answer.subscribe = false;
  refuse(w, DOC2, lastPush(w).clientSeq);
  await w.settle();
  const fresh = w.server.got("SUBSCRIBE").at(-1)!.clientIds.at(-1)!;
  w.server.subscribedWithState(DOC2, w.server.doc(DOC2).encodeState());
  await w.settle();
  expect(textOf(h.doc())).toBe("cold rain falls");
  const push = lastPush(w);
  expect(clientsOf(push.update)).toEqual([fresh]);
  w.server.ack(DOC2, push.clientSeq, 11);
  await w.settle();
  expect(events.at(-1)).toEqual({
    type: "rejected",
    code: 4422,
    replayed: 1,
    setAside: 0,
  });
  expect(h.recovered.get()).toEqual([]);
});

test("after a rejected push, blocks the server lacks are written back and a deleted one is Recovered text", async () => {
  const w = await setup();
  const base = stateOf([
    [A, "one"],
    [B, "two"],
    [C, "three"],
    [D, "four"],
  ]);
  await seed2(w, base, base);
  const client = w.makeClient();
  const h = await client.open(DOC2);
  await w.online();
  write(h, (writer) => {
    writer.deleteText(B, 0, 3);
    writer.insertText(B, 0, "TWO");
    writer.insertBlocks(B, [block(N, "new")]);
    writer.insertText(D, 4, "!");
  });
  await w.settle();
  w.server.write(DOC2, (writer) => writer.deleteBlock(D));
  w.server.answer.subscribe = false;
  refuse(w, DOC2, lastPush(w).clientSeq);
  await w.settle();
  const pushed = w.server.got("PUSH").length;
  w.server.subscribedWithState(DOC2, w.server.doc(DOC2).encodeState());
  await w.settle();
  expect(textOf(h.doc())).toBe("one\nTWO\nnew\nthree");
  expect(
    h.recovered.get().map((r) => [r.blockId, r.nearBlockId, r.text, r.cause]),
  ).toEqual([[D, C, "four!", "rejected"]]);
  const pushes = w.server.got("PUSH").slice(pushed);
  expect(
    textAfter2(
      w,
      pushes.map((p) => p.update),
    ),
  ).toBe("one\nTWO\nnew\nthree");
});

test("Recovered text is filed by the nearest earlier block the server still holds", async () => {
  const w = await setup();
  const base = stateOf([
    [A, "one"],
    [N, "first"],
    [X, "second"],
  ]);
  await seed2(w, base, base);
  const client = w.makeClient();
  const h = await client.open(DOC2);
  await w.online();
  write(h, (writer) => {
    writer.insertText(N, 5, "!");
    writer.insertText(X, 6, "!");
  });
  await w.settle();
  w.server.write(DOC2, (writer) => {
    writer.deleteBlock(N);
    writer.deleteBlock(X);
  });
  refuse(w, DOC2, lastPush(w).clientSeq);
  await w.settle();
  expect(h.recovered.get().map((r) => [r.blockId, r.nearBlockId])).toEqual([
    [N, A],
    [X, A],
  ]);
});

test("after a refused heal push, every block the server lost is filed, including ones this device had synced", async () => {
  const w = await setup();
  await seed2(
    w,
    stateOf([
      [X, "x"],
      [Y, "y"],
    ]),
    new Uint8Array([0, 0]),
  );
  w.server.head = 2;
  const client = w.makeClient();
  const h = await client.open(DOC2);
  await w.online();
  const heal = lastPush(w);
  expect(heal.heal).toBe(true);
  w.server.error(DOC2, {
    code: CODE.BAD_FRAME,
    message: "foreign_client_id",
    permanent: true,
    clientSeq: heal.clientSeq,
  });
  await w.settle();
  expect(h.recovered.get().map((r) => [r.blockId, r.text])).toEqual([
    [X, "x"],
    [Y, "y"],
  ]);
  expect(textOf(h.doc())).toBe("");
});

/**
 * DOC2 synced with this device's " [mine]" in block A, open, and answered by hand from here on:
 * the server then takes in another writer's deletion of block A, made without seeing " [mine]".
 * `answer` replies to a SUBSCRIBE as the server does: SUBSCRIBED, step 1, the deletions, step 2.
 */
async function deletedUnseen(w: World) {
  const { server } = w;
  const base = stateOf([
    [A, "one"],
    [B, "two"],
  ]);
  const own = loadDoc(base, { clientId: 77 });
  scriptBody(own).write((writer) => writer.insertText(A, 3, " [mine]"));
  const deleting = loadDoc(base, { clientId: 88 });
  const deleted: Uint8Array[] = [];
  const stop = deleting.subscribe((update) => deleted.push(update));
  scriptBody(deleting).write((writer) => writer.deleteBlock(A));
  stop();
  await seed2(w, own.encodeState(), own.encodeState());
  await w.store.patchMeta(DOC2, { clientIds: [77] });
  const client = w.makeClient();
  const h = await client.open(DOC2);
  await w.online();
  server.answer.subscribe = false;
  server.doc(DOC2).applyUpdate(deleted[0]!);
  const sync = (step: "step1" | "update" | "step2", data: Uint8Array) =>
    server.send({ type: "SYNC", docId: DOC2, generation: 1, step, data });
  const answer = async (): Promise<void> => {
    server.send(subscribed(DOC2, server.head));
    sync("step1", server.doc(DOC2).encodeStateVector());
    sync("update", deletionsOf(deleted)!);
    sync("step2", server.doc(DOC2).encodeState());
    await w.settle();
  };
  return { client, h, answer };
}

const recoveredOf = (h: DocHandle) =>
  h.recovered.get().map((r) => [r.blockId, r.text, r.cause]);

test("own synced text the server deleted unseen while the push was being refused is kept as Recovered text", async () => {
  const w = await setup();
  const { h, answer } = await deletedUnseen(w);
  typeIn(h, B, "x");
  await w.settle();
  refuse(w, DOC2, lastPush(w).clientSeq);
  await w.settle();
  await answer();
  expect([recoveredOf(h), textOf(h.doc())]).toEqual([
    [[A, " [mine]", "merge"]],
    "twox",
  ]);
  expect(await w.store.recovered(DOC2)).toEqual([...h.recovered.get()]);
});

test("own synced text the server deleted unseen is kept when the step 2 of a reconnect arrives during a composition", async () => {
  const w = await setup();
  const { client, h, answer } = await deletedUnseen(w);
  client.setOnline(false);
  await w.settle();
  h.holdRemote();
  client.setOnline(true);
  await w.online();
  await answer();
  h.releaseRemote();
  w.frames.fire();
  await w.settle();
  expect([recoveredOf(h), textOf(h.doc())]).toEqual([
    [[A, " [mine]", "merge"]],
    "two",
  ]);
  expect(await w.store.recovered(DOC2)).toEqual([...h.recovered.get()]);
});

test("own synced text the server deleted unseen while the push was being refused is kept during a composition", async () => {
  const w = await setup();
  const { h, answer } = await deletedUnseen(w);
  typeIn(h, B, "x");
  await w.settle();
  h.holdRemote();
  refuse(w, DOC2, lastPush(w).clientSeq);
  await w.settle();
  await answer();
  h.releaseRemote();
  expect([recoveredOf(h), textOf(h.doc())]).toEqual([
    [[A, " [mine]", "merge"]],
    "twox",
  ]);
  expect(await w.store.recovered(DOC2)).toEqual([...h.recovered.get()]);
});

test("a rejected block's Recovered text is whole characters in reading order", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  write(h, (writer) => {
    writer.insertText(B1, 0, "مرحبا ");
    writer.insertText(B1, 6, "🎭", [{ type: "bold" }]);
    writer.insertText(B1, 8, " café");
  });
  await w.settle();
  w.server.write(DOC, (writer) => writer.deleteBlock(B1));
  refuse(w, DOC, lastPush(w).clientSeq);
  await w.settle();
  expect(h.recovered.get().map((r) => r.text)).toEqual(["مرحبا 🎭 café"]);
});

test("a recovery interrupted by a lost connection resumes", async () => {
  const w = await setup();
  const { server, store, network } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  type(h, "typed");
  await w.settle();
  server.answer.subscribe = false;
  refuse(w, DOC, 1);
  await w.settle();
  network.partition(true);
  await w.settle();
  await client.close();
  expect((await store.load(DOC))!.meta.recovering).toMatchObject({
    heal: false,
  });
  network.partition(false);
  server.answer.subscribe = true;
  const again = w.makeClient();
  const g = await again.open(DOC);
  expect(g.status.get().side).toEqual(["rejected"]);
  const pushed = server.got("PUSH").length;
  await w.online();
  expect(server.got("SYNC").at(-1)!.data).toEqual(EMPTY_VECTOR);
  const pushes = server.got("PUSH").slice(pushed);
  expect(pushes.map((p) => textAfter([p.update]))).toEqual(["typed\n"]);
  expect([textOf(g.doc()), g.recovered.get()]).toEqual(["typed\n", []]);
  server.ack(DOC, pushes[0]!.clientSeq, 2);
  await w.settle();
  expect((await store.load(DOC))!.meta.recovering).toBeNull();
  expect(g.status.get().side).toEqual([]);
});

test("a waiting setting survives the recovery and is sent again as it is", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  h.setSetting("script.paper", "a4");
  type(h, "x");
  await w.settle();
  refuse(w, DOC, 2);
  await w.settle();
  const sets = w.server.got("SET");
  expect(sets).toHaveLength(2);
  expect(sets[1]).toEqual(sets[0]!);
  expect(h.settings.get()).toEqual({ "script.paper": "a4" });
  expect([h.recovered.get(), textOf(h.doc())]).toEqual([[], "x\n"]);
});

test("typing during the recovery is never blocked and is not lost", async () => {
  const w = await setup();
  const { server } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  type(h, "a");
  await w.settle();
  server.answer.subscribe = false;
  refuse(w, DOC, 1);
  await w.settle();
  typeIn(h, B2, "between");
  await w.settle();
  server.subscribedWithState(DOC, server.doc(DOC).encodeState());
  await w.settle();
  const fresh = server.got("SUBSCRIBE").at(-1)!.clientIds.at(-1)!;
  typeIn(h, B2, "after");
  await w.settle();
  expect(h.recovered.get()).toEqual([]);
  expect(textOf(h.doc())).toBe("a\nbetweenafter");
  const pushes = server
    .got("PUSH")
    .filter((p) => clientsOf(p.update).includes(fresh));
  expect(textAfter(pushes.map((p) => p.update))).toBe("a\nbetweenafter");
});

test("access removed, or the document deleted, with edits waiting: they are kept, labelled, and never sent", async () => {
  const cases = [
    {
      code: CODE.FORBIDDEN,
      message: "forbidden",
      permanent: false,
      reason: "access_removed",
    },
    {
      code: CODE.DOCUMENT_DELETED,
      message: "deleted",
      permanent: true,
      reason: "deleted",
    },
  ] as const;
  for (const { reason, ...error } of cases) {
    const w = await setup();
    const { server, store, fake } = w;
    const client = w.makeClient();
    const h = await client.open(DOC);
    await w.online();
    client.setOnline(false);
    type(h, "unsent");
    await w.settle();
    server.answer.subscribe = false;
    client.setOnline(true);
    await w.settle();
    server.error(DOC, { ...error, clientSeq: null });
    await w.settle();
    expect((await store.load(DOC))!.meta.parked).toEqual({
      reason,
      parkedAt: fake.clock.now(),
    });
    expect(h.status.get()).toMatchObject({
      side: [reason],
      waiting: 1,
      saved: true,
    });
    expect(server.got("PUSH")).toEqual([]);
    type(h, " more");
    await w.settle();
    expect(h.status.get()).toMatchObject({ waiting: 1, saved: true });
    await client.close();
    const subscribes = server.got("SUBSCRIBE").length;
    const again = w.makeClient();
    const g = await again.open(DOC);
    await w.online();
    expect([g.status.get().side, server.got("SUBSCRIBE").length]).toEqual([
      [reason],
      subscribes,
    ]);
  }
});

test("device versions are offered for upload once the document is synced", async () => {
  const w = await setup();
  const { store, network } = w;
  const answers = [false, true];
  const offered: DeviceVersion[] = [];
  const client = w.makeClient({
    uploadVersion: async (version) => {
      offered.push(version);
      return answers.shift() ?? true;
    },
  });
  const h = await client.open(DOC);
  client.setOnline(false);
  await h.saveVersion("manual");
  client.setOnline(true);
  await w.online();
  const uploaded = async () =>
    (await store.versions(DOC)).map((x) => x.uploaded);
  expect([offered.length, await uploaded()]).toEqual([1, [false]]);
  type(h, "x");
  await w.settle();
  w.server.ack(DOC, 1, 2);
  await w.settle();
  expect(offered).toHaveLength(1);
  for (const expected of [
    [2, [true]],
    [2, [true]],
  ]) {
    network.partition(true);
    await w.settle();
    network.partition(false);
    w.fake.advance(30_000);
    await w.settle();
    expect([offered.length, await uploaded()]).toEqual(expected);
  }
  expect(offered[0]).toMatchObject({ kind: "device", label: "manual" });
});

test("a client ID someone else holds is given up, and the session starts again under a fresh one", async () => {
  const w = await setup();
  w.server.answer.subscribe = false;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  const taken = h.doc().clientId;
  w.server.error(DOC, {
    code: CODE.BAD_FRAME,
    message: "client_id_taken",
    permanent: true,
    clientSeq: null,
  });
  await w.settle();
  const [fresh] = w.server.got("SUBSCRIBE")[1]!.clientIds;
  expect(w.server.got("SUBSCRIBE")[1]!.clientIds).toEqual([fresh!]);
  expect(fresh).not.toBe(taken);
  w.server.subscribedWithState(DOC, w.server.doc(DOC).encodeState());
  await w.settle();
  expect([h.doc().clientId, h.status.get().side]).toEqual([fresh!, []]);
});

test("a recovery whose own push is refused files what it wrote and stops", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const events = listen(h);
  typeIn(h, B1, "kept");
  typeIn(h, B2, "also kept");
  await w.settle();
  server.answer.subscribe = false;
  refuse(w, DOC, lastPush(w).clientSeq);
  await w.settle();
  server.subscribedWithState(DOC, server.doc(DOC).encodeState());
  await w.settle();
  refuse(w, DOC, lastPush(w).clientSeq);
  await w.settle();
  const pushed = server.got("PUSH").length;
  server.subscribedWithState(DOC, server.doc(DOC).encodeState());
  await w.settle();
  w.fake.advance(60_000);
  await w.settle();
  expect(recoveredOf(h)).toEqual([
    [B1, "kept", "rejected"],
    [B2, "also kept", "rejected"],
  ]);
  expect(server.got("PUSH").slice(pushed)).toEqual([]);
  expect(textOf(h.doc())).toBe("\n");
  expect((await store.load(DOC))!.meta.recovering).toBeNull();
  expect(events.at(-1)).toEqual({
    type: "rejected",
    code: 4422,
    replayed: 0,
    setAside: 2,
  });
  expect(await store.recovered(DOC)).toEqual([...h.recovered.get()]);
});

test("the recovery's own workings are not among the package's names", () => {
  const internal = ["PushRecovery", "differingText", "mergeMine"];
  expect(internal.filter((name) => name in entry)).toEqual([]);
});
