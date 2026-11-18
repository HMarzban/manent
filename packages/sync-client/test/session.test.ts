import { expect, test } from "bun:test";
import { loadDoc, scriptSettings } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import type { LocalStore, SideState, StoredUpdate } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  listen,
  serverVersions,
  setup,
  subscribedWithUnknownRole,
  textAfter,
  textOf,
  type,
  typeIn,
  utf8,
  v,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

const HOUR = 3_600_000;

function updatesOf(entries: readonly { kind: string }[]): StoredUpdate[] {
  return entries.filter((e): e is StoredUpdate => e.kind === "update");
}

/** Back online after a cut: the backoff has passed and everything settled. */
async function reconnect(w: World): Promise<void> {
  w.network.partition(false);
  w.fake.advance(30_000);
  await w.settle();
}

async function cut(w: World): Promise<void> {
  w.network.partition(true);
  await w.settle();
}

/** A store whose loads wait until released. */
function slowLoads(
  store: LocalStore,
  log: string[],
): { store: LocalStore; release(): void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  const slow = new Proxy(store, {
    get(target, key) {
      if (key === "load")
        return async (docId: string) => {
          await promise;
          const loaded = await target.load(docId);
          log.push("loaded");
          return loaded;
        };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { store: slow, release: resolve };
}

test("an edit is saved on the device before it is sent, and synced only when the server says so", async () => {
  const w = await setup();
  const { store, server, fake } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  store.holdWrites();
  type(h, "a");
  expect(h.status.get()).toMatchObject({
    saved: false,
    synced: false,
    waiting: 1,
  });
  await w.settle();
  expect(server.got("PUSH")).toEqual([]);
  store.releaseWrites();
  await w.settle();
  expect(h.status.get()).toMatchObject({ saved: true, synced: false });
  expect(server.got("PUSH")).toHaveLength(1);
  fake.advance(5_000);
  server.ack(DOC, 1, 7);
  await w.settle();
  expect(h.status.get()).toMatchObject({
    saved: true,
    synced: true,
    waiting: 0,
    docSync: "synced",
  });
  expect((await store.load(DOC))!.meta).toMatchObject({
    lastServerSeq: 7,
    neverSynced: false,
    lastSyncedAt: 5_000,
  });
});

test("a device that only reads a script still keeps the day it last synced", async () => {
  const w = await setup();
  w.fake.advance(42_000);
  const client = w.makeClient();
  await client.open(DOC);
  await w.online();
  expect((await w.store.load(DOC))!.meta.lastSyncedAt).toBe(42_000);
  expect(w.server.got("PUSH")).toEqual([]);
});

test("the local copy is loaded before the socket opens", async () => {
  const w = await setup();
  const log: string[] = [];
  const slow = slowLoads(w.store, log);
  const transport = w.network.transport("dana");
  const client = w.makeClient({
    store: slow.store,
    transport: {
      connect(handlers) {
        log.push("connect");
        return transport.connect(handlers);
      },
      createDocument: (request) => transport.createDocument(request),
    },
  });
  const opening = client.open(DOC);
  await w.turn();
  expect(log).toEqual([]);
  slow.release();
  await opening;
  await w.settle();
  expect(log).toEqual(["loaded", "connect"]);
});

test("offline edits wait, are counted in elements, and go out in order as batches after the merge", async () => {
  const w = await setup();
  const { store, server } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  for (const id of [B1, B1, B2]) typeIn(h, id, "x");
  await w.settle();
  expect(h.status.get()).toMatchObject({
    saved: true,
    synced: false,
    waiting: 2,
    link: "offline",
    docSync: "local",
  });
  client.setOnline(true);
  await w.online();
  expect(server.got("PUSH").map((p) => p.clientSeq)).toEqual([3]);
  const own = updatesOf((await store.load(DOC))!.entries).filter((e) => e.own);
  expect(textAfter([server.got("PUSH")[0]!.update])).toBe(
    textAfter(own.map((e) => e.update)),
  );
  expect(textAfter(own.map((e) => e.update))).toBe("xx\nx");
});

test("an acknowledgement lost with the connection costs a resend, never an edit", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  type(h, "a");
  await w.settle();
  await cut(w);
  expect(client.link.get().state).toBe("offline");
  await reconnect(w);
  const pushes = server.got("PUSH");
  expect(pushes.map((p) => p.clientSeq)).toEqual([1, 1]);
  expect(pushes[1]!.update).toEqual(pushes[0]!.update);
  server.ack(DOC, 1, 3);
  await w.settle();
  expect(h.status.get().synced).toBe(true);
  const own = updatesOf((await store.load(DOC))!.entries).filter((e) => e.own);
  expect(own.map((e) => [e.localSeq, e.acked])).toEqual([[1, true]]);
});

test("a push cut off in the middle of its chunks is sent whole on the next connection", async () => {
  const w = await setup();
  const { server, network } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const paste = "x".repeat(6 * 1024 * 1024);
  type(h, paste);
  await w.turn();
  expect(network.queued()).toBe(2);
  network.step();
  await cut(w);
  expect(server.got("PUSH")).toEqual([]);
  await reconnect(w);
  expect(server.got("PUSH").map((p) => p.clientSeq)).toEqual([1]);
  expect(textAfter([server.got("PUSH")[0]!.update])).toBe(`${paste}\n`);
  server.ack(DOC, 1, 2);
  await w.settle();
  expect(h.status.get().synced).toBe(true);
});

test("a server message cut off in the middle of its chunks is asked for again", async () => {
  const w = await setup();
  const { server, network, store } = w;
  const big = "y".repeat(6 * 1024 * 1024);
  server.write(DOC, (writer) => writer.insertText(B2, 0, big));
  const client = w.makeClient();
  const h = await client.open(DOC);
  for (let i = 0; i < 1_000 && server.got("SYNC").length === 0; i++) {
    await w.turn();
    network.step();
  }
  while (network.queued() > 1) {
    network.step();
    await w.turn();
  }
  await cut(w);
  expect(textOf(h.doc())).toBe("\n");
  expect(updatesOf((await store.load(DOC))!.entries)).toEqual([]);
  await reconnect(w);
  expect(server.got("SUBSCRIBE")).toHaveLength(2);
  expect(server.got("SYNC").map((m) => m.step)).toEqual(["step1", "step1"]);
  expect(textOf(h.doc())).toBe(`\n${big}`);
  const stored = updatesOf((await store.load(DOC))!.entries);
  expect(stored.map((e) => [e.own, e.applied])).toEqual([[false, true]]);
});

test("a server update is stored at once and shown at the next frame, merged", async () => {
  const w = await setup();
  const { server, store, frames } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const first = server.write(DOC, (writer) => writer.insertText(B2, 0, "x"));
  const second = server.write(DOC, (writer) => writer.insertText(B2, 1, "y"));
  server.syncUpdate(DOC, first);
  server.syncUpdate(DOC, second);
  await w.settle();
  const stored = () =>
    store
      .load(DOC)
      .then((d) =>
        updatesOf(d!.entries).map((e) => [e.localSeq, e.own, e.applied]),
      );
  expect(await stored()).toEqual([
    [1, false, false],
    [2, false, false],
  ]);
  expect(textOf(h.doc())).toBe("\n");
  frames.fire();
  await w.settle();
  expect(textOf(h.doc())).toBe("\nxy");
  expect(await stored()).toEqual([
    [1, false, true],
    [2, false, true],
  ]);
});

test("nothing is applied during a composition", async () => {
  const w = await setup();
  const { server, frames, fake } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  h.holdRemote();
  server.syncUpdate(
    DOC,
    server.write(DOC, (writer) => writer.insertText(B2, 0, "x")),
  );
  await w.settle();
  frames.fire();
  fake.advance(60_000);
  expect(textOf(h.doc())).toBe("\n");
  h.releaseRemote();
  expect(textOf(h.doc())).toBe("\nx");
});

test("text a concurrent delete would lose is kept as Recovered text", async () => {
  const w = await setup();
  const { server, store, frames } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  typeIn(h, B1, " typed");
  await w.settle();
  server.syncUpdate(
    DOC,
    server.write(DOC, (writer) => writer.deleteBlock(B1)),
  );
  await w.settle();
  frames.fire();
  await w.settle();
  expect(h.recovered.get()).toMatchObject([
    { blockId: B1, nearBlockId: B2, text: " typed", cause: "merge" },
  ]);
  expect(h.status.get().recovered).toBe(1);
  expect(await store.recovered(DOC)).toEqual([...h.recovered.get()]);
});

test("when the store refuses, typing continues, saved is false and the edit is still pushed", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  store.refuseWrites("quota");
  type(h, "a");
  await w.settle();
  expect(textOf(h.doc())).toContain("a");
  expect(h.status.get()).toMatchObject({ saved: false, side: ["not_saved"] });
  expect(server.got("PUSH")).toHaveLength(1);
  server.ack(DOC, 1, 1);
  await w.settle();
  expect(h.status.get()).toMatchObject({ saved: false, synced: true });
});

test("a setting is shown at once, sent as a request of its own, and stored only when the server writes it", async () => {
  const w = await setup();
  const { server, frames } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  h.setSetting("script.paper", "a4");
  await w.settle();
  expect(h.settings.get()).toEqual({ "script.paper": "a4" });
  expect(scriptSettings(h.doc()).entries()).toEqual({});
  expect(server.got("SET")).toEqual([
    {
      type: "SET",
      docId: DOC,
      generation: 1,
      clientSeq: 1,
      key: "script.paper",
      value: utf8('"a4"'),
    },
  ]);
  expect(h.status.get()).toMatchObject({ synced: false, waiting: 1 });
  const written = server.change(DOC, (doc) =>
    scriptSettings(doc).set("script.paper", "a4", {
      userId: "dana",
      setAt: 0,
      replaced: null,
    }),
  );
  server.syncUpdate(DOC, written);
  server.ack(DOC, 1, 5);
  await w.settle();
  expect(h.settings.get()).toEqual({ "script.paper": "a4" });
  expect(scriptSettings(h.doc()).entries()).toEqual({});
  frames.fire();
  await w.settle();
  expect(h.settings.get()).toEqual({ "script.paper": "a4" });
  expect(scriptSettings(h.doc()).entries()).toEqual({ "script.paper": "a4" });
  expect(h.status.get().synced).toBe(true);
});

test("a setting acknowledged as a duplicate shows the stored value", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  h.setSetting("script.paper", "letter");
  await w.settle();
  expect(h.settings.get()).toEqual({ "script.paper": "letter" });
  w.server.ack(DOC, 1, 5);
  await w.settle();
  expect(h.settings.get()).toEqual({});
});

