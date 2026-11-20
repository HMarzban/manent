import { expect, test } from "bun:test";
import type { BlockWriter } from "@manent/crdt";
import { blockText, blockView } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { findOverlaps } from "../src/index.ts";
import type { DocHandle, RecoveredItem } from "../src/index.ts";
import { blankMeta, createMemoryStore } from "../src/testing/index.ts";
import {
  B1,
  B2,
  DOC,
  block,
  listen,
  setup,
  typeIn,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

const A = "block-A-0000000";
const B = "block-B-0000000";
const C = "block-C-0000000";
const D = "block-D-0000000";
/** The Yjs client ID of Dana's device. */
const DANA = 77;

const b = block;

function doc(...blocks: BlockJSON[]): DocJSON {
  return { type: "doc", content: [{ type: "section", content: blocks }] };
}

const textOf = (wording: BlockJSON | null): string =>
  wording === null ? "" : blockText(blockView(wording));

/** Back online, with Dana's change to the server's copy made while this device was away. */
async function reconnectWithServerChange(
  w: World,
  change: (writer: BlockWriter) => void,
): Promise<void> {
  w.server.writeAs(DOC, DANA, change);
  w.fake.advance(30_000);
  await w.settle();
}

/** Open and synced, then offline with `typed` done, and back online. */
async function typedOffline(typed: (h: DocHandle) => void) {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  const events = listen(h);
  client.setOnline(false);
  typed(h);
  client.setOnline(true);
  return { w, h, events };
}

test("a block both sides changed differently is an overlap; one changed alike, or on one side, is not", () => {
  const base = doc(b(A, "one"), b(B, "two"), b(C, "three"), b(D, "four"));
  expect(
    findOverlaps(
      base,
      doc(b(A, "ONE"), b(B, "TWO"), b(C, "three"), b(D, "four!")),
      doc(b(A, "One"), b(B, "TWO"), b(C, "3"), b(D, "four")),
    ),
  ).toEqual([{ blockId: A, mine: b(A, "ONE"), theirs: b(A, "One") }]);
  // gone from one side: set-aside text, not an overlap
  expect(findOverlaps(base, doc(b(A, "ONE")), doc(b(B, "two")))).toEqual([]);
});

test("overlaps are listed in this device's order, and an attribute spelt out as its default is no change", () => {
  const base = doc(b(A, "one"), b(B, "two"));
  const spelt = {
    ...b(B, "two"),
    attrs: { id: B, type: "action", omitted: false },
  };
  expect(
    findOverlaps(
      base,
      doc(b(B, "TWO"), b(A, "ONE")),
      doc(b(A, "One"), b(B, "Two")),
    ).map((o) => o.blockId),
  ).toEqual([B, A]);
  expect(findOverlaps(base, doc(b(A, "one"), spelt), doc(b(B, "Two")))).toEqual(
    [],
  );
});

test("offline rewrites of one speech by two people are listed with both wordings and named", async () => {
  const { w, h, events } = await typedOffline((typing) =>
    typeIn(typing, B1, " — mine"),
  );
  await reconnectWithServerChange(w, (writer) =>
    writer.insertText(B1, 0, " — Dana's"),
  );
  w.server.ackAll(DOC);
  await w.settle();
  expect(h.recovered.get()).toMatchObject([
    { cause: "overlap", blockId: B1, otherClientIds: [DANA] },
  ]);
  const [item] = h.recovered.get();
  expect(textOf(item!.mine)).toContain("— mine");
  expect(textOf(item!.theirs)).toContain("— Dana's");
  expect(events).toContainEqual({
    type: "receipt",
    sent: 1,
    setAside: 0,
    overlaps: 1,
  });
});

test("a reconnect within seconds of the typing lists each overlap once", async () => {
  const { w, h } = await typedOffline((typing) =>
    typeIn(typing, B1, " — mine"),
  );
  w.server.writeAs(DOC, DANA, (writer) =>
    writer.insertText(B1, 0, " — Dana's"),
  );
  await w.settle();
  expect(h.recovered.get().map((item) => [item.cause, item.blockId])).toEqual([
    ["overlap", B1],
  ]);
});

test("changes that land in different blocks overlap nothing", async () => {
  const { w, h, events } = await typedOffline((typing) =>
    typeIn(typing, B1, "mine"),
  );
  await reconnectWithServerChange(w, (writer) =>
    writer.insertText(B2, 0, "Dana's"),
  );
  w.server.ackAll(DOC);
  await w.settle();
  expect(h.recovered.get()).toEqual([]);
  expect(events).toContainEqual({
    type: "receipt",
    sent: 1,
    setAside: 0,
    overlaps: 0,
  });
});

test("a block only this device changed since the last synced state overlaps nothing", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  typeIn(h, B1, "draft");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  client.setOnline(false);
  typeIn(h, B1, "x");
  client.setOnline(true);
  await reconnectWithServerChange(w, (writer) =>
    writer.insertText(B2, 0, "Dana's"),
  );
  expect(h.recovered.get()).toEqual([]);
});

test("a change seen online before going offline is not an overlap at the reconnect", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  const seen = w.server.writeAs(DOC, DANA, (writer) =>
    writer.insertText(B1, 0, "Dana's"),
  );
  w.server.syncUpdate(DOC, seen);
  await w.settle();
  w.frames.fire();
  await w.settle();
  client.setOnline(false);
  typeIn(h, B1, " mine");
  client.setOnline(true);
  await reconnectWithServerChange(w, (writer) =>
    writer.insertText(B2, 0, "Dana's"),
  );
  w.server.ackAll(DOC);
  await w.settle();
  expect(h.recovered.get()).toEqual([]);
});

test("a deletion by someone else in a block typed offline is an overlap with nobody named", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  typeIn(h, B1, "draft");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  client.setOnline(false);
  typeIn(h, B1, "x");
  client.setOnline(true);
  await reconnectWithServerChange(w, (writer) => writer.deleteText(B1, 0, 3));
  w.server.ackAll(DOC);
  await w.settle();
  expect(
    h.recovered
      .get()
      .map((item) => [
        item.cause,
        item.blockId,
        textOf(item.mine),
        textOf(item.theirs),
        item.otherClientIds,
      ]),
  ).toEqual([["overlap", B1, "draftx", "ft", []]]);
});

test("text typed offline into a block someone deleted is Recovered text, not an overlap", async () => {
  const { w, h, events } = await typedOffline((typing) =>
    typeIn(typing, B1, "mine"),
  );
  await reconnectWithServerChange(w, (writer) => writer.deleteBlock(B1));
  w.server.ackAll(DOC);
  await w.settle();
  expect(h.recovered.get()).toMatchObject([
    { cause: "merge", text: "mine", mine: null, theirs: null },
  ]);
  expect(events).toContainEqual({
    type: "receipt",
    sent: 1,
    setAside: 1,
    overlaps: 0,
  });
});

test("a recovered item stored before overlaps carried wordings reads with none", async () => {
  const store = createMemoryStore("dana");
  await store.create(blankMeta(DOC));
  const {
    mine: _m,
    theirs: _t,
    otherClientIds: _o,
    ...older
  }: RecoveredItem = {
    id: "item-1",
    docId: DOC,
    blockId: B1,
    nearBlockId: null,
    text: "kept",
    recoveredAt: 5,
    cause: "merge",
    mine: null,
    theirs: null,
    otherClientIds: [],
  };
  // deliberately the older shape, without the wordings
  await store.markApplied(DOC, 0, [older as RecoveredItem]);
  expect(await store.recovered(DOC)).toEqual([
    { ...older, mine: null, theirs: null, otherClientIds: [] },
  ]);
});
