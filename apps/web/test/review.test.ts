import { expect, spyOn, test } from "bun:test";
import {
  ORIGIN_REMOTE,
  ORIGIN_REVIEW,
  applyBlockOps,
  createDoc,
  createUndoScope,
  jsonMap,
  readBlocks,
  scriptBody,
  undoManagerForBinding,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { memoryTabs } from "@manent/sync-client/testing";
import { indexDocId } from "@manent/sync-protocol";
import fc from "fast-check";
import { readEntry } from "../src/services/sync/review-entries.ts";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import { mostly } from "./arbitraries.ts";
import { sceneEightDoc } from "./review-dom.fixtures.ts";
import {
  B1,
  B2,
  B3,
  action,
  eventually,
  idsOf,
  openWith,
  overlapItem,
  sceneEight,
  textOf,
} from "./review.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const MEDIUM = "medium";

async function room() {
  const w = await createIndexWorld();
  await w.seedWorkspace(MEDIUM, [
    ["dana", "owner"],
    ["sam", "edit"],
  ]);
  return w;
}

/** The text and actions of the message the person sees now. */
const shown = (person: TabServices) => {
  const current = person.messages.current();
  return current === null
    ? null
    : { text: current.text, actions: current.actions };
};

const UNDO = [{ label: "Undo", commandId: "edit.undo" }];

test("an item filed on the device moves into the private index, and only then leaves the device's list", async () => {
  const w = await room();
  const sam = await w.personServices({ person: SAM });
  const { docId } = await sceneEight(sam, MEDIUM);
  await openWith(sam, docId, [overlapItem(docId, "item-1")]);
  const store = w.space().store("sam");
  await eventually(async () => (await store.recovered(docId)).length === 0);
  expect(
    sam.review
      .entries(docId)
      .get()
      .map((e) => e.id),
  ).toEqual(["item-1"]);
  // the private index's write is refused: the item stays on the device
  await store.markApplied(docId, 0, [
    overlapItem(docId, "item-2", { blockId: B2 }),
  ]);
  w.refusePrivateIndex("sam", true);
  sam.sync.client.setOnline(false);
  await until(() => sam.review.entries(docId).get().length === 2);
  await w.settleAll();
  expect((await store.recovered(docId)).map((item) => item.id)).toEqual([
    "item-2",
  ]);
});

test("only the leader tab moves items, and every tab sees them", async () => {
  const w = await room();
  const tabs = memoryTabs();
  const lead = await w.personServices({ person: SAM, leader: tabs.port("a") });
  const { docId } = await sceneEight(lead, MEDIUM);
  const other = await w.personServices({ person: SAM, leader: tabs.port("b") });
  await w.settleAll();
  const store = w.space().store("sam");
  await openWith(lead, docId, [overlapItem(docId, "item-1")]);
  other.documents.open(docId);
  const seen = other.review.entries(docId);
  await w.settleAll();
  expect([
    lead.sync.link.get().leader,
    other.sync.link.get().leader,
    lead.review
      .entries(docId)
      .get()
      .map((e) => e.id),
    seen.get().map((e) => e.id),
    await store.recovered(docId),
  ]).toEqual([true, false, ["item-1"], ["item-1"], []]);
});

/** Sam, in the Writers' room, with Scene 8 open and `items` filed on his device; `writers` answers who wrote under each client id. */
async function samWith(
  items: (docId: string) => ReturnType<typeof overlapItem>[],
  writers: Readonly<Record<number, string>> = {},
) {
  const w = await room();
  const sam = await w.personServices({
    person: SAM,
    api: {
      docClients: async (_docId, clientIds) => ({
        clients: clientIds.flatMap((clientId) => {
          const userId = writers[clientId];
          return userId === undefined
            ? []
            : [{ clientId, userId, name: userId }];
        }),
      }),
    },
  });
  const { docId, heading } = await sceneEight(sam, MEDIUM);
  const doc = await openWith(sam, docId, items(docId));
  return { w, sam, docId, heading, doc };
}

test("Use mine writes my wording as one change and settles the entry", async () => {
  const { sam, docId, doc } = await samWith((d) => [overlapItem(d, "item-1")]);
  const origins: unknown[] = [];
  doc.subscribe((_update, origin) => origins.push(origin));
  const [entry] = sam.review.entries(docId).get();
  sam.review.useMine(entry?.id ?? "", doc);
  expect([
    textOf(doc, B1),
    origins,
    sam.review.entries(docId).get(),
    sam.review.openCount(docId).get(),
    shown(sam),
  ]).toEqual([
    "The tide turns at once.",
    [ORIGIN_REVIEW],
    [],
    0,
    { text: "Used your wording in Sc. 8.", actions: UNDO },
  ]);
});

test("Use mine on a block that is gone puts it back where it was", async () => {
  const { sam, docId, doc, heading } = await samWith((d) => [
    overlapItem(d, "item-1", { blockId: B2 }),
  ]);
  scriptBody(doc).write((w) => w.deleteBlock(B2));
  const [entry] = sam.review.entries(docId).get();
  sam.review.useMine(entry?.id ?? "", doc);
  expect([idsOf(doc), textOf(doc, B2)]).toEqual([
    [heading, B1, B2, B3],
    "The tide turns at once.",
  ]);
});

test("the other side's wording is offered by name for one or two people, and as the other wording otherwise", async () => {
  const writers = { 11: "dana", 12: "priya", 13: "leo", 14: "sam" };
  const said: (string | undefined)[] = [];
  for (const otherClientIds of [[11], [11, 12, 14], [11, 12, 13], [], [14]]) {
    const { sam, docId, doc } = await samWith(
      (d) => [overlapItem(d, "item-1", { otherClientIds })],
      writers,
    );
    const [entry] = sam.review.entries(docId).get();
    sam.review.useTheirs(entry?.id ?? "", doc);
    said.push(sam.messages.current()?.text);
  }
  expect(said).toEqual([
    "Used Dana's wording in Sc. 8.",
    "Used Dana and Priya's wording in Sc. 8.",
    "Used the other wording in Sc. 8.",
    "Used the other wording in Sc. 8.",
    "Used the other wording in Sc. 8.",
  ]);
});

test("Undo in the message is the script's undo, and the entry follows the script", async () => {
  const { sam, docId, doc } = await samWith((d) => [overlapItem(d, "item-1")]);
  const manager = undoManagerForBinding(
    createUndoScope(doc, {
      trackedOrigins: ["typing", ORIGIN_REVIEW],
      roots: ["script"],
    }),
  );
  scriptBody(doc).write((w) => w.insertText(B3, 0, "Far off, "), "typing");
  const [entry] = sam.review.entries(docId).get();
  sam.review.useMine(entry?.id ?? "", doc);
  const afterUse = shown(sam);
  manager.undo();
  const undone = [
    textOf(doc, B1),
    textOf(doc, B3),
    sam.review
      .entries(docId)
      .get()
      .map((e) => e.id),
  ];
  manager.redo();
  const redone = [textOf(doc, B1), sam.review.entries(docId).get()];
  scriptBody(doc).write((w) => w.insertText(B3, 0, "Then "), "typing");
  sam.messages.withdrawUndo();
  expect([afterUse, undone, redone, shown(sam)]).toEqual([
    { text: "Used your wording in Sc. 8.", actions: UNDO },
    ["The tide turns.", "Far off, A bell rings.", ["item-1"]],
    ["The tide turns at once.", []],
    { text: "Used your wording in Sc. 8.", actions: [] },
  ]);
});

test("Undo after Keep as merged opens the entry again", async () => {
  const { sam, docId, doc } = await samWith((d) => [overlapItem(d, "item-1")]);
  const [entry] = sam.review.entries(docId).get();
  sam.review.keepAsMerged(entry?.id ?? "");
  const kept = [shown(sam), textOf(doc, B1), sam.review.openCount(docId).get()];
  const first = sam.review.reopenKept();
  const reopened = sam.review
    .entries(docId)
    .get()
    .map((e) => e.id);
  expect([kept, first, reopened, sam.review.reopenKept()]).toEqual([
    [
      {
        text: "Kept the merged wording in Sc. 8.",
        actions: [{ label: "Undo", commandId: "review.undo" }],
      },
      "The tide turns.",
      0,
    ],
    true,
    ["item-1"],
    false,
  ]);
});

test("an item settled on one device leaves the other", async () => {
  const w = await room();
  const laptop = await w.personServices({ person: SAM, device: "laptop" });
  const { docId } = await sceneEight(laptop, MEDIUM);
  await openWith(laptop, docId, [overlapItem(docId, "item-1")]);
  await w.settleAll();
  const phone = await w.personServices({ person: SAM, device: "phone" });
  phone.documents.open(docId);
  const there = phone.review.entries(docId);
  await w.settleAll();
  await until(() => there.get().length === 1);
  laptop.review.keepAsMerged("item-1");
  await w.settleAll();
  await until(() => there.get().length === 0);
  expect(there.get()).toEqual([]);
});

/** Recovered text the device filed, that was near B3. */
const recoveredItem = (docId: string): ReturnType<typeof overlapItem> => ({
  ...overlapItem(docId, "item-1"),
  cause: "merge",
  blockId: null,
  nearBlockId: B3,
  text: "The harbour lights go out.",
  mine: null,
  theirs: null,
});

test("Recovered text is put back after the block it was near", async () => {
  const { sam, docId, doc, heading } = await samWith((d) => [recoveredItem(d)]);
  const [entry] = sam.review.entries(docId).get();
  sam.review.useMine(entry?.id ?? "", doc);
  const ids = idsOf(doc);
  const back = ids[4] ?? "";
  expect([ids.slice(0, 4), textOf(doc, back), shown(sam)?.text]).toEqual([
    [heading, B1, B2, B3],
    "The harbour lights go out.",
    "Put the recovered text back in Sc. 8.",
  ]);
});

test("Recovered text put back follows the script's undo and redo", async () => {
  const { sam, docId, doc } = await samWith((d) => [recoveredItem(d)]);
  const manager = undoManagerForBinding(
    createUndoScope(doc, {
      trackedOrigins: [ORIGIN_REVIEW],
      roots: ["script"],
    }),
  );
  const listed = () =>
    sam.review
      .entries(docId)
      .get()
      .map((e) => e.id);
  sam.review.useMine("item-1", doc);
  const put = [idsOf(doc).length, listed()];
  manager.undo();
  const undone = [idsOf(doc).length, listed()];
  manager.redo();
  expect([put, undone, [idsOf(doc).length, listed()]]).toEqual([
    [5, []],
    [4, ["item-1"]],
    [5, []],
  ]);
});

test("Use mine on a block gone since the script was last open here puts it back where it was", async () => {
  const w = await room();
  const before = await w.personServices({ person: SAM });
  const { docId, heading } = await sceneEight(before, MEDIUM);
  await openWith(before, docId, [
    overlapItem(docId, "item-1", { blockId: B2 }),
  ]);
  await w.settleAll();
  before.documents.close(docId);
  before.dispose();
  // the services are built again, and the passage goes while no tab has the script open
  const sam = await w.personServices({ person: SAM });
  const handle = await sam.sync.client.open(docId);
  scriptBody(handle.doc()).write((writer) => writer.deleteBlock(B2));
  await handle.close();
  sam.documents.open(docId);
  await until(
    () =>
      sam.review.docOf(docId) !== null &&
      sam.review.entries(docId).get().length === 1,
  );
  const doc = sam.review.docOf(docId);
  if (doc === null) throw new RangeError("the script was never followed");
  const without = idsOf(doc);
  sam.review.useMine("item-1", doc);
  expect([without, idsOf(doc), textOf(doc, B2)]).toEqual([
    [heading, B1, B3],
    [heading, B1, B2, B3],
    "The tide turns at once.",
  ]);
});

/** Deletes `ids` from the script in one change made elsewhere, as a sync delivers it. */
function deleteElsewhere(doc: CrdtDoc, ids: readonly string[]): void {
  const other = createDoc({ clientId: 99 });
  other.applyUpdate(doc.encodeState());
  scriptBody(other).write((writer) => {
    for (const id of ids) writer.deleteBlock(id);
  });
  doc.applyUpdate(other.encodeState(), ORIGIN_REMOTE);
}

test("Use mine on a block gone with the one before it in one change puts it back after the nearest block left", async () => {
  const { sam, doc, heading } = await samWith((d) => [
    overlapItem(d, "item-1", { blockId: B3 }),
  ]);
  deleteElsewhere(doc, [B2, B3]);
  sam.review.useMine("item-1", doc);
  expect(idsOf(doc)).toEqual([heading, B1, B3]);
});

test("in a tab that keeps no anchors, Use mine on a block gone with the one before it puts it back after the nearest block left", async () => {
  const w = await room();
  const tabs = memoryTabs();
  const lead = await w.personServices({ person: SAM, leader: tabs.port("a") });
  const { docId, heading } = await sceneEight(lead, MEDIUM);
  const other = await w.personServices({ person: SAM, leader: tabs.port("b") });
  await openWith(lead, docId, [overlapItem(docId, "item-1", { blockId: B3 })]);
  other.documents.open(docId);
  await w.settleAll();
  await until(
    () =>
      other.review.docOf(docId) !== null &&
      other.review.entries(docId).get().length === 1,
  );
  const doc = other.review.docOf(docId);
  if (doc === null) throw new RangeError("the script was never followed");
  deleteElsewhere(doc, [B2, B3]);
  other.review.useMine("item-1", doc);
  expect([other.sync.link.get().leader, idsOf(doc)]).toEqual([
    false,
    [heading, B1, B3],
  ]);
});

test("Recovered text near a block gone with the one before it is put back after the nearest block left", async () => {
  const { sam, doc, heading } = await samWith((d) => [recoveredItem(d)]);
  deleteElsewhere(doc, [B2, B3]);
  sam.review.useMine("item-1", doc);
  const ids = idsOf(doc);
  expect([ids.slice(0, 2), ids.length, textOf(doc, ids[2] ?? "")]).toEqual([
    [heading, B1],
    3,
    "The harbour lights go out.",
  ]);
});

test("an overlap's anchor follows the script while it is open here, so its passage goes back in place after the services are built again", async () => {
  const w = await room();
  const before = await w.personServices({ person: SAM });
  const { docId, heading } = await sceneEight(before, MEDIUM);
  const open = await openWith(before, docId, [
    overlapItem(docId, "item-1", { blockId: B3 }),
  ]);
  scriptBody(open).write((writer) => writer.deleteBlock(B2));
  await w.settleAll();
  before.documents.close(docId);
  before.dispose();
  // the services are built again, and the passage goes while no tab has the script open
  const sam = await w.personServices({ person: SAM });
  const handle = await sam.sync.client.open(docId);
  scriptBody(handle.doc()).write((writer) => writer.deleteBlock(B3));
  await handle.close();
  sam.documents.open(docId);
  await until(
    () =>
      sam.review.docOf(docId) !== null &&
      sam.review.entries(docId).get().length === 1,
  );
  const doc = sam.review.docOf(docId);
  if (doc === null) throw new RangeError("the script was never followed");
  sam.review.useMine("item-1", doc);
  expect(idsOf(doc)).toEqual([heading, B1, B3]);
});

/** A stored element of the script: a section or a block. */
interface Stored {
  toArray(): unknown[];
  getAttribute(name: string): unknown;
  getAttributes(): unknown;
}

const isStored = (node: unknown): node is Stored =>
  typeof node === "object" && node !== null && "toArray" in node;

/** The elements among `nodes`, leaving out text. */
const elementsOf = (nodes: readonly unknown[]): Stored[] =>
  nodes.filter(isStored);

/** The stored block `id` of the document; a read of its attributes is a read of the block itself. */
function storedBlock(doc: CrdtDoc, id: string): Stored {
  const block = elementsOf(yXmlFragmentForBinding(doc).toArray())
    .flatMap((section) => elementsOf(section.toArray()))
    .find((b) => b.getAttribute("id") === id);
  if (block === undefined) throw new RangeError(`no block ${id}`);
  return block;
}

test("Enter typed just above a passage To review lists moves its anchor and reads none of the rest of the script", async () => {
  const { sam, docId, doc } = await samWith((d) => [
    overlapItem(d, "item-1", { blockId: B2 }),
  ]);
  const reads = spyOn(storedBlock(doc, B3), "getAttributes");
  scriptBody(doc).write((writer) =>
    writer.insertBlocks(B1, [action("block-new-4", "")]),
  );
  const [entry] = sam.review.entries(docId).get();
  expect([
    entry?.kind === "overlap" ? entry.nearBlockId : null,
    reads.mock.calls.length,
  ]).toEqual(["block-new-4", 0]);
});

/** The private index's entry `id` of Sam's, as it is stored: its fields in their order. */
async function storedEntryOf(sam: TabServices, id: string): Promise<string> {
  const index = await sam.sync.client.open(indexDocId("user", "sam"));
  const stored = JSON.stringify(jsonMap(index.doc(), "review").get(id));
  await index.close();
  return stored;
}

test("an entry is kept with its fields in their stored order, as filed and as settled", async () => {
  const { sam, docId, heading } = await samWith(
    (d) => [
      overlapItem(d, "item-1", { otherClientIds: [11] }),
      { ...recoveredItem(d), id: "item-2" },
    ],
    { 11: "dana" },
  );
  const filed = [
    await storedEntryOf(sam, "item-1"),
    await storedEntryOf(sam, "item-2"),
  ];
  sam.review.keepAsMerged("item-1");
  const mine = `{"type":"block","attrs":{"id":"block-one-1","type":"action"},"content":[{"type":"text","text":"The tide turns at once."}]}`;
  const theirs = `{"type":"block","attrs":{"id":"block-one-1","type":"action"},"content":[{"type":"text","text":"The tide holds."}]}`;
  const before = `{"type":"block","attrs":{"id":"block-one-1","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false},"content":[{"type":"text","text":"The tide turns."}]}`;
  expect([...filed, await storedEntryOf(sam, "item-1")]).toEqual([
    `{"kind":"overlap","docId":"${docId}","blockId":"block-one-1","mine":${mine},"theirs":${theirs},"otherUserIds":["dana"],"at":1000,"settled":false,"before":null,"nearBlockId":"${heading}","copyId":null}`,
    `{"kind":"recovered","docId":"${docId}","blockId":null,"nearBlockId":"block-three-3","text":"The harbour lights go out.","at":1000,"settled":false,"before":null}`,
    `{"kind":"overlap","docId":"${docId}","blockId":"block-one-1","mine":${mine},"theirs":${theirs},"otherUserIds":["dana"],"at":1000,"settled":true,"before":${before},"nearBlockId":"${heading}","copyId":null}`,
  ]);
});

test("two devices settling one passage at once with different choices list it again, once", async () => {
  const w = await room();
  const laptop = await w.personServices({ person: SAM, device: "laptop" });
  const { docId } = await sceneEight(laptop, MEDIUM);
  const onLaptop = await openWith(laptop, docId, [
    overlapItem(docId, "item-1"),
  ]);
  await w.settleAll();
  const phone = await w.personServices({ person: SAM, device: "phone" });
  phone.documents.open(docId);
  await w.settleAll();
  const onPhone = phone.review.docOf(docId);
  if (onPhone === null) throw new RangeError("the phone never opened it");
  laptop.review.useMine("item-1", onLaptop);
  phone.review.useTheirs("item-1", onPhone);
  await w.settleAll();
  await w.settleAll();
  const open = (person: TabServices) =>
    person.review
      .entries(docId)
      .get()
      .map((e) => [
        e.kind,
        e.blockId,
        e.kind === "overlap" ? e.otherUserIds : null,
      ]);
  const listed = [open(laptop), open(phone)];
  const [again] = laptop.review.entries(docId).get();
  laptop.review.keepAsMerged(again?.id ?? "");
  await w.settleAll();
  expect([listed, open(laptop), open(phone)]).toEqual([
    [[["overlap", B1, []]], [["overlap", B1, []]]],
    [],
    [],
  ]);
});

test("an overlap found online is announced, and one a receipt counts is not", async () => {
  const w = await room();
  const dana = await w.personServices({ person: DANA });
  const { docId } = await sceneEight(dana, MEDIUM);
  dana.documents.open(docId);
  await w.settleAll();
  const said: string[] = [];
  const sam = await w.personServices({
    person: SAM,
    announce: (text) => said.push(text),
  });
  sam.documents.open(docId);
  await w.settleAll();
  const both = (id: string, mine: string, theirs: string): void => {
    for (const [person, text] of [
      [sam, mine],
      [dana, theirs],
    ] as const) {
      const doc = person.review.docOf(docId);
      if (doc === null) throw new RangeError("the script is not open");
      scriptBody(doc).write((writer) => writer.insertText(id, 0, text));
    }
  };
  both(B1, "Slowly, ", "Suddenly, ");
  await w.settleAll();
  await until(() => said.length > 0);
  const online = [...said];
  said.length = 0;
  sam.sync.client.setOnline(false);
  await w.settleAll();
  both(B2, "White ", "Grey ");
  await w.settleAll();
  sam.sync.client.setOnline(true);
  await w.settleAll();
  await until(() => sam.review.openCount(docId).get() === 2);
  await w.settleAll();
  expect([online, said]).toEqual([["Saved · Synced, 1 to review"], []]);
});

/** A block near what the script holds: each part valid, of another kind, or absent. */
const nearBlock = fc.record(
  {
    type: mostly(fc.constant("block"), fc.constant("section")),
    attrs: mostly(
      fc.record({
        id: mostly(fc.constant(B1), fc.constant(B2), fc.constant(7)),
        type: mostly(fc.constant("action"), fc.constant("nope")),
      }),
      fc.constant(null),
    ),
    content: fc.array(
      fc.record({
        type: mostly(fc.constant("text"), fc.constant("image")),
        text: mostly(fc.string({ minLength: 1, maxLength: 3 }), fc.constant(7)),
      }),
      { maxLength: 2 },
    ),
  },
  { requiredKeys: ["type", "attrs"] },
);

/** An entry near what the review map holds; `nearBlockId` absent as an older build wrote it. */
const nearEntry = fc.record(
  {
    kind: mostly(fc.constantFrom("overlap", "recovered"), fc.constant("other")),
    docId: mostly(fc.constant("doc-1"), fc.constant(7)),
    blockId: mostly(fc.constant(B1), fc.constant(null), fc.constant(5)),
    mine: nearBlock,
    theirs: nearBlock,
    otherUserIds: mostly(fc.constantFrom(["dana"], []), fc.constant([7])),
    at: mostly(fc.integer({ min: 0 }), fc.constant(1.5)),
    settled: mostly(fc.boolean(), fc.constant("no")),
    before: mostly(fc.constant(null), nearBlock),
    nearBlockId: mostly(fc.constantFrom(null, B2), fc.constant(3)),
    text: mostly(fc.string({ maxLength: 3 }), fc.constant(7)),
  },
  {
    requiredKeys: [
      "kind",
      "docId",
      "blockId",
      "mine",
      "theirs",
      "otherUserIds",
      "at",
      "settled",
      "before",
      "text",
    ],
  },
);

/** The text of a block's runs, as To review's rows show it. */
const wordingOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

test("every entry To review reads can be shown and written into the script as it stands", () => {
  fc.assert(
    fc.property(fc.oneof(nearEntry, fc.jsonValue()), (value) => {
      const entry = readEntry(value);
      if (entry?.kind !== "overlap") return;
      for (const side of [entry.mine, entry.theirs, entry.before]) {
        if (side === null) continue;
        const doc = sceneEightDoc();
        const wrote = applyBlockOps(
          doc,
          [{ op: "replace", block: canonicalBlock(side) }],
          ORIGIN_REVIEW,
        );
        expect([
          wrote,
          wordingOf(readBlocks(doc, new Set([B1])).get(B1) ?? action(B1, "")),
          side.attrs?.id,
        ]).toEqual([1, wordingOf(side), entry.blockId]);
      }
    }),
    { numRuns: 2_000 },
  );
});

test("an entry with any part a consumer cannot use is refused", () => {
  const block = action(B1, "The tide turns.");
  const overlap = {
    kind: "overlap",
    docId: "doc-1",
    blockId: B1,
    mine: block,
    theirs: block,
    otherUserIds: ["dana"],
    at: 1_000,
    settled: false,
    before: null,
    nearBlockId: null,
  };
  const recovered = {
    kind: "recovered",
    docId: "doc-1",
    blockId: null,
    nearBlockId: B3,
    text: "The harbour lights go out.",
    at: 1_000,
    settled: false,
    before: null,
  };
  const refused = [
    { ...overlap, kind: "conflict" },
    { ...overlap, docId: 7 },
    { ...overlap, at: 1.5 },
    { ...overlap, settled: "no" },
    { ...overlap, blockId: null },
    { ...overlap, mine: action(B2, "The tide turns.") },
    { ...overlap, theirs: { ...block, content: [{ type: "image" }] } },
    { ...overlap, before: action(B2, "Gulls circle.") },
    { ...overlap, otherUserIds: [7] },
    { ...overlap, nearBlockId: 3 },
    { ...recovered, text: 7 },
    { ...recovered, blockId: 5 },
    { ...recovered, nearBlockId: 3 },
    { ...recovered, before: block },
  ];
  const { nearBlockId: _absent, ...older } = overlap;
  expect([
    readEntry(overlap)?.kind,
    readEntry(older)?.kind,
    readEntry(recovered)?.kind,
    ...refused.map(readEntry),
  ]).toEqual(["overlap", "overlap", "recovered", ...refused.map(() => null)]);
});