test("a refused setting drops its overlay and takes no text with it", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const events = listen(h);
  type(h, "kept");
  h.setSetting("script.paper", "legal");
  type(h, "also kept");
  await w.settle();
  expect(server.got("PUSH").map((p) => p.clientSeq)).toEqual([1, 3]);
  server.error(DOC, {
    code: CODE.SETTING_REFUSED,
    message: "bad_value",
    permanent: false,
    clientSeq: 2,
  });
  server.ack(DOC, 3, 9);
  await w.settle();
  expect(h.settings.get()).toEqual({});
  expect(events).toContainEqual({
    type: "setting_refused",
    key: "script.paper",
    message: "bad_value",
  });
  expect(h.status.get()).toMatchObject({ synced: true, side: [] });
  expect(textOf(h.doc())).toBe("keptalso kept\n");
  expect((await store.load(DOC))!.entries.some((e) => e.kind === "set")).toBe(
    false,
  );
});

test("a setting refused through the node upstream drops its overlay the same way", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const events = listen(h);
  h.setSetting("script.paper", "legal");
  await w.settle();
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "upstream_refused",
    data: utf8('{"clientSeq":1,"message":"locked"}'),
  });
  await w.settle();
  expect([h.settings.get(), events, h.status.get().waiting]).toEqual([
    {},
    [{ type: "setting_refused", key: "script.paper", message: "locked" }],
    0,
  ]);
  await cut(w);
  await reconnect(w);
  expect(w.server.got("SET")).toHaveLength(1);
});

