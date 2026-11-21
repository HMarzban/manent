import { expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import type { HandoffRefusal, UpstreamStatus } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import { watchRefusedFiles } from "../src/desktop/file-messages.ts";
import { watchHandoffRefusals } from "../src/desktop/handoff-message.ts";
import { fakeHost, recordingQueue } from "./desktop.fixtures.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import { fakeClient, fakeHandle, fakeSync, until } from "./sync.fixtures.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

const UP: UpstreamStatus = {
  v: 1,
  link: "online",
  synced: false,
  waiting: 0,
  wentOfflineAt: null,
  neverSynced: true,
  side: [],
  device: "ok",
  recovered: [],
  lastSyncedAt: null,
  handoffRefused: null,
  events: [],
};

/** A handle of `docId` whose upstream status the test sets, watched under the title "The Lamp Room". */
function watched() {
  const upstream = createValue<UpstreamStatus | null>(null);
  const handle = {
    ...fakeHandle(DOC, createDoc()),
    upstream,
    setUpstream: upstream.set,
  };
  const queue = recordingQueue();
  const stop = watchHandoffRefusals({
    handles: () => [handle],
    title: (docId) => (docId === DOC ? "The Lamp Room" : "Another"),
    queue,
  });
  return { handle, queue, stop };
}

test("a refused hand-off says why, once, with Export", () => {
  const { handle, queue } = watched();
  handle.setUpstream({ ...UP, neverSynced: true, handoffRefused: "forbidden" });
  expect(queue.items()).toEqual([
    {
      id: expect.any(String),
      text: "Couldn't sync 'The Lamp Room': you can't add scripts to this workspace. It stays on this device only.",
      actions: [{ label: "Export", commandId: "doc.export" }],
      lifetime: "until_dismissed",
      ownWork: true,
    },
  ]);
  handle.setUpstream({ ...UP, neverSynced: true, handoffRefused: "forbidden" });
  expect(queue.items()).toHaveLength(1);
});

test("each refusal names its reason", () => {
  const reasons: [HandoffRefusal, string][] = [
    ["deleted", "it was deleted on the server"],
    [
      "exists_elsewhere",
      "the server already holds a different script with its identity",
    ],
    ["invalid", "Manent couldn't read part of it"],
    ["too_large", "Manent couldn't read part of it"],
  ];
  for (const [code, reason] of reasons) {
    const { handle, queue } = watched();
    handle.setUpstream({ ...UP, handoffRefused: code });
    expect(queue.items().map((message) => message.text)).toEqual([
      `Couldn't sync 'The Lamp Room': ${reason}. It stays on this device only.`,
    ]);
  }
});

test("a status with no refusal says nothing, and a stopped watch hears no more", () => {
  const { handle, queue, stop } = watched();
  handle.setUpstream({ ...UP, neverSynced: false, synced: true });
  handle.setUpstream(null);
  stop();
  handle.setUpstream({ ...UP, handoffRefused: "forbidden" });
  expect(queue.items()).toEqual([]);
});

test("a file Manent cannot open is named with the reason", () => {
  const host = fakeHost();
  const queue = recordingQueue();
  const stop = watchRefusedFiles({ host, queue });
  host.emit({
    v: 1,
    t: "files_opened",
    files: [],
    refused: [
      { name: "notes.txt", reason: "type" },
      { name: "draft.pdf", reason: "size" },
    ],
  });
  stop();
  host.emit({
    v: 1,
    t: "files_opened",
    files: [],
    refused: [{ name: "late.txt", reason: "type" }],
  });
  expect(queue.items()).toEqual([
    {
      id: expect.any(String),
      text: "Couldn't open 'notes.txt': Manent opens .fdx, .fountain, .pdf, .docx and .ink files.",
      actions: [],
      lifetime: "brief",
      ownWork: false,
    },
    {
      id: expect.any(String),
      text: "Couldn't open 'draft.pdf': it is larger than 32 MB.",
      actions: [],
      lifetime: "brief",
      ownWork: false,
    },
  ]);
});

test("an open script whose first sync was refused says so in the person's messages", async () => {
  const upstream = createValue<UpstreamStatus | null>({
    ...UP,
    handoffRefused: "deleted",
  });
  const handle = { ...fakeHandle(DOC, createDoc()), upstream };
  const services = testServices({
    userId: "sam",
    environment: testEnvironment({
      startSync: async () => fakeSync(fakeClient(() => handle)),
    }),
  });
  services.documents.open(DOC);
  await until(() => services.messages.current() !== null);
  const text = services.messages.current()?.text;
  services.dispose();
  expect(text).toBe(
    "Couldn't sync 'Untitled script': it was deleted on the server. It stays on this device only.",
  );
});
