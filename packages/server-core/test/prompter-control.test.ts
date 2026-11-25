import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  moveRows,
  scriptBody,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  PROMPTER_OPERATOR_TTL_MS,
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  Identity,
  Message,
  PrompterFeed,
  PrompterOperatorTakenResponse,
} from "@manent/sync-protocol";
import {
  answerPrompterRequest,
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
const STORY_A = "33333333-3333-7333-8333-333333333333";
const STORY_B = "44444444-4444-7444-8444-444444444444";
const ROW_A = "row-a-0000000001";
const ROW_B = "row-b-0000000002";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

const ANA: Identity = { userId: "ana", name: "Ana" };
const SAM: Identity = { userId: "sam", name: "Sam" };
const LEO: Identity = { userId: "leo", name: "Leo" };

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

async function flushAll(fc: FakeClock): Promise<void> {
  for (let i = 0; i < 8; i++) {
    fc.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

interface TestServer {
  readonly storage: ReturnType<typeof createMemoryStorage>;
  readonly sync: SyncService;
  readonly prompter: PrompterService;
}

function createTestServer(fc: FakeClock): TestServer {
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
    prompterSubscribe: prompter.subscribePrompter,
  });
  return { storage, sync, prompter };
}

async function seedRundown(srv: TestServer, fc: FakeClock): Promise<void> {
  const { sync, storage } = srv;
  sync.access.create(ANA.userId, {
    docId: RUNDOWN,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  sync.access.create(ANA.userId, {
    docId: STORY_A,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  sync.access.create(ANA.userId, {
    docId: STORY_B,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(RUNDOWN, SAM.userId, "edit", [
    "edit_rundowns",
    "send_to_prompter",
  ]);
  storage.directory.setRole(RUNDOWN, LEO.userId, "edit", ["edit_rundowns"]);

  const peer = fakePeer({
    userId: ANA.userId,
    name: ANA.name,
    deviceId: "seed",
  });
  sync.attach(peer);

  const pushStory = (docId: string, clientId: number, text: string): void => {
    const doc = createDoc({ clientId });
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: `blk-${clientId}`, type: "dialogue" },
          content: [{ type: "text", text }],
        },
      ]),
    );
    sync.receive(peer, {
      type: "SUBSCRIBE",
      docId,
      generation: 0,
      mode: "edit",
      clientIds: [clientId],
      lastServerSeq: 0,
    });
    sync.receive(peer, {
      type: "PUSH",
      docId,
      generation: 1,
      clientSeq: 1,
      update: doc.encodeState(),
      heal: false,
    });
  };
  pushStory(STORY_A, 101, "Story A spoken line");
  pushStory(STORY_B, 102, "Story B spoken line");

  const rdDoc = createDoc({ clientId: 103 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-25",
      airAt: fc.clock.now() + 60_000,
      windowLeadMs: 65_000,
      targetMs: 60_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rdDoc,
    [
      { id: ROW_A, kind: "script", docId: STORY_A, blockId: null },
      { id: ROW_B, kind: "script", docId: STORY_B, blockId: null },
    ],
    null,
  );
  sync.receive(peer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [103],
    lastServerSeq: 0,
  });
  sync.receive(peer, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 1,
    update: rdDoc.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  sync.detach(peer);
}

const extractControls = (msgs: Message[], kind: string) =>
  msgs.filter(
    (m): m is Extract<Message, { type: "CONTROL" }> =>
      m.type === "CONTROL" && m.kind === kind,
  );

async function callControl(
  prompter: PrompterService,
  user: Identity | null,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  const request = new Request(`http://localhost:5901${path}`, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const response = await answerPrompterRequest(request, {
    service: prompter,
    user: () => user,
  });
  if (response === null) throw new Error(`unmatched route ${method} ${path}`);
  return response;
}

test("operator CAS take/takeover, 403 without send_to_prompter, 409 wrong deviceId, and dual fanout", async () => {
  const fc = fakeClock(100_000);
  const srv = createTestServer(fc);
  await seedRundown(srv, fc);

  // Attach one rundown editor peer and one prompter-mode peer
  const editorPeer = fakePeer({
    userId: ANA.userId,
    name: ANA.name,
    deviceId: "dev-ana-1",
  });
  const prompterPeer = fakePeer({
    userId: LEO.userId,
    name: LEO.name,
    deviceId: "dev-prompter-1",
  });
  srv.sync.attach(editorPeer);
  srv.sync.attach(prompterPeer);
  srv.sync.receive(editorPeer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [301],
    lastServerSeq: 0,
  });
  srv.sync.receive(prompterPeer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  await flushAll(fc);
  editorPeer.take();
  prompterPeer.take();

  // Leo lacks send_to_prompter -> 403
  const forbiddenTake = await callControl(
    srv.prompter,
    LEO,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-leo", expectedUserId: null },
  );
  expect(forbiddenTake.status).toBe(403);

  // Ana takes control
  const take1 = await callControl(
    srv.prompter,
    ANA,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-ana-1", expectedUserId: null },
  );
  expect(take1.status).toBe(200);
  const take1Body = (await take1.json()) as {
    operator: { userId: string; deviceId: string; expiresAt: number };
    serverTime: number;
  };
  expect(take1Body.operator.userId).toBe("ana");
  expect(take1Body.operator.deviceId).toBe("dev-ana-1");
  expect(take1Body.operator.expiresAt).toBe(100_000 + PROMPTER_OPERATOR_TTL_MS);

  // BOTH rundown editor peer AND prompter-mode peer receive CONTROL prompter_operator_changed
  const edTakeCtrls = extractControls(
    editorPeer.take(),
    "prompter_operator_changed",
  );
  const prTakeCtrls = extractControls(
    prompterPeer.take(),
    "prompter_operator_changed",
  );
  expect(edTakeCtrls).toHaveLength(1);
  expect(prTakeCtrls).toHaveLength(1);
  expect(
    parsePrompterOperatorChanged(prTakeCtrls[0]!.data)?.operator?.userId,
  ).toBe("ana");

  // Wrong deviceId for same user -> 409 not_operator
  const wrongDeviceCmd = await callControl(
    srv.prompter,
    ANA,
    "POST",
    `/api/prompter/${RUNDOWN}/control`,
    { action: "play", deviceId: "dev-ana-OTHER", linesPerSecond: 4 },
  );
  expect(wrongDeviceCmd.status).toBe(409);

  // Sam tries to take with stale expectedUserId: null -> 409 operator_taken naming Ana
  const conflictTake = await callControl(
    srv.prompter,
    SAM,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-sam-1", expectedUserId: null },
  );
  expect(conflictTake.status).toBe(409);
  const conflictBody =
    (await conflictTake.json()) as PrompterOperatorTakenResponse;
  expect(conflictBody.error).toBe("operator_taken");
  expect(conflictBody.operator.userId).toBe("ana");

  // Ana sends play + cue -> BOTH peers receive prompter_scroll
  const playRes = await callControl(
    srv.prompter,
    ANA,
    "POST",
    `/api/prompter/${RUNDOWN}/control`,
    { action: "play", deviceId: "dev-ana-1", linesPerSecond: 4 },
  );
  expect(playRes.status).toBe(200);
  const edPlay = extractControls(editorPeer.take(), "prompter_scroll");
  const prPlay = extractControls(prompterPeer.take(), "prompter_scroll");
  expect(edPlay).toHaveLength(1);
  expect(prPlay).toHaveLength(1);
  expect(parsePrompterScrollControl(prPlay[0]!.data)?.scroll).toEqual({
    seq: 1,
    playing: true,
    linesPerSecond: 4,
    rowId: null,
    lineOffset: 0,
    updatedAt: 100_000,
    operatorUserId: "ana",
    operatorDeviceId: "dev-ana-1",
  });

  // Explicit CAS takeover by Sam naming expectedUserId: "ana" succeeds
  const takeover = await callControl(
    srv.prompter,
    SAM,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-sam-1", expectedUserId: "ana" },
  );
  expect(takeover.status).toBe(200);
  const statusRes = await callControl(
    srv.prompter,
    LEO,
    "GET",
    `/api/prompter/${RUNDOWN}/control`,
  );
  expect(statusRes.status).toBe(200);
  const statusBody = (await statusRes.json()) as {
    operator: { userId: string } | null;
    scroll: { seq: number } | null;
  };
  expect(statusBody.operator?.userId).toBe("sam");
  expect(statusBody.scroll?.seq).toBe(1);

  srv.prompter.stop();
});

test("operator lease auto-releases on socket disconnect and on 30 s TTL expiry", async () => {
  const fc = fakeClock(200_000);
  const srv = createTestServer(fc);
  await seedRundown(srv, fc);

  const opPeer = fakePeer({
    userId: ANA.userId,
    name: ANA.name,
    deviceId: "dev-ana-1",
  });
  const prompterPeer = fakePeer({
    userId: SAM.userId,
    name: SAM.name,
    deviceId: "dev-prompter",
  });
  srv.sync.attach(opPeer);
  srv.sync.attach(prompterPeer);
  srv.sync.receive(opPeer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [401],
    lastServerSeq: 0,
  });
  srv.sync.receive(prompterPeer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  await flushAll(fc);

  await callControl(
    srv.prompter,
    ANA,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-ana-1", expectedUserId: null },
  );
  prompterPeer.take();

  // Detaching operator's socket auto-releases the lease
  srv.sync.detach(opPeer);
  await flushAll(fc);
  const afterDisconnect = prompterPeer
    .take()
    .filter(
      (m): m is Extract<Message, { type: "CONTROL" }> =>
        m.type === "CONTROL" && m.kind === "prompter_operator_changed",
    );
  expect(afterDisconnect).toHaveLength(1);
  expect(
    parsePrompterOperatorChanged(afterDisconnect[0]!.data)?.operator,
  ).toBeNull();

  // Now Sam takes control and lets 30 s TTL expire without renewing
  await callControl(
    srv.prompter,
    SAM,
    "POST",
    `/api/prompter/${RUNDOWN}/operator/take`,
    { deviceId: "dev-sam-ttl", expectedUserId: null },
  );
  prompterPeer.take();

  fc.advance(PROMPTER_OPERATOR_TTL_MS - 1);
  const beforeExpiry = await callControl(
    srv.prompter,
    SAM,
    "GET",
    `/api/prompter/${RUNDOWN}/control`,
  );
  expect(
    ((await beforeExpiry.json()) as { operator: unknown }).operator,
  ).not.toBeNull();

  fc.advance(1);
  const afterTtl = prompterPeer
    .take()
    .filter(
      (m): m is Extract<Message, { type: "CONTROL" }> =>
        m.type === "CONTROL" && m.kind === "prompter_operator_changed",
    );
  expect(afterTtl).toHaveLength(1);
  expect(parsePrompterOperatorChanged(afterTtl[0]!.data)?.operator).toBeNull();

  srv.prompter.stop();
});

test("PrompterFeedHub.addFeedListener fires on initial attach, sends and row reorders even with zero browser prompters", async () => {
  const fc = fakeClock(300_000);
  const srv = createTestServer(fc);
  await seedRundown(srv, fc);

  const seen: (PrompterFeed | null)[] = [];
  const stopListening = srv.prompter.feed.addFeedListener(RUNDOWN, (feed) => {
    seen.push(feed);
  });
  expect(seen).toHaveLength(1);
  expect(seen[0]?.runOrder.map((r) => r.rowId)).toEqual([ROW_A, ROW_B]);
  expect(seen[0]?.stories).toEqual([]);

  // Sending row A triggers listener with story A's spoken blocks
  const sendA = srv.prompter.send(ANA.userId, {
    docId: RUNDOWN,
    rowId: ROW_A,
    key: keyOf(1),
  });
  await flushAll(fc);
  expect((await sendA).ok).toBe(true);
  expect(seen).toHaveLength(2);
  expect(seen[1]?.stories.map((s) => s.storyId)).toEqual([ROW_A]);

  // Reordering row B before row A fires listener with new run order
  const file = srv.storage.open({ kind: "project", id: PROJECT });
  const row = file.log.get(RUNDOWN)!;
  const rdDoc = createDoc({ clientId: 501 });
  for (const entry of file.log.tail(RUNDOWN, row.generation, 0).rows)
    rdDoc.applyUpdate(entry.update);
  const updates: Uint8Array[] = [];
  const stopSub = rdDoc.subscribe((u) => updates.push(u));
  moveRows(rdDoc, [ROW_B], null);
  stopSub();

  const editor = fakePeer({ userId: ANA.userId, name: ANA.name });
  srv.sync.attach(editor);
  srv.sync.receive(editor, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [501],
    lastServerSeq: 0,
  });
  srv.sync.receive(editor, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: row.generation,
    clientSeq: 1,
    update: updates[0]!,
    heal: false,
  });
  await flushAll(fc);

  expect(seen).toHaveLength(3);
  expect(seen[2]?.runOrder.map((r) => r.rowId)).toEqual([ROW_B, ROW_A]);

  stopListening();
  srv.sync.detach(editor);
  srv.prompter.stop();
});

test("static routes, scroll commands (speed/cue/nudge/pause/release), revocation and late-joining prompter snapshot", async () => {
  const fc = fakeClock(500_000);
  const srv = createTestServer(fc);
  await seedRundown(srv, fc);

  // Take via static route path (body carries docId)
  const take = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/operator/take",
    { docId: RUNDOWN, deviceId: "dev-static", expectedUserId: null },
  );
  expect(take.status).toBe(200);

  // Play at 4 l/s, advance 2 s -> projected offset = 8, then speed change pivots cleanly to 8
  await callControl(srv.prompter, ANA, "POST", "/api/prompter/control", {
    docId: RUNDOWN,
    action: "play",
    deviceId: "dev-static",
    linesPerSecond: 4,
  });
  fc.advance(2_000);
  const speedRes = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/control",
    {
      docId: RUNDOWN,
      action: "speed",
      deviceId: "dev-static",
      linesPerSecond: 2,
    },
  );
  const speedBody = (await speedRes.json()) as {
    scroll: { lineOffset: number; linesPerSecond: number; playing: boolean };
  };
  expect(speedBody.scroll.lineOffset).toBe(8);
  expect(speedBody.scroll.linesPerSecond).toBe(2);
  expect(speedBody.scroll.playing).toBe(true);

  // Cue to ROW_B at lineOffset 1, then nudge +2 and pause
  await callControl(srv.prompter, ANA, "POST", "/api/prompter/control", {
    docId: RUNDOWN,
    action: "cue",
    deviceId: "dev-static",
    rowId: ROW_B,
    lineOffset: 1,
  });
  const nudgeRes = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/control",
    { docId: RUNDOWN, action: "nudge", deviceId: "dev-static", deltaLines: 2 },
  );
  const nudgeBody = (await nudgeRes.json()) as {
    scroll: { rowId: string; lineOffset: number };
  };
  expect(nudgeBody.scroll.rowId).toBe(ROW_B);
  expect(nudgeBody.scroll.lineOffset).toBe(3);

  // Late-joining prompter peer immediately receives active operator + scroll CONTROL after VIEW_SNAPSHOT
  const latePeer = fakePeer({ userId: LEO.userId, name: LEO.name });
  srv.sync.attach(latePeer);
  srv.sync.receive(latePeer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  const lateMsgs = latePeer.take();
  expect(lateMsgs.map((m) => m.type)).toEqual([
    "SUBSCRIBED",
    "VIEW_SNAPSHOT",
    "CONTROL",
    "CONTROL",
  ]);
  const lateKinds = lateMsgs
    .filter(
      (m): m is Extract<Message, { type: "CONTROL" }> => m.type === "CONTROL",
    )
    .map((m) => m.kind);
  expect(lateKinds).toEqual(["prompter_operator_changed", "prompter_scroll"]);

  // Revoking send_to_prompter refuses further scroll commands (403)
  srv.storage.directory.setRole(RUNDOWN, ANA.userId, "edit", ["edit_rundowns"]);
  const afterRevoke = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/control",
    { docId: RUNDOWN, action: "pause", deviceId: "dev-static" },
  );
  expect(afterRevoke.status).toBe(403);

  // Wrong deviceId cannot release (409), matching deviceId releases cleanly (200)
  const wrongRel = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/operator/release",
    { docId: RUNDOWN, deviceId: "dev-other" },
  );
  expect(wrongRel.status).toBe(409);
  const okRel = await callControl(
    srv.prompter,
    ANA,
    "POST",
    "/api/prompter/operator/release",
    { docId: RUNDOWN, deviceId: "dev-static" },
  );
  expect(okRel.status).toBe(200);
  const staticStatus = await callControl(
    srv.prompter,
    LEO,
    "GET",
    `/api/prompter/control?docId=${RUNDOWN}`,
  );
  expect(staticStatus.status).toBe(200);
  const statusJson = (await staticStatus.json()) as {
    operator: unknown;
    scroll: { playing: boolean };
  };
  expect(statusJson.operator).toBeNull();
  expect(statusJson.scroll.playing).toBe(false);

  srv.prompter.stop();
});
