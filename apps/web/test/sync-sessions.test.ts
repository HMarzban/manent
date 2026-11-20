import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { createSubscribable } from "@manent/sync-client";
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
  fakeClient,
  fakeHandle,
  fakeSync,
  fakeView,
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

test("a script that is empty on this device starts from what was typed while it opened", async () => {
  const fresh = fakeHandle(DOC, createDoc());
  const client = Promise.withResolvers<SyncClient>();
  const session = createSyncSessions({ client: client.promise }).open(
    DOC,
    "screenplay",
  );
  const [first] = blocksOf(scriptBody(session.doc()).materialize());
  scriptBody(session.doc()).write((w) =>
    w.insertText(first?.attrs.id ?? "", 0, "INT. HARBOUR"),
  );
  client.resolve(fakeClient(() => fresh));
  await turn();
  expect([
    session.doc() === fresh.doc(),
    blocksOf(scriptBody(fresh.doc()).materialize()).map((b) => [
      b.attrs.type,
      blockText(b),
    ]),
  ]).toEqual([true, [["scene_heading", "INT. HARBOUR"]]]);
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
