import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { StoreError, createSubscribable } from "@manent/sync-client";
import type {
  DocHandle,
  DocStatus,
  LinkFacts,
  SyncClient,
} from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { createMessageQueue, createValue, useSubscribable } from "@manent/ui";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createSyncSessions } from "../src/editor-host/sync-sessions.ts";
import { createSyncDocumentSource } from "../src/services/sync/document-source.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { asUiSubscribable } from "../src/services/sync/subscribable.ts";
import { writingActions } from "../src/state/writing.store.ts";
import { startHandIn } from "../src/writing/hand-in-flow.ts";
import type { HandInOutcome } from "../src/writing/requests.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import {
  ONLINE_LINK,
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
import type { FakeHandle, SyncWorld } from "./sync.fixtures.ts";

withDom();

const DOC = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";
const COPY = "5d2e8a41-7b3c-4f19-8e06-a9c4b7d3e2f1";
// scripts no other test's session follows
const OWN_DOC = "7c41e9d2-5b8a-4f36-a1c0-e2d94b6f3a85";
const OWN_COPY = "2a9f5c13-8e47-4b62-9d0e-c5b1a7f4e396";

// a session opens once the person's private index says where their typing goes
const INDEX = fakeHandle(indexDocId("user", "dana"), createDoc());
const DANA = { userId: "dana", openHandle: async () => INDEX };
writingActions.bind(DANA);

// the clock of sessions whose waits no test reaches
const IDLE = createClock();

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
    schedule: IDLE.schedule,
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
    schedule: IDLE.schedule,
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

test("typing after choosing Privately never reaches the shared script while the copy opens, and a copy that cannot open, or never arrives, puts the position back", async () => {
  const room = fakeHandle(DOC, written());
  const opening: ((reason: Error) => void)[] = [];
  // the copy's handle, once its open has stopped being refused: it never holds a block
  let late: FakeHandle | null = null;
  const client: SyncClient = {
    ...fakeClient(() => room),
    open: (docId) =>
      docId === DOC
        ? Promise.resolve(room)
        : late === null
          ? new Promise<DocHandle>((_, reject) => {
              opening.push(reject);
            })
          : Promise.resolve(late),
  };
  const clock = createClock();
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: clock.schedule,
  }).open(DOC, "screenplay");
  await until(() => session.doc() === room.doc());
  const shared = room.doc().encodeState();

  writingActions.keep(DOC, { position: "private", at: 1, privateDocId: COPY });
  const whileOpening = [
    writingActions.writingPositionOf(DOC).get(),
    session.readOnly.get(),
    session.doc() === room.doc(),
  ];
  for (const refuse of opening) refuse(new StoreError("unavailable"));
  await until(() => session.readOnly.get() === null);
  expect(whileOpening).toEqual([
    "private",
    scriptBody(room.doc()).materialize(),
    true,
  ]);
  const putBack = [
    writingActions.writingPositionOf(DOC).get(),
    writingActions.index()?.writing.get(DOC),
  ];

  late = fakeHandle(COPY, createDoc());
  late.status.set({
    ...SYNCED_STATUS,
    synced: false,
    link: "connecting",
    docSync: "local",
  });
  writingActions.keep(DOC, { position: "private", at: 2, privateDocId: COPY });
  await turn();
  const whileArriving = session.readOnly.get();
  clock.advance(60_000);
  await until(() => session.readOnly.get() === null);
  expect([
    putBack,
    whileArriving,
    writingActions.writingPositionOf(DOC).get(),
    writingActions.index()?.writing.get(DOC),
    late.closes(),
    room.doc().encodeState(),
  ]).toEqual([
    ["everyone", null],
    scriptBody(room.doc()).materialize(),
    "everyone",
    null,
    1,
    shared,
  ]);
});

test("a private copy chosen on another device that this one cannot reach offline is said, and the position kept", async () => {
  const room = fakeHandle(OWN_DOC, written());
  const copy = fakeHandle(OWN_COPY, createDoc());
  copy.status.set({ ...SYNCED_STATUS, synced: false, link: "offline" });
  const client = fakeClient((docId) => (docId === OWN_COPY ? copy : room));
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: IDLE.schedule,
  }).open(OWN_DOC, "screenplay");
  await until(() => session.doc() === room.doc());
  const heard: string[] = [];
  const stop = writingActions.onGivenUp(OWN_DOC, (outcome) =>
    heard.push(outcome),
  );
  const index = writingActions.index();
  const chosen = { position: "private", at: 3 };
  index?.copies.set(OWN_DOC, { privateDocId: OWN_COPY, handedInAt: null });
  index?.writing.set(OWN_DOC, chosen);
  await until(() => heard.length > 0);
  expect([
    heard,
    index?.writing.get(OWN_DOC),
    session.readOnly.get(),
    session.doc() === room.doc(),
  ]).toEqual([["offline"], chosen, scriptBody(room.doc()).materialize(), true]);
  stop();
  session.close();
  index?.writing.delete(OWN_DOC);
  index?.copies.delete(OWN_DOC);
});