test("a waiting setting is sent again after a reconnect, as it is", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  h.setSetting("script.paper", "a4");
  await w.settle();
  await cut(w);
  await reconnect(w);
  const sets = w.server.got("SET");
  expect(sets).toHaveLength(2);
  expect(sets[1]).toEqual(sets[0]!);
  expect(sets[0]).toMatchObject({ clientSeq: 1, key: "script.paper" });
});

test("a reconnect that had something waiting ends in one receipt, counted in elements", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  const events = listen(h);
  typeIn(h, B1, "x");
  typeIn(h, B1, "y");
  typeIn(h, B2, "z");
  await w.settle();
  client.setOnline(true);
  await w.online();
  expect(events).toEqual([]);
  w.server.ack(DOC, 3, 4);
  await w.settle();
  type(h, "later");
  await w.settle();
  w.server.ack(DOC, 4, 5);
  await w.settle();
  expect(events).toEqual([{ type: "receipt", sent: 2, setAside: 0 }]);
});

test("awareness passes through while the document is live", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  const heard: Uint8Array[] = [];
  h.onAwareness((update) => heard.push(update));
  h.sendAwareness(utf8("before"));
  await w.online();
  h.sendAwareness(utf8("mine"));
  w.server.send({
    type: "AWARENESS",
    docId: DOC,
    generation: 1,
    update: utf8("theirs"),
  });
  await w.settle();
  expect(w.server.got("AWARENESS").map((m) => m.update)).toEqual([
    utf8("mine"),
  ]);
  expect(heard).toEqual([utf8("theirs")]);
});

