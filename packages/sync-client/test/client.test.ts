import { expect, test } from "bun:test";
import { isDocId } from "@manent/sync-protocol";
import { DOC, setup, textOf, type } from "./scripted-server.ts";

test("closing a client with edits waiting sends nothing more, and a client for another user opens none of them", async () => {
  const w = await setup();
  const { space, server } = w;
  const dana = w.makeClient({ userId: "dana", store: space.store("dana") });
  const h = await dana.open(DOC);
  dana.setOnline(false);
  type(h, "dana's line");
  await w.settle();
  await dana.close();
  const sam = w.makeClient({ userId: "sam", store: space.store("sam") });
  const s = await sam.open(DOC);
  await w.online();
  expect(textOf(s.doc())).not.toContain("dana's line");
  expect(server.got("PUSH")).toEqual([]);
  const again = w.makeClient({ userId: "dana", store: space.store("dana") });
  again.setOnline(false);
  expect((await again.open(DOC)).status.get().waiting).toBe(1);
  expect(server.got("SUBSCRIBE").map((m) => m.clientIds.length)).toEqual([1]);
});

test("a person with no session writes locally and asks the server nothing", async () => {
  const w = await setup();
  const you = w.makeClient({
    userId: "you",
    transport: w.network.transport(null),
  });
  const h = await you.create({ kind: "script", home: "user" });
  type(h, "page one");
  await w.settle();
  w.fake.advance(120_000);
  await w.settle();
  expect(h.status.get()).toMatchObject({
    saved: true,
    synced: false,
    neverSynced: true,
    link: "offline",
  });
  expect(you.link.get().issue).toBe("sign_in");
  expect(isDocId(h.docId)).toBe(true);
  expect(w.serverContacts()).toBe(0);
  expect(textOf(h.doc())).toBe("page one");
});

test("a document made offline is created on the server at first sync, then synced like any other", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  client.setOnline(false);
  const h = await client.create({ kind: "script", home: "user" });
  type(h, "first page");
  await w.settle();
  expect(h.status.get()).toMatchObject({ neverSynced: true, waiting: 1 });
  client.setOnline(true);
  await w.online();
  expect(server.created).toEqual([
    { userId: "dana", docId: h.docId, kind: "script", home: "user" },
  ]);
  expect(server.got("SUBSCRIBE").map((m) => [m.docId, m.generation])).toEqual([
    [h.docId, 0],
  ]);
  server.ack(h.docId, 1, 1);
  await w.settle();
  expect(h.status.get()).toMatchObject({ neverSynced: false, synced: true });
  expect((await store.load(h.docId))!.meta).toMatchObject({
    neverSynced: false,
    generation: 1,
  });
});

test("one client ID per session, never reused, all of them listed at subscribe", async () => {
  const w = await setup();
  const client = w.makeClient();
  const first = await client.open(DOC);
  await w.online();
  await first.close();
  const second = await client.open(DOC);
  await w.settle();
  const once = first.doc().clientId;
  const ids = [once, second.doc().clientId];
  expect(new Set(ids).size).toBe(2);
  expect((await w.store.load(DOC))!.meta.clientIds).toEqual(ids);
  expect(w.server.got("SUBSCRIBE").map((m) => m.clientIds)).toEqual([
    [once],
    ids,
  ]);
});
