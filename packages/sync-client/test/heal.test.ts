import { expect, test } from "bun:test";
import { loadDoc, scriptBody } from "@manent/crdt";
import { needsHeal } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  listen,
  seedState,
  setup,
  textAfter,
  textOf,
  typeIn,
} from "./scripted-server.ts";

test("a client heals when the server is behind what it was told, or lacks what it once acknowledged", () => {
  const base = {
    headSeq: 10,
    lastServerSeq: 10,
    own: new Map([
      [1, 20],
      [2, 9],
    ]),
    server: new Map([
      [1, 20],
      [2, 9],
    ]),
    ownClientIds: new Set([1]),
    ackedClocks: { "1": 20 },
  };
  expect(needsHeal(base)).toBe(false);
  // the verified head went back
  expect(needsHeal({ ...base, headSeq: 7 })).toBe(true);
  // someone else's structs, which came from the server, are gone from it
  expect(
    needsHeal({
      ...base,
      server: new Map([
        [1, 20],
        [2, 5],
      ]),
    }),
  ).toBe(true);
  // its own, acknowledged up to 20
  expect(
    needsHeal({
      ...base,
      server: new Map([
        [1, 12],
        [2, 9],
      ]),
    }),
  ).toBe(true);
  // 21–25 are only waiting in the outbox
  expect(
    needsHeal({
      ...base,
      own: new Map([
        [1, 25],
        [2, 9],
      ]),
    }),
  ).toBe(false);
});

test("the heal push goes first, carries the whole delete set, and its acknowledgement covers the outbox", async () => {
  const w = await setup();
  const { server, store } = w;
  await store.patchMeta(DOC, { lastServerSeq: 10 });
  server.head = 5;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  typeIn(h, B1, "kept and cut");
  scriptBody(h.doc()).write((writer) => writer.deleteText(B1, 4, 8));
  typeIn(h, B2, "two");
  await w.settle();
  client.setOnline(true);
  await w.online();
  const pushes = server.got("PUSH");
  expect(pushes.map((p) => [p.heal, p.clientSeq])).toEqual([[true, 3]]);
  expect(pushes[0]!.update).toEqual(
    h.doc().diff(server.doc(DOC).encodeStateVector()),
  );
  expect(textAfter([pushes[0]!.update])).toBe("kept\ntwo");
  server.ack(DOC, 3, 6);
  await w.settle();
  expect(h.status.get()).toMatchObject({ waiting: 0, synced: true });
  expect(server.got("PUSH")).toHaveLength(1);
});

test("a client whose own ids include ones it took over later heals like any other", async () => {
  const w = await setup();
  const { server, store } = w;
  const relayed = loadDoc(seedState(), { clientId: 2 });
  scriptBody(relayed).write((writer) =>
    writer.insertText(B1, 0, "a window's thirty characters.."),
  );
  await store.checkpoint(DOC, relayed.encodeState(), 0, true);
  await store.patchMeta(DOC, {
    clientIds: [1_000, 2],
    ackedClocks: { "2": 30 },
  });
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  expect(textOf(h.doc())).toBe("a window's thirty characters..\n");
  const [heal] = server.got("PUSH");
  expect(heal!.heal).toBe(true);
  expect(textAfter([heal!.update])).toBe("a window's thirty characters..\n");
});

test("a waiting setting goes out before the heal push, and stays waiting until the server answers it", async () => {
  const w = await setup();
  const { server, store } = w;
  await store.patchMeta(DOC, { lastServerSeq: 10 });
  server.head = 5;
  const client = w.makeClient();
  const h = await client.open(DOC);
  const events = listen(h);
  client.setOnline(false);
  h.setSetting("script.paper", "a4");
  typeIn(h, B1, "one");
  await w.settle();
  client.setOnline(true);
  await w.online();
  expect(server.got("SET").map((s) => s.clientSeq)).toEqual([1]);
  expect(server.got("PUSH").map((p) => [p.heal, p.clientSeq])).toEqual([
    [true, 2],
  ]);
  expect(h.settings.get()).toEqual({ "script.paper": "a4" });
  server.error(DOC, {
    code: 4423,
    message: "not_allowed",
    permanent: false,
    clientSeq: 1,
  });
  server.ack(DOC, 2, 6);
  await w.settle();
  expect(events).toContainEqual({
    type: "setting_refused",
    key: "script.paper",
    message: "not_allowed",
  });
  expect(h.settings.get()).toEqual({});
  expect(h.status.get()).toMatchObject({ waiting: 0, synced: true });
});

test("a setting whose write has not settled is not covered by the heal push, and goes out once stored", async () => {
  const w = await setup();
  const { server, store } = w;
  await store.patchMeta(DOC, { lastServerSeq: 10 });
  server.head = 5;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  typeIn(h, B1, "one");
  await w.settle();
  store.holdWrites();
  h.setSetting("script.paper", "a4");
  client.setOnline(true);
  await w.online();
  expect(server.got("PUSH").map((p) => [p.heal, p.clientSeq])).toEqual([
    [true, 1],
  ]);
  expect(server.got("SET")).toEqual([]);
  store.releaseWrites();
  await w.settle();
  expect(server.got("SET").map((s) => s.clientSeq)).toEqual([2]);
});