/** The case's world, its document online, with "a" sent as PUSH 1. */
async function openTyped(): Promise<{
  w: World;
  h: Awaited<ReturnType<ReturnType<World["makeClient"]>["open"]>>;
}> {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  type(h, "a");
  await w.settle();
  return { w, h };
}

const subscribes = (w: World): number =>
  w.server.got("SUBSCRIBE").filter((m) => m.mode === "edit").length;

test("each ERROR for a document has its one answer", async () => {
  const stops: {
    code: number;
    message: string;
    permanent: boolean;
    side: SideState[];
  }[] = [
    {
      code: CODE.DOCUMENT_DELETED,
      message: "deleted",
      permanent: true,
      side: ["deleted"],
    },
    {
      code: CODE.FORBIDDEN,
      message: "forbidden",
      permanent: false,
      side: ["access_removed"],
    },
    {
      code: CODE.TOO_OLD,
      message: "too_old",
      permanent: false,
      side: ["read_only"],
    },
    {
      code: CODE.VALIDATION_FAILED,
      message: "invalid",
      permanent: true,
      side: ["rejected"],
    },
  ];
  for (const stop of stops) {
    const { w, h } = await openTyped();
    w.server.error(DOC, { ...stop, clientSeq: stop.permanent ? 1 : null });
    await w.settle();
    type(h, "b");
    w.fake.advance(60_000);
    await w.settle();
    expect([stop.code, h.status.get().side, h.status.get().waiting]).toEqual([
      stop.code,
      stop.side,
      1,
    ]);
    expect([stop.code, subscribes(w), w.server.got("PUSH").length]).toEqual([
      stop.code,
      1,
      1,
    ]);
  }

  const retries = [
    { code: CODE.RATE_LIMITED, retryAfterMs: 300, wait: 300 },
    { code: CODE.STORAGE_FAILED, retryAfterMs: null, wait: 1_000 },
    { code: 4499, retryAfterMs: null, wait: 1_000 },
  ];
  for (const retry of retries) {
    const { w } = await openTyped();
    w.server.error(DOC, {
      code: retry.code,
      message: "later",
      permanent: false,
      clientSeq: null,
      retryAfterMs: retry.retryAfterMs,
    });
    await w.settle();
    w.fake.advance(retry.wait - 1);
    await w.settle();
    expect([retry.code, subscribes(w)]).toEqual([retry.code, 1]);
    w.fake.advance(1);
    await w.settle();
    expect([retry.code, subscribes(w), w.server.got("PUSH").length]).toEqual([
      retry.code,
      2,
      2,
    ]);
  }

  const moved = await openTyped();
  const events = listen(moved.h);
  moved.w.server.send({
    type: "GENERATION_MOVED",
    docId: DOC,
    generation: 1,
    newGeneration: 2,
  });
  await moved.w.settle();
  type(moved.h, "b");
  moved.w.fake.advance(60_000);
  await moved.w.settle();
  expect([
    events,
    moved.h.status.get().docSync,
    moved.h.status.get().waiting,
  ]).toEqual([[], "local", 1]);
  expect([subscribes(moved.w), moved.w.server.got("PUSH").length]).toEqual([
    1, 1,
  ]);

  const taken = await setup();
  taken.server.answer.subscribe = false;
  const client = taken.makeClient();
  const h = await client.open(DOC);
  await taken.settle();
  const [listed] = taken.server.got("SUBSCRIBE").map((m) => m.clientIds);
  expect(listed).toEqual([h.doc().clientId]);
  taken.server.error(DOC, {
    code: CODE.BAD_FRAME,
    message: "client_id_taken",
    permanent: true,
    clientSeq: null,
  });
  await taken.settle();
  expect((await taken.store.load(DOC))!.meta.clientIds).toEqual([]);
  expect(h.status.get().side).toEqual(["rejected"]);
});

