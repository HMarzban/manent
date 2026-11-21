import { expect, test } from "bun:test";
import {
  ORIGIN_REVIEW,
  createUndoScope,
  scriptBody,
  undoManagerForBinding,
} from "@manent/crdt";
import { memoryTabs } from "@manent/sync-client/testing";
import { DANA, SAM, createIndexWorld } from "./index.fixtures.ts";
import type { TabServices } from "./index.fixtures.ts";
import {
  B1,
  B2,
  B3,
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

test("Recovered text is put back after the block it was near", async () => {
  const { sam, docId, doc, heading } = await samWith((d) => [
    {
      ...overlapItem(d, "item-1"),
      cause: "merge",
      blockId: null,
      nearBlockId: B3,
      text: "The harbour lights go out.",
      mine: null,
      theirs: null,
    },
  ]);
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
