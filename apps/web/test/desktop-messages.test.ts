import { expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import type {
  DocHandle,
  HandoffRefusal,
  UpstreamStatus,
} from "@manent/sync-client";
import { IMPORT_WORDS, createValue } from "@manent/ui";
import { watchRefusedFiles } from "../src/desktop/file-messages.ts";
import { watchHandoffRefusals } from "../src/desktop/handoff-message.ts";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { IMPORTABLE_EXTENSIONS } from "../src/import/readers.ts";
import { fakeHost, recordingQueue } from "./desktop.fixtures.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import {
  fakeClient,
  fakeHandle,
  fakeSync,
  turn,
  until,
} from "./sync.fixtures.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const OTHER = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";

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

/** A handle of `docId` whose upstream status the test sets. */
function refusable(docId: string) {
  const upstream = createValue<UpstreamStatus | null>(null);
  return {
    ...fakeHandle(docId, createDoc()),
    upstream,
    setUpstream: upstream.set,
  };
}

/** The watch over the open handles, which `open` and `close` change; `DOC` is titled "The Lamp Room". */
function watching(...initial: DocHandle[]) {
  const handles = createValue<readonly DocHandle[]>(initial);
  const queue = recordingQueue();
  const stop = watchHandoffRefusals({
    handles: handles.get,
    handlesChanged: handles.subscribe,
    title: (docId) => (docId === DOC ? "The Lamp Room" : "Another"),
    queue,
  });
  return {
    queue,
    stop,
    open: (handle: DocHandle) => handles.set([...handles.get(), handle]),
    close: (handle: DocHandle) =>
      handles.set(handles.get().filter((each) => each !== handle)),
  };
}

/** One handle of `DOC`, watched from the start. */
function watched() {
  const handle = refusable(DOC);
  return { handle, ...watching(handle) };
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

test("a refused hand-off is said once however often its script opens, and a script opened later is heard", () => {
  const { queue, open, close } = watching();
  const first = refusable(DOC);
  open(first);
  first.setUpstream({ ...UP, handoffRefused: "forbidden" });
  close(first);
  first.setUpstream({ ...UP, handoffRefused: "deleted" });
  const again = refusable(DOC);
  again.setUpstream({ ...UP, handoffRefused: "forbidden" });
  open(again);
  const other = refusable(OTHER);
  open(other);
  other.setUpstream({ ...UP, handoffRefused: "invalid" });
  expect(queue.items().map((message) => message.text)).toEqual([
    "Couldn't sync 'The Lamp Room': you can't add scripts to this workspace. It stays on this device only.",
    "Couldn't sync 'Another': Manent couldn't read part of it. It stays on this device only.",
  ]);
});

test("a file Manent cannot open is named with the reason", async () => {
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
  // the answer loads apart, then says them
  await import("../src/desktop/opened-files.ts");
  await until(() => queue.items().length === 2);
  expect(queue.items()).toEqual([
    {
      id: expect.any(String),
      text: IMPORT_WORDS.notImportable("notes.txt", IMPORTABLE_EXTENSIONS),
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

test("a file refused while nobody is chosen is said to the next person", async () => {
  const host = fakeHost({ platform: "linux" });
  const environment = testEnvironment({ desktop: host });
  const stop = answerShell({ host, environment, pathname: () => "/choose" });
  host.emit({
    v: 1,
    t: "files_opened",
    files: [],
    refused: [{ name: "notes.txt", reason: "type" }],
  });
  // the answer loads apart, then says it while nobody is chosen
  await import("../src/desktop/opened-files.ts");
  await turn();
  const services = testServices({ userId: "sam", environment });
  environment.personServices.set(services);
  const text = services.messages.current()?.text;
  stop();
  services.dispose();
  await turn();
  expect(text).toBe(
    IMPORT_WORDS.notImportable("notes.txt", IMPORTABLE_EXTENSIONS),
  );
});

test("an open script whose first sync was refused says so in the person's messages, once however often it opens", async () => {
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
  services.documents.close(DOC);
  await turn();
  services.documents.open(DOC);
  await turn();
  const said = services.messages.receipts().map((message) => message.text);
  services.dispose();
  expect(said).toEqual([
    "Couldn't sync 'Untitled script': it was deleted on the server. It stays on this device only.",
  ]);
});
