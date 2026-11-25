import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  initRundown,
  insertRows,
  loadDoc,
  readRundown,
  scriptBody,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type {
  Message,
  PrompterFeed,
  PrompterPatch,
} from "@manent/sync-protocol";
import {
  createAirWindows,
  createHistoryService,
  createPrompterService,
  createSyncService,
} from "../src/index.ts";
import type { PrompterService, SyncService } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const STORY = "33333333-3333-7333-8333-333333333333";
const CONFIDENTIAL = "44444444-4444-7444-8444-444444444444";
const ROW_MAIN = "row-main-0000001";
const ROW_SECRET = "row-secr-0000001";
const BLK_DIAL = "blk-dial-0000001";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

const decodePayload = <T>(bytes: Uint8Array): T =>
  JSON.parse(new TextDecoder().decode(bytes)) as T;

async function flushAll(fc: FakeClock): Promise<void> {
  for (let i = 0; i < 8; i++) {
    fc.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

interface PrompterServer {
  readonly storage: ReturnType<typeof createMemoryStorage>;
  readonly sync: SyncService;
  readonly prompter: PrompterService;
}

function createPrompterServer(
  fc: FakeClock,
  options: { withSubscribe?: boolean } = {},
): PrompterServer {
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  let seq = 0;
  const ids = (): string => `ver-${++seq}`;
  let sync!: SyncService;
  const airWindows = createAirWindows({ clock: fc.clock, storage });
  const history = createHistoryService({
    sync: () => sync,
    storage,
    clock: fc.clock,
    ids,
  });
  const prompter = createPrompterService({
    storage,
    sync: () => sync,
    history,
    clock: fc.clock,
    ids,
    airWindows,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [history, airWindows.hooks, prompter.hooks],
    airWindow: airWindows.isInside,
    airWindowOf: airWindows.windowOf,
    ...(options.withSubscribe === false
      ? {}
      : { prompterSubscribe: prompter.subscribePrompter }),
  });
  return { storage, sync, prompter };
}

async function seedRundownAndStory(
  srv: PrompterServer,
  fc: FakeClock,
  dialogueText: string,
  extraRows: { id: string; docId: string }[] = [],
): Promise<void> {
  const { sync } = srv;
  sync.access.create("sam", {
    docId: RUNDOWN,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  sync.access.create("sam", {
    docId: STORY,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  const sam = fakePeer({ userId: "sam", name: "Sam" });
  sync.attach(sam);

  const storyDoc = createDoc({ clientId: 101 });
  scriptBody(storyDoc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: BLK_DIAL, type: "dialogue" },
        content: [{ type: "text", text: dialogueText }],
      },
    ]),
  );
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: STORY,
    generation: 0,
    mode: "edit",
    clientIds: [101],
    lastServerSeq: 0,
  });
  sync.receive(sam, {
    type: "PUSH",
    docId: STORY,
    generation: 1,
    clientSeq: 1,
    update: storyDoc.encodeState(),
    heal: false,
  });

  const rdDoc = createDoc({ clientId: 102 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-24",
      airAt: fc.clock.now() + 60_000,
      windowLeadMs: 65_000,
      targetMs: 60_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rdDoc,
    [
      { id: ROW_MAIN, kind: "script", docId: STORY, blockId: null },
      ...extraRows.map((row) => ({
        id: row.id,
        kind: "script" as const,
        docId: row.docId,
        blockId: null,
      })),
    ],
    null,
  );
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [102],
    lastServerSeq: 0,
  });
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 1,
    update: rdDoc.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  sync.detach(sam);
}

