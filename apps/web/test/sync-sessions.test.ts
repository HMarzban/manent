import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { StoreError, createSubscribable } from "@manent/sync-client";
import type { SyncClient } from "@manent/sync-client";
import { createMessageQueue, createValue, useSubscribable } from "@manent/ui";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createSyncSessions } from "../src/editor-host/sync-sessions.ts";
import { createSyncDocumentSource } from "../src/services/sync/document-source.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { asUiSubscribable } from "../src/services/sync/subscribable.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import {
  SYNCED_STATUS,
  createSyncWorld,
  fakeClient,
  fakeHandle,
  fakeSync,
  fakeView,
  settle,
  turn,
  until,
} from "./sync.fixtures.ts";
import type { SyncWorld } from "./sync.fixtures.ts";

withDom();

const DOC = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";

const block = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

const textOf = (doc: ReturnType<typeof createDoc>): string[] =>
  blocksOf(scriptBody(doc).materialize()).map(blockText);

/** A document holding the line "Dawn.", as one this device has made or been given. */
function written(): ReturnType<typeof createDoc> {
  const doc = createDoc();
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [block("block-one-000001", "Dawn.")]),
  );
  return doc;
}

test("an editor session is the sync client's document, and a replaced document remounts it", async () => {
  const handle = fakeHandle(DOC, written());
  const sessions = createSyncSessions({
    client: Promise.resolve(fakeClient(() => handle)),
  });
  const session = sessions.open(DOC, "screenplay");
  let replaced = 0;
  session.onReplaced(() => replaced++);
  await turn();
  expect([session.doc() === handle.doc(), replaced]).toEqual([true, 1]);
  expect(sessions.open(DOC, "screenplay")).toBe(session);
  const rebuilt = written();
  handle.replaceDoc(rebuilt);
  handle.emit({ type: "replaced", reason: "rejected" });
  expect([session.doc() === rebuilt, replaced]).toEqual([true, 2]);
  session.close();
  await turn();
  expect(handle.closes()).toBe(1);
});

test("another writer's change waits while the page holds remote changes, and comes once it lets go", async () => {
  const handle = fakeHandle(DOC, written());
  const session = createSyncSessions({
    client: Promise.resolve(fakeClient(() => handle)),
  }).open(DOC, "screenplay");
  await turn();
  const other = createDoc();
  other.applyUpdate(handle.doc().encodeState());
  scriptBody(other).write((w) =>
    w.insertBlocks(null, [block("block-two-000002", "Dusk.")]),
  );
  session.holdRemote();
  session.receive(other.encodeState());
  const whileHeld = textOf(handle.doc());
  session.releaseRemote();
  expect([whileHeld, textOf(handle.doc())]).toEqual([
    ["Dawn."],
    ["Dusk.", "Dawn."],
  ]);
});

test("a person who may only view gets a page that follows other people's typing and takes no keys", async () => {
  const handle = fakeHandle(DOC, written());
  const client = fakeClient(() => handle);
  const clock = createClock();
  const source = createSyncDocumentSource({
    sync: Promise.resolve(fakeSync(client)),
    review: { openCount: () => createValue(0), follow: () => () => {} },
    titles: () => "Low Tide",
    messages: createMessageQueue({ now: clock.now, schedule: clock.schedule }),
    now: clock.now,
    schedule: clock.schedule,
    removedInfo: async () => null,
  });
  const { status } = source.open(DOC);
  const session = createSyncSessions({
    client: Promise.resolve(client),
  }).open(DOC, "screenplay");
  await until(() => !status.get().neverSynced);
  let replaced = 0;
  session.onReplaced(() => replaced++);

  // the server answered 4403 read_only_role: the handle reads through a view, whose snapshot comes after
  const view = fakeView(DOC, "view", []);
  handle.status.set({
    ...SYNCED_STATUS,
    side: ["view_only"],
    docSync: "local",
  });
  handle.readOnly.set(view);
  const beforeSnapshot = replaced;
  view.blocks.set([
    block("block-one-000001", "Dawn."),
    block("block-two-000002", ""),
  ]);
  expect([
    beforeSnapshot,
    replaced,
    status.get().access,
    session.readOnly.get(),
  ]).toEqual([0, 1, "view", null]);
  expect(textOf(session.doc())).toEqual(["Dawn.", ""]);

  const updates: Uint8Array[] = [];
  session.doc().subscribe((update) => updates.push(update));
  view.blocks.set([
    block("block-one-000001", "Dawn."),
    block("block-two-000002", "The tide turns."),
  ]);
  expect([textOf(session.doc()), updates.length, replaced]).toEqual([
    ["Dawn.", "The tide turns."],
    1,
    1,
  ]);

  handle.status.set(SYNCED_STATUS);
  handle.readOnly.set(null);
  expect([
    replaced,
    status.get().access,
    session.doc() === handle.doc(),
  ]).toEqual([2, "edit", true]);
});