test("a server older than this build needs is left alone; one with an older schema is written to with care", async () => {
  const w = await setup();
  const old = w.makeClient({ minServer: v(2, 1, 0, 0) });
  await w.online(serverVersions(v(1, 1, 0, 0)));
  expect(old.link.get()).toMatchObject({
    state: "offline",
    issue: "server_old",
  });
  w.fake.advance(120_000);
  expect(w.connects()).toBe(1);
  const h = await old.open(DOC);
  type(h, "a");
  await w.settle();
  expect(h.status.get()).toMatchObject({ saved: true, side: ["server_old"] });
  await old.close();

  const next = await setup();
  const newer = next.makeClient({ versions: v(1, 2, 0, 0) });
  const g = await newer.open(DOC);
  await next.online(serverVersions(v(1, 1, 0, 0)));
  expect(g.writeSchema.get()).toBe(1);
  type(g, "b");
  await next.settle();
  next.server.error(DOC, {
    code: CODE.VALIDATION_FAILED,
    message: "invalid",
    permanent: true,
    clientSeq: 1,
  });
  await next.settle();
  expect(g.status.get().side).toEqual(["server_old"]);
  expect(g.recovered.get()).toEqual([]);
  next.server.versions = serverVersions(v(1, 2, 0, 0));
  next.network.partition(true);
  await next.settle();
  await reconnect(next);
  expect(g.status.get().side).toEqual([]);
  expect(next.server.got("PUSH").map((p) => p.clientSeq)).toEqual([1, 1]);
});

test("a frame that never comes is waited for ten seconds, once more, and then the connection is replaced", async () => {
  const quiet = await setup();
  quiet.server.answer.subscribe = false;
  const client = quiet.makeClient();
  await client.open(DOC);
  await quiet.settle();
  expect(subscribes(quiet)).toBe(1);
  quiet.fake.advance(9_999);
  await quiet.settle();
  expect(quiet.server.got("UNSUBSCRIBE")).toHaveLength(0);
  quiet.fake.advance(1);
  await quiet.settle();
  expect([quiet.server.got("UNSUBSCRIBE").length, subscribes(quiet)]).toEqual([
    1, 2,
  ]);
  quiet.fake.advance(10_000);
  expect([quiet.closes(), client.link.get().state]).toEqual([1, "offline"]);
  quiet.fake.advance(30_000);
  expect(quiet.connects()).toBe(2);

  const mute = await setup();
  mute.server.answer.hello = false;
  const unwelcomed = mute.makeClient();
  await mute.settle();
  mute.fake.advance(10_000);
  expect([mute.closes(), unwelcomed.link.get().state]).toEqual([1, "offline"]);
  mute.fake.advance(30_000);
  expect(mute.connects()).toBe(2);

  const { w } = await openTyped();
  w.fake.advance(15_000);
  await w.settle();
  w.fake.advance(14_999);
  await w.settle();
  expect(subscribes(w)).toBe(1);
  w.fake.advance(1);
  await w.settle();
  expect([subscribes(w), w.server.got("PUSH").length]).toEqual([2, 2]);

  const skipped = await setup();
  skipped.server.answer.subscribe = false;
  const reader = skipped.makeClient();
  await reader.open(DOC);
  await skipped.settle();
  skipped.server.sendFrame(subscribedWithUnknownRole());
  await skipped.settle();
  expect([
    skipped.server.got("UNSUBSCRIBE").length,
    subscribes(skipped),
  ]).toEqual([1, 2]);
});