test("two servers sharing one clock isolate their prompter feeds completely", async () => {
  const fc = fakeClock(10_000);
  const srvA = createPrompterServer(fc);
  const srvB = createPrompterServer(fc);
  const srvPlain = createPrompterServer(fc, { withSubscribe: false });

  await seedRundownAndStory(srvA, fc, "Server A line");
  await seedRundownAndStory(srvB, fc, "Server B secret");
  await seedRundownAndStory(srvPlain, fc, "Unwired server");

  const sendA = srvA.prompter.send("sam", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(1),
  });
  const sendB = srvB.prompter.send("sam", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(1),
  });
  await flushAll(fc);
  expect((await sendA).ok).toBe(true);
  expect((await sendB).ok).toBe(true);

  const peerA = fakePeer({ userId: "sam", name: "Sam" });
  srvA.sync.attach(peerA);
  srvA.sync.receive(peerA, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  const msgsA = peerA.take();
  const snapA = msgsA.find(
    (m): m is Extract<Message, { type: "VIEW_SNAPSHOT" }> =>
      m.type === "VIEW_SNAPSHOT",
  );
  expect(snapA).toBeDefined();
  const feedA = decodePayload<PrompterFeed>(snapA!.content);
  expect(feedA.stories).toEqual([
    {
      storyId: ROW_MAIN,
      blocks: [
        {
          type: "block",
          attrs: { id: BLK_DIAL, type: "dialogue", dual: null },
          content: [{ type: "text", text: "Server A line" }],
        },
      ],
    },
  ]);

  // Stopping Server B must not break Server A's prompter feed or heartbeats
  srvB.prompter.stop();
  fc.advance(1_000);
  const hbA = peerA.take();
  expect(hbA).toHaveLength(1);
  expect(hbA[0]!.type).toBe("VIEW_PATCH");
  expect(
    decodePayload<PrompterPatch>(
      (hbA[0] as Extract<Message, { type: "VIEW_PATCH" }>).patch,
    ),
  ).toEqual({ v: 1, runOrder: null, stories: [], removed: [] });

  // A sync service without prompterSubscribe keeps refusing with 4403 prompter_unavailable
  const peerPlain = fakePeer({ userId: "sam", name: "Sam" });
  srvPlain.sync.attach(peerPlain);
  srvPlain.sync.receive(peerPlain, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  expect(peerPlain.take()).toEqual([
    {
      type: "ERROR",
      code: 4403,
      message: "prompter_unavailable",
      retryAfterMs: null,
      permanent: false,
      doc: { docId: RUNDOWN, generation: 0 },
      clientSeq: null,
    },
  ]);

  srvA.prompter.stop();
  srvPlain.prompter.stop();
});

test("revoking send_to_prompter while a send is queued refuses the queued send", async () => {
  const fc = fakeClock(10_000);
  const srv = createPrompterServer(fc);
  await seedRundownAndStory(srv, fc, "Opening line");
  srv.storage.directory.setRole(RUNDOWN, "dana", "edit", [
    "edit_rundowns",
    "send_to_prompter",
  ]);
  srv.storage.directory.setRole(STORY, "dana", "edit", []);

  // First send enters inChain and waits on authorityWrite defer; Dana queues behind it
  const firstSend = srv.prompter.send("sam", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(10),
  });
  const queuedSend = srv.prompter.send("dana", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(11),
  });

  // Revoke Dana's send_to_prompter before the first send commits
  srv.storage.directory.setRole(RUNDOWN, "dana", "edit", ["edit_rundowns"]);
  await flushAll(fc);

  const firstResult = await firstSend;
  expect(firstResult.ok).toBe(true);
  expect(await queuedSend).toEqual({ ok: false, code: "forbidden" });

  // Confirm Dana's queued send did not create a version or record a send
  const file = srv.storage.open({ kind: "project", id: PROJECT });
  const prompterVersions = file.versions
    .list(STORY)
    .filter((v) => v.kind === "prompter");
  expect(prompterVersions).toHaveLength(1);
  expect(file.prompter.latest(RUNDOWN, ROW_MAIN)?.senderUserId).toBe("sam");

  // Same TOCTOU protection for sendPrevious queued behind another operation
  srv.storage.directory.setRole(RUNDOWN, "dana", "edit", [
    "edit_rundowns",
    "send_to_prompter",
  ]);
  const secondSend = srv.prompter.send("sam", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(12),
  });
  const queuedPrev = srv.prompter.sendPrevious("dana", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(13),
  });
  srv.storage.directory.setRole(RUNDOWN, "dana", "edit", ["edit_rundowns"]);
  await flushAll(fc);

  expect((await secondSend).ok).toBe(true);
  expect(await queuedPrev).toEqual({ ok: false, code: "forbidden" });
  expect(file.prompter.latest(RUNDOWN, ROW_MAIN)?.senderUserId).toBe("sam");

  srv.prompter.stop();
});

test("sending a same-home story without access to that story is refused", async () => {
  const fc = fakeClock(10_000);
  const srv = createPrompterServer(fc);
  srv.sync.access.create("sam", {
    docId: CONFIDENTIAL,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  await seedRundownAndStory(srv, fc, "Public line", [
    { id: ROW_SECRET, docId: CONFIDENTIAL },
  ]);

  // Dana has send_to_prompter on the rundown and access to STORY, but NO role on CONFIDENTIAL
  srv.storage.directory.setRole(RUNDOWN, "dana", "edit", [
    "edit_rundowns",
    "send_to_prompter",
  ]);
  srv.storage.directory.setRole(STORY, "dana", "edit", []);

  const refused = srv.prompter.send("dana", {
    docId: RUNDOWN,
    rowId: ROW_SECRET,
    key: keyOf(20),
  });
  await flushAll(fc);
  expect(await refused).toEqual({ ok: false, code: "forbidden" });

  const file = srv.storage.open({ kind: "project", id: PROJECT });
  expect(file.prompter.latest(RUNDOWN, ROW_SECRET)).toBeNull();
  expect(file.versions.list(CONFIDENTIAL)).toEqual([]);

  // Send and Send previous keep separate idempotency key namespaces
  const s1 = srv.prompter.send("dana", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(21),
  });
  await flushAll(fc);
  const r1 = await s1;
  expect(r1.ok).toBe(true);
  const s2 = srv.prompter.send("dana", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(22),
  });
  await flushAll(fc);
  const r2 = await s2;
  expect(r2.ok).toBe(true);

  const prevSameKey = srv.prompter.sendPrevious("dana", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(22),
  });
  await flushAll(fc);
  const rPrev = await prevSameKey;
  expect(rPrev.ok).toBe(true);
  if (r1.ok && rPrev.ok) {
    expect(rPrev.value.versionId).toBe(r1.value.versionId);
  }

  srv.prompter.stop();
});