test("a device that has not received the person's private index takes no keys, and opens their private copy once it has", async () => {
  const index = fakeHandle(indexDocId("user", "sam"), createDoc());
  index.status.set({
    ...SYNCED_STATUS,
    synced: false,
    docSync: "syncing",
    neverSynced: true,
  });
  const room = fakeHandle(OWN_DOC, written());
  const copy = fakeHandle(OWN_COPY, written());
  const client = fakeClient((docId) => (docId === OWN_COPY ? copy : room));
  writingActions.bind({ userId: "sam", openHandle: async () => index });
  try {
    const session = createSyncSessions({
      client: Promise.resolve(client),
      schedule: IDLE.schedule,
    }).open(OWN_DOC, "screenplay");
    await until(() => writingActions.index() !== null);
    await turn();
    const whileSyncing = [[...client.opened], session.kept.get()];
    // what the server holds of the index arrives
    writingActions
      .index()
      ?.writing.set(OWN_DOC, { position: "private", at: 4 });
    writingActions
      .index()
      ?.copies.set(OWN_DOC, { privateDocId: OWN_COPY, handedInAt: null });
    index.status.set(SYNCED_STATUS);
    await until(() => session.doc() === copy.doc());
    expect([whileSyncing, client.opened, session.readOnly.get()]).toEqual([
      [[], false],
      [OWN_DOC, OWN_COPY],
      null,
    ]);
    session.close();
  } finally {
    writingActions.bind(DANA);
  }
});

/** What a session of `OWN_DOC` opens while the person's index shows `status` and this tab's link reads `link`. */
async function openedWhile(
  status: DocStatus,
  link: LinkFacts,
): Promise<string[]> {
  const index = fakeHandle(indexDocId("user", "sam"), createDoc());
  index.status.set(status);
  const client = {
    ...fakeClient(() => fakeHandle(OWN_DOC, written())),
    link: createValue(link),
  };
  writingActions.bind({ userId: "sam", openHandle: async () => index });
  try {
    const session = createSyncSessions({
      client: Promise.resolve(client),
      schedule: IDLE.schedule,
    }).open(OWN_DOC, "screenplay");
    await until(() => writingActions.index() !== null);
    await turn();
    session.close();
    return [...client.opened];
  } finally {
    writingActions.bind(DANA);
  }
}

test("a page opens only once the server has answered for the person's index, or the device's link is down", async () => {
  const connecting = {
    ...SYNCED_STATUS,
    synced: false,
    link: "connecting" as const,
    docSync: "local" as const,
  };
  const told = { ...SYNCED_STATUS, synced: false, link: "offline" as const };
  const following = {
    ...ONLINE_LINK,
    state: "offline" as const,
    leader: false,
  };
  const refused = {
    ...SYNCED_STATUS,
    saved: false,
    synced: false,
    docSync: "syncing" as const,
    side: ["not_saved" as const],
  };
  const leading = { ...ONLINE_LINK, state: "offline" as const };
  expect([
    await openedWhile(connecting, following),
    await openedWhile(connecting, ONLINE_LINK),
    await openedWhile(refused, ONLINE_LINK),
    await openedWhile(told, ONLINE_LINK),
    await openedWhile(told, leading),
    await openedWhile(told, following),
  ]).toEqual([[], [], [], [OWN_DOC], [OWN_DOC], [OWN_DOC]]);
});

test("a script opened while written privately, whose copy never arrives on this device, shows the script for everyone in time", async () => {
  const room = fakeHandle(OWN_DOC, written());
  const copy = fakeHandle(OWN_COPY, createDoc());
  copy.status.set({
    ...SYNCED_STATUS,
    synced: false,
    link: "connecting",
    docSync: "local",
  });
  const client = fakeClient((docId) => (docId === OWN_COPY ? copy : room));
  const clock = createClock();
  await until(() => writingActions.index() !== null);
  writingActions.keep(OWN_DOC, {
    position: "private",
    at: 6,
    privateDocId: OWN_COPY,
  });
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: clock.schedule,
  }).open(OWN_DOC, "screenplay");
  await until(() => client.opened.length === 2);
  const whileArriving = [session.doc() === room.doc(), session.readOnly.get()];
  clock.advance(60_000);
  await until(() => session.readOnly.get() === null);
  expect([
    whileArriving,
    writingActions.writingPositionOf(OWN_DOC).get(),
    writingActions.index()?.writing.get(OWN_DOC),
    session.doc() === room.doc(),
    copy.closes(),
  ]).toEqual([
    [true, scriptBody(room.doc()).materialize()],
    "everyone",
    null,
    true,
    1,
  ]);
  session.close();
});