test("a page may take keys only once it shows the device's document holding a block, or the copy of a view", async () => {
  const handle = fakeHandle(DOC, createDoc());
  const viewed = fakeHandle(DOC, createDoc());
  const sessionOf = (opened: typeof handle) =>
    createSyncSessions({
      client: Promise.resolve(fakeClient(() => opened)),
    }).open(DOC, "screenplay");
  const [own, view] = [sessionOf(handle), sessionOf(viewed)];
  const heard: boolean[] = [];
  own.kept.subscribe((kept) => heard.push(kept));
  await turn();
  const whileEmpty = [own.kept.get(), view.kept.get()];
  scriptBody(handle.doc()).write((w) =>
    w.insertBlocks(null, [block("block-one-000001", "Dawn.")]),
  );
  viewed.readOnly.set(
    fakeView(DOC, "view", [block("block-one-000001", "Dawn.")]),
  );
  expect([whileEmpty, own.kept.get(), view.kept.get(), heard]).toEqual([
    [false, false],
    true,
    true,
    [true],
  ]);
});

/** A session of a script the device does not hold yet, with "INT. HARBOUR" typed into its first block while it opens. */
function typedWhileOpening(client: Promise<SyncClient>) {
  const session = createSyncSessions({ client }).open(DOC, "screenplay");
  const [first] = blocksOf(scriptBody(session.doc()).materialize());
  scriptBody(session.doc()).write((w) =>
    w.insertText(first?.attrs.id ?? "", 0, "INT. HARBOUR"),
  );
  return session;
}

const typed = (doc: ReturnType<typeof createDoc>): string[][] =>
  blocksOf(scriptBody(doc).materialize()).map((b) => [
    b.attrs.type,
    blockText(b),
  ]);

test("a script the server holds gains nothing from a device that opens it for the first time", async () => {
  const world = createSyncWorld();
  scriptBody(world.server.doc(DOC)).write((w) =>
    w.insertBlocks(null, [block("block-one-000001", "Dawn.")]),
  );
  const sync = await world.personSync();
  const session = createSyncSessions({
    client: Promise.resolve(sync.client),
  }).open(DOC, "screenplay");
  await settle(world.network);
  expect([textOf(world.server.doc(DOC)), textOf(session.doc())]).toEqual([
    ["Dawn."],
    ["Dawn."],
  ]);
});

/** A person's services whose sync is `world`'s, and that sync once it has started. */
function servicesOver(world: SyncWorld) {
  let started: PersonSync | null = null;
  const services = testServices({
    userId: "dana",
    environment: testEnvironment({
      language: "en-GB",
      startSync: async () => (started = await world.personSync()),
    }),
  });
  const sync = async (): Promise<PersonSync> => {
    await until(() => started !== null);
    if (started === null) throw new RangeError("the sync never started");
    return started;
  };
  return { services, sync };
}

test("a script made in the Library has its first block and paper on the device before the editor opens it, offline too", async () => {
  const world = createSyncWorld();
  const { services, sync } = servicesOver(world);
  const { client } = await sync();
  client.setOnline(false);
  const { docId } = await services.library.createProject("dana", "film");
  const handle = await client.open(docId);
  await settle(world.network);
  expect([
    typed(handle.doc()),
    handle.settings.get()["script.paper"],
    world.server.got("SUBSCRIBE", "PUSH", "SET").length,
  ]).toEqual([[["scene_heading", ""]], "a4", 0]);
});

test("an address this device never made, opened signed in, asks for no create and stores nothing of the scratch", async () => {
  const world = createSyncWorld();
  const { services, sync } = servicesOver(world);
  const { client } = await sync();
  services.documents.open(DOC);
  const session = typedWhileOpening(Promise.resolve(client));
  await settle(world.network);
  const stored = await client.open(DOC);
  expect([
    world.server.created,
    typed(stored.doc()),
    textOf(world.server.doc(DOC)),
    typed(session.doc()),
  ]).toEqual([[], [], [], [["scene_heading", "INT. HARBOUR"]]]);
});

test("a page whose document cannot be opened keeps what it shows", async () => {
  const opening = fakeClient(() => fakeHandle(DOC, createDoc()));
  const session = typedWhileOpening(
    Promise.resolve({
      ...opening,
      open: () => Promise.reject(new StoreError("unavailable")),
    }),
  );
  const scratch = session.doc();
  let replaced = 0;
  session.onReplaced(() => replaced++);
  await turn();
  expect([session.doc() === scratch, replaced, typed(scratch)]).toEqual([
    true,
    0,
    [["scene_heading", "INT. HARBOUR"]],
  ]);
});

test("a page whose sync cannot start, or whose document cannot be opened, still takes keys over what it shows", async () => {
  const unopened = {
    ...fakeClient(() => fakeHandle(DOC, createDoc())),
    open: () => Promise.reject(new StoreError("unavailable")),
  };
  const sessions = [
    typedWhileOpening(Promise.reject(new StoreError("unavailable"))),
    typedWhileOpening(Promise.resolve(unopened)),
  ];
  const before = sessions.map((session) => session.kept.get());
  await turn();
  expect([before, sessions.map((session) => session.kept.get())]).toEqual([
    [false, false],
    [true, true],
  ]);
});

test("the two kinds of Subscribable are one shape", async () => {
  const synced = createSubscribable(SYNCED_STATUS);
  const status = asUiSubscribable(synced);
  const root = document.createElement("div");
  const Waiting = () => String(useSubscribable(status).waiting);
  await act(async () => createRoot(root).render(createElement(Waiting)));
  await act(async () => synced.set({ ...SYNCED_STATUS, waiting: 3 }));
  expect([status === synced, root.textContent]).toEqual([true, "3"]);
});
