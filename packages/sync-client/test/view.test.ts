import { expect, test } from "bun:test";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { CODE } from "@manent/sync-protocol";
import fc from "fast-check";
import { applyViewPatch } from "../src/index.ts";
import type { ViewPatch, ViewSnapshot } from "../src/index.ts";
import { B1, B2, DOC, block, setup, type, utf8 } from "./scripted-server.ts";

const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const [A, B, C, D, Z] = [
  "block-A-0000000",
  "block-B-0000000",
  "block-C-0000000",
  "block-D-0000000",
  "block-Z-0000000",
] as const;
/** A block in the canonical form a snapshot carries. */
const b = (id: string, text: string): BlockJSON =>
  canonicalBlock(block(id, text));

test("a patch is applied: removals, then insertions in order, then updates", () => {
  const start = [b(A, "one"), b(B, "two")];
  expect(
    applyViewPatch(start, {
      v: 1,
      remove: [A],
      insert: [
        { block: b(C, "c"), after: B },
        { block: b(D, "d"), after: null },
      ],
      update: [b(B, "TWO"), b(Z, "?")],
    }),
  ).toEqual([b(D, "d"), b(B, "TWO"), b(C, "c")]);
  expect(start).toEqual([b(A, "one"), b(B, "two")]);
});

test("the viewer's payloads are the server's, key for key", () => {
  const snapshot: ViewSnapshot = JSON.parse('{"v":1,"blocks":[]}');
  const patch: ViewPatch = JSON.parse(
    '{"v":1,"remove":[],"insert":[],"update":[],"later":true}',
  );
  // a key this build does not know is ignored
  expect([Object.keys(snapshot), applyViewPatch([], patch)]).toEqual([
    ["v", "blocks"],
    [],
  ]);
});

test("a viewer subscribes without a document, follows patches, and starts again from a snapshot after a reconnect", async () => {
  const w = await setup();
  const { server, network, store } = w;
  server.write(DOC2, (writer) => writer.insertBlocks(null, [b(A, "one")]));
  const client = w.makeClient();
  const view = client.view(DOC2);
  await w.online();
  expect(server.got("SUBSCRIBE")).toEqual([
    {
      type: "SUBSCRIBE",
      docId: DOC2,
      generation: 0,
      mode: "view",
      clientIds: [],
      lastServerSeq: 0,
    },
  ]);
  expect(view.blocks.get()).toEqual([b(A, "one")]);
  expect(view.status.get()).toEqual({
    link: "online",
    live: true,
    role: "edit",
  });
  server.viewPatch(DOC2, {
    v: 1,
    remove: [],
    insert: [{ block: b(B, "two"), after: A }],
    update: [],
  });
  await w.settle();
  expect(view.blocks.get()).toEqual([b(A, "one"), b(B, "two")]);
  network.partition(true);
  await w.settle();
  expect(view.status.get()).toMatchObject({ link: "offline", live: false });
  server.write(DOC2, (writer) => writer.insertBlocks(A, [block(C, "three")]));
  network.partition(false);
  w.fake.advance(30_000);
  await w.settle();
  expect(server.got("SUBSCRIBE").map((m) => m.mode)).toEqual(["view", "view"]);
  expect(view.blocks.get()).toEqual([b(A, "one"), b(C, "three")]);
  expect([await store.load(DOC2), server.got("SYNC")]).toEqual([null, []]);
  view.close();
  await w.settle();
  expect(server.got("UNSUBSCRIBE")).toHaveLength(1);
});

