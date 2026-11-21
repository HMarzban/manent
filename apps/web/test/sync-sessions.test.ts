import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { ORIGIN_REMOTE, createDoc, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { StoreError, createSubscribable } from "@manent/sync-client";
import type { SyncClient } from "@manent/sync-client";
import { createMessageQueue, createValue, useSubscribable } from "@manent/ui";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createSyncSessions } from "../src/editor-host/sync-sessions.ts";
import { createSyncDocumentSource } from "../src/services/sync/document-source.ts";
import { asUiSubscribable } from "../src/services/sync/subscribable.ts";
import { createClock } from "./services.fixtures.ts";
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

withDom();

const DOC = "0b9f6c2e-3c1a-4c55-9a43-5d8f1e2a7b10";

const block = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

const textOf = (doc: ReturnType<typeof createDoc>): string[] =>
  blocksOf(scriptBody(doc).materialize()).map(blockText);

test("an editor session is the sync client's document, and a replaced document remounts it", async () => {
  const handle = fakeHandle(DOC, createDoc());
  const sessions = createSyncSessions({
    client: Promise.resolve(fakeClient(() => handle)),
  });
  const session = sessions.open(DOC, "screenplay");
  let replaced = 0;
  session.onReplaced(() => replaced++);
  await turn();
  expect([session.doc() === handle.doc(), replaced]).toEqual([true, 1]);
  expect(sessions.open(DOC, "screenplay")).toBe(session);
  const rebuilt = createDoc();
  handle.replaceDoc(rebuilt);
  handle.emit({ type: "replaced", reason: "rejected" });
  expect([session.doc() === rebuilt, replaced]).toEqual([true, 2]);
  session.close();
  await turn();
  expect(handle.closes()).toBe(1);
});

test("a person who may only view gets a page that follows other people's typing and takes no keys", async () => {
  const handle = fakeHandle(DOC, createDoc());
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

const NOT_YET_SYNCED = Object.freeze({
  ...SYNCED_STATUS,
  synced: false,
  docSync: "local",
  neverSynced: true,
} as const);

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

test("a script that is empty on this device starts from what was typed while it opened", async () => {
  const fresh = fakeHandle(DOC, createDoc());
  fresh.status.set(NOT_YET_SYNCED);
  const session = typedWhileOpening(Promise.resolve(fakeClient(() => fresh)));
  await turn();
  expect([session.doc() === fresh.doc(), typed(fresh.doc())]).toEqual([
    true,
    [["scene_heading", "INT. HARBOUR"]],
  ]);
});

/** Applies to `doc`, as the server's, what `write` does to a copy of it. */
function fromServer(
  doc: ReturnType<typeof createDoc>,
  write: (copy: ReturnType<typeof createDoc>) => void,
): void {
  const copy = createDoc();
  copy.applyUpdate(doc.encodeState());
  write(copy);
  doc.applyUpdate(copy.diff(doc.encodeStateVector()), ORIGIN_REMOTE);
}

test("a new script keeps every line written in it once the server has answered with nothing", async () => {
  const fresh = fakeHandle(DOC, createDoc());
  fresh.status.set(NOT_YET_SYNCED);
  const session = createSyncSessions({
    client: Promise.resolve(fakeClient(() => fresh)),
  }).open(DOC, "screenplay");
  await turn();
  scriptBody(session.doc()).write((w) =>
    w.insertBlocks(null, [
      block("block-one-000001", "Rain."),
      block("block-two-000002", "Wind."),
    ]),
  );
  // another of the person's devices names the script's first scene
  fromServer(fresh.doc(), (copy) => {
    const [, , heading] = blocksOf(scriptBody(copy).materialize());
    scriptBody(copy).write((w) =>
      w.setBlockAttrs(heading?.attrs.id ?? "", { type: "scene_heading" }),
    );
  });
  fresh.status.set(SYNCED_STATUS);
  expect(typed(fresh.doc())).toEqual([
    ["action", "Rain."],
    ["action", "Wind."],
    ["scene_heading", ""],
  ]);
});

test("what was written before the server answered stays beside the script it held", async () => {
  const fresh = fakeHandle(DOC, createDoc());
  fresh.status.set(NOT_YET_SYNCED);
  typedWhileOpening(Promise.resolve(fakeClient(() => fresh)));
  await turn();
  const held = createDoc();
  scriptBody(held).write((w) =>
    w.insertBlocks(null, [block("block-one-000001", "Dawn.")]),
  );
  fresh.doc().applyUpdate(held.encodeState(), ORIGIN_REMOTE);
  fresh.status.set(SYNCED_STATUS);
  expect(typed(fresh.doc()).toSorted()).toEqual([
    ["action", "Dawn."],
    ["scene_heading", "INT. HARBOUR"],
  ]);
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

test("the two kinds of Subscribable are one shape", async () => {
  const synced = createSubscribable(SYNCED_STATUS);
  const status = asUiSubscribable(synced);
  const root = document.createElement("div");
  const Waiting = () => String(useSubscribable(status).waiting);
  await act(async () => createRoot(root).render(createElement(Waiting)));
  await act(async () => synced.set({ ...SYNCED_STATUS, waiting: 3 }));
  expect([status === synced, root.textContent]).toEqual([true, "3"]);
});