test("a window-end timer firing after a backwards clock jump never auto-sends changed rows", async () => {
  const fc = fakeClock(10_000);
  let now = 10_000;
  const timers: { at: number; fn: () => void }[] = [];
  const stepClock = {
    now: () => now,
    schedule(fn: () => void, delayMs: number): () => void {
      const entry = { at: now + delayMs, fn };
      timers.push(entry);
      return () => {
        const index = timers.indexOf(entry);
        if (index !== -1) timers.splice(index, 1);
      };
    },
  };
  const storage = createMemoryStorage({ now: () => stepClock.now() });
  let seq = 0;
  const ids = (): string => `ver-${++seq}`;
  let sync!: SyncService;
  const airWindows = createAirWindows({ clock: stepClock, storage });
  const history = createHistoryService({
    sync: () => sync,
    storage,
    clock: stepClock,
    ids,
  });
  const prompter = createPrompterService({
    storage,
    sync: () => sync,
    history,
    clock: stepClock,
    ids,
    airWindows,
  });
  sync = createSyncService({
    storage,
    clock: stepClock,
    defer: fc.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [history, airWindows.hooks, prompter.hooks],
    airWindow: airWindows.isInside,
    airWindowOf: airWindows.windowOf,
    prompterSubscribe: prompter.subscribePrompter,
  });

  // Air window is [5_000, 130_000]; now = 10_000 is inside it.
  await seedRundownAndStory({ storage, sync, prompter }, fc, "First wording");
  const sent = prompter.send("sam", {
    docId: RUNDOWN,
    rowId: ROW_MAIN,
    key: keyOf(30),
  });
  await flushAll(fc);
  expect((await sent).ok).toBe(true);

  const file = storage.open({ kind: "project", id: PROJECT });
  const loadFromFile = (docId: string, clientId?: number) => {
    const row = file.log.get(docId)!;
    const checkpoint = file.checkpoints.newest(docId, row.generation);
    const doc =
      checkpoint === null
        ? createDoc({ clientId })
        : loadDoc(checkpoint.state, { clientId });
    for (const entry of file.log.tail(
      docId,
      row.generation,
      checkpoint?.seq ?? 0,
    ).rows)
      doc.applyUpdate(entry.update, ORIGIN_LOAD);
    return doc;
  };

  // Edit story while inside the air window so the row becomes changed and schedules windowEndTimers.
  const sam = fakePeer({ userId: "sam", name: "Sam" });
  sync.attach(sam);
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: STORY,
    generation: 0,
    mode: "edit",
    clientIds: [201],
    lastServerSeq: 0,
  });
  const liveStory = loadFromFile(STORY, 201);
  const updates: Uint8Array[] = [];
  const stop = liveStory.subscribe((u) => updates.push(u));
  scriptBody(liveStory).write((w) => {
    w.deleteText(BLK_DIAL, 0, "First wording".length);
    w.insertText(BLK_DIAL, 0, "Corrected wording");
  });
  stop();
  sync.receive(sam, {
    type: "PUSH",
    docId: STORY,
    generation: 1,
    clientSeq: 1,
    update: updates[0]!,
    heal: false,
  });
  await flushAll(fc);
  sync.detach(sam);

  // Confirm row is now changed and a window-end timer was scheduled.
  expect(timers.length).toBeGreaterThan(0);
  const rdBefore = loadFromFile(RUNDOWN);
  expect(readRundown(rdBefore).rows[0]?.prompter?.state).toBe("changed");
  rdBefore.destroy();

  // Simulate a backwards clock jump to before startsAt (5_000) and fire the shifted timer at t = 4_000.
  now = 4_000;
  for (const timer of timers.splice(0, timers.length)) timer.fn();
  await flushAll(fc);

  expect(file.prompter.latest(RUNDOWN, ROW_MAIN)?.senderUserId).toBe("sam");
  const rdAfter = loadFromFile(RUNDOWN);
  expect(readRundown(rdAfter).rows[0]?.prompter?.state).toBe("changed");
  rdAfter.destroy();
  liveStory.destroy();
  prompter.stop();
});