test("choosing For everyone while the script cannot be reached offline says nothing of Privately", async () => {
  const room = fakeHandle(OWN_DOC, createDoc());
  room.status.set({ ...SYNCED_STATUS, synced: false, link: "offline" });
  const copy = fakeHandle(OWN_COPY, written());
  const client = fakeClient((docId) => (docId === OWN_COPY ? copy : room));
  await until(() => writingActions.index() !== null);
  writingActions.keep(OWN_DOC, {
    position: "private",
    at: 7,
    privateDocId: OWN_COPY,
  });
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: IDLE.schedule,
  }).open(OWN_DOC, "screenplay");
  await until(() => session.doc() === copy.doc());
  const heard: string[] = [];
  const stop = writingActions.onGivenUp(OWN_DOC, (outcome) =>
    heard.push(outcome),
  );
  writingActions.keep(OWN_DOC, {
    position: "everyone",
    at: 8,
    privateDocId: null,
  });
  const outcome = await writingActions.whenBound(OWN_DOC, OWN_DOC);
  expect([outcome, heard, session.doc() === copy.doc()]).toEqual([
    "offline",
    [],
    true,
  ]);
  stop();
  session.close();
  writingActions.index()?.writing.delete(OWN_DOC);
});

test("a hand-in closed once its request has gone takes no keys until its answer, then shows the room's script and says so", async () => {
  const room = fakeHandle(OWN_DOC, written());
  const copy = fakeHandle(OWN_COPY, written());
  const client = fakeClient((docId) => (docId === OWN_COPY ? copy : room));
  const clock = createClock();
  const messages = createMessageQueue({
    now: clock.now,
    schedule: clock.schedule,
  });
  await until(() => writingActions.index() !== null);
  writingActions.keep(OWN_DOC, {
    position: "private",
    at: 5,
    privateDocId: OWN_COPY,
  });
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: IDLE.schedule,
  }).open(OWN_DOC, "screenplay");
  await until(() => session.doc() === copy.doc());
  const asked: { docId: string; key: string }[] = [];
  const answers: ((outcome: HandInOutcome) => void)[] = [];
  const handIn = startHandIn(
    {
      openHandle: (docId) => client.open(writingActions.openTarget(docId)),
      messages,
    },
    OWN_DOC,
    {
      key: "0123456789abcdef0123456789abcdef",
      now: clock.now,
      request(request) {
        asked.push(request);
        return new Promise((resolve) => {
          answers.push(resolve);
        });
      },
    },
  );
  await until(() => asked.length === 1);
  handIn.cancel();
  const afterCancel = session.readOnly.get();
  for (const answer of answers)
    answer({ ok: true, handedIn: { versionId: "v1", scenes: 1, overlaps: 0 } });
  await handIn.outcome;
  await until(() => session.doc() === room.doc());
  expect([
    afterCancel,
    writingActions.writingPositionOf(OWN_DOC).get(),
    session.readOnly.get(),
    messages.current()?.text,
  ]).toEqual([
    scriptBody(copy.doc()).materialize(),
    "everyone",
    null,
    "Handed in 1 scene. The script as it was is kept as 'Before hand-in'.",
  ]);
  session.close();
  writingActions.index()?.writing.delete(OWN_DOC);
});

test("a person who may only view gets a page that follows other people's typing and takes no keys", async () => {
  const handle = fakeHandle(DOC, written());
  const client = fakeClient(() => handle);
  const clock = createClock();
  const source = createSyncDocumentSource({
    signedIn: false,
    sync: Promise.resolve(fakeSync(client)),
    review: { openCount: () => createValue(0), follow: () => () => {} },
    opened: () => () => {},
    titles: () => "Low Tide",
    messages: createMessageQueue({ now: clock.now, schedule: clock.schedule }),
    now: clock.now,
    schedule: clock.schedule,
    removedInfo: async () => null,
  });
  const { status } = source.open(DOC);
  const session = createSyncSessions({
    client: Promise.resolve(client),
    schedule: IDLE.schedule,
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
      schedule: IDLE.schedule,
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
  const session = createSyncSessions({ client, schedule: IDLE.schedule }).open(
    DOC,
    "screenplay",
  );
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
    schedule: IDLE.schedule,
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
    // the person's index documents are asked for, and nothing of the address
    world.server.created.filter((request) => request.docId === DOC),
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