test("a payload that does not read is never shown, and the reader starts again from a snapshot", async () => {
  const w = await setup();
  const { server } = w;
  server.write(DOC2, (writer) => writer.insertBlocks(null, [b(A, "one")]));
  const client = w.makeClient();
  const view = client.view(DOC2);
  await w.online();
  server.answer.view = false;
  const refused = [
    "not json",
    '{"v":2,"remove":[],"insert":[],"update":[]}',
    '{"v":1,"remove":[7],"insert":[],"update":[]}',
    '{"v":1,"remove":[],"insert":[{"block":{"type":"section"},"after":null}],"update":[]}',
    '{"v":1,"remove":[],"insert":[{"block":{"type":"block"},"after":3}],"update":[]}',
    '{"v":1,"remove":[],"insert":[],"update":[{"type":"block","content":"x"}]}',
    '{"v":1,"remove":[],"insert":[],"update":[{"type":"block","content":[{"type":"text"}]}]}',
    '{"v":1,"remove":[],"insert":[],"update":[{"type":"block","content":[{"type":"text","text":"x","marks":[1]}]}]}',
    '{"v":1,"remove":[],"insert":[],"update":[{"type":"block","attrs":[]}]}',
  ];
  for (const [i, text] of refused.entries()) {
    server.send({
      type: "VIEW_PATCH",
      docId: DOC2,
      generation: 1,
      viewSeq: 2,
      patch: utf8(text),
    });
    await w.settle();
    expect([text, view.blocks.get(), server.got("SUBSCRIBE").length]).toEqual([
      text,
      [b(A, "one")],
      i + 2,
    ]);
    server.snapshot(DOC2);
    await w.settle();
  }
});

test("whatever a snapshot holds, the reader shows blocks or starts again", async () => {
  const w = await setup();
  const { server } = w;
  const client = w.makeClient();
  const view = client.view(DOC2);
  await w.online();
  server.answer.view = false;
  let subscribes = server.got("SUBSCRIBE").length;
  const run = fc.jsonValue();
  await fc.assert(
    fc.asyncProperty(
      fc.oneof(
        run,
        fc.array(run),
        fc.array(fc.record({ type: fc.constant("block"), content: run })),
      ),
      async (blocks) => {
        server.send({
          type: "VIEW_SNAPSHOT",
          docId: DOC2,
          generation: 1,
          viewSeq: 1,
          content: utf8(JSON.stringify({ v: 1, blocks })),
        });
        await w.settle();
        const again = server.got("SUBSCRIBE").length > subscribes;
        subscribes = server.got("SUBSCRIBE").length;
        const shown = view.blocks.get();
        return again || shown.every((x: BlockJSON) => x.type === "block");
      },
    ),
    { numRuns: 100 },
  );
});

test("an app too old for a script reads it and keeps what it had typed", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  type(h, "mine");
  await w.settle();
  server.answer.subscribe = false;
  client.setOnline(true);
  await w.settle();
  expect(h.readOnly.get()).toBeNull();
  server.error(DOC, {
    code: CODE.TOO_OLD,
    message: "too_old",
    permanent: false,
    clientSeq: null,
  });
  await w.settle();
  expect(h.status.get().side).toEqual(["read_only"]);
  const view = h.readOnly.get();
  expect(server.got("SUBSCRIBE").map((m) => m.mode)).toEqual(["edit", "view"]);
  expect(view!.blocks.get()).toEqual([b(B1, ""), b(B2, "")]);
  expect(view!.docId).toBe(DOC);
  const own = (await store.load(DOC))!.entries.filter(
    (e) => e.kind === "update" && e.own,
  );
  expect(own).toHaveLength(1);
  expect(server.got("PUSH")).toEqual([]);
});

test("a viewer follows a move to the new generation", async () => {
  const w = await setup();
  const { server } = w;
  server.write(DOC2, (writer) => writer.insertBlocks(null, [b(A, "one")]));
  const client = w.makeClient();
  const view = client.view(DOC2);
  await w.online();
  server.answer.view = false;
  server.moved(DOC2, 1, 2);
  await w.settle();
  expect(server.got("SUBSCRIBE").at(-1)).toEqual({
    type: "SUBSCRIBE",
    docId: DOC2,
    generation: 2,
    mode: "view",
    clientIds: [],
    lastServerSeq: 0,
  });
  server.write(DOC2, (writer) => writer.insertBlocks(A, [b(B, "two")]));
  server.snapshot(DOC2);
  await w.settle();
  expect(view.blocks.get()).toEqual([b(A, "one"), b(B, "two")]);
  expect(view.status.get()).toMatchObject({ live: true });
});