test("a connection that stops answering is closed after the probe and replaced", async () => {
  const w = await setup();
  const { fake } = w;
  const client = w.makeClient();
  await w.online();
  w.server.silence();
  client.retryNow();
  fake.advance(1_499);
  expect(w.closes()).toBe(0);
  fake.advance(1);
  expect(w.closes()).toBe(1);
  expect(client.link.get().state).toBe("offline");
  fake.jump(fake.clock.now() + 8 * HOUR);
  fake.advance(30_000);
  expect(w.connects()).toBe(2);
});

test("offline for more than an hour, a version is kept at most hourly; one is kept before a reconnect merge", async () => {
  const w = await setup();
  const { fake, store, server } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  const labels = async () => (await store.versions(DOC)).map((x) => x.label);
  type(h, "one");
  await w.settle();
  fake.advance(HOUR);
  type(h, " two");
  await w.settle();
  expect(await labels()).toEqual(["hourly"]);
  type(h, " three");
  await w.settle();
  expect(await labels()).toEqual(["hourly"]);
  server.write(DOC, (writer) => writer.insertText(B2, 0, "theirs"));
  client.setOnline(true);
  await w.online();
  expect(await labels()).toEqual(["hourly", "before_reconnect"]);
  const before = (await store.versions(DOC))[1]!.content;
  expect(JSON.stringify(before)).not.toContain("theirs");
  expect(JSON.stringify(before)).toContain("one two three");
  expect(textOf(h.doc())).toBe("one two three\ntheirs");
  client.setOnline(false);
  fake.jump(fake.clock.now() - 24 * HOUR);
  type(h, " four");
  await w.settle();
  expect(await labels()).toEqual(["hourly", "before_reconnect", "hourly"]);
  await h.saveVersion("manual");
  expect(await labels()).toEqual([
    "hourly",
    "before_reconnect",
    "hourly",
    "manual",
  ]);
});

test("a local sequence never repeats, even after the store was reset", async () => {
  const w = await setup();
  const { store, server } = w;
  const first = w.makeClient();
  const h = await first.open(DOC);
  await w.online();
  type(h, "a");
  type(h, "b");
  await w.settle();
  server.ack(DOC, server.got("PUSH").at(-1)!.clientSeq, 3);
  await w.settle();
  const loaded = (await store.load(DOC))!;
  await first.close();
  await store.reset(DOC, h.doc().encodeState(), loaded.meta);
  const second = w.makeClient();
  const g = await second.open(DOC);
  await w.online();
  type(g, "c");
  await w.settle();
  expect(server.got("PUSH").at(-1)!.clientSeq).toBe(3);
  expect(textOf(g.doc())).toBe("abc\n");
});

test("a local checkpoint is kept after every five hundred stored entries", async () => {
  const w = await setup();
  const { store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  for (let i = 0; i < 500; i++) type(h, "x");
  await w.settle();
  const loaded = (await store.load(DOC))!;
  expect([loaded.checkpoint?.throughLocalSeq, loaded.entries.length]).toEqual([
    500, 500,
  ]);
  expect(textOf(loadDoc(loaded.checkpoint!.state))).toBe(
    `${"x".repeat(500)}\n`,
  );
});
