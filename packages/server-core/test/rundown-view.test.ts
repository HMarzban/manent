import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  moveRows,
  readRundown,
  removeRows,
  setCell,
  setRundownFields,
  writeDurations,
  writePrompterState,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Message } from "@manent/sync-protocol";
import {
  createAirWindows,
  createSyncService,
  encodeRundownView,
  rundownViewPatch,
  rundownViewSnapshot,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";

const T0 = 1_811_808_000_000;
const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const HOME = `project:${PROJECT}`;
const ROW_1 = "row-view-0000001";
const ROW_2 = "row-view-0000002";
const ROW_3 = "row-view-0000003";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

const decode = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder().decode(bytes));

function captureUpdate(
  doc: ReturnType<typeof createDoc>,
  fn: () => void,
): Uint8Array {
  const updates: Uint8Array[] = [];
  const stop = doc.subscribe((u) => updates.push(u));
  fn();
  stop();
  return updates[0] ?? new Uint8Array();
}

function createRundownWorld() {
  const fc = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  let seq = 0;
  const ids = (): string => `id-${++seq}`;
  const airWindows = createAirWindows({ clock: fc.clock, storage });
  const service = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [airWindows.hooks],
    airWindow: airWindows.isInside,
    airWindowOf: airWindows.windowOf,
  });
  service.access.create("sam", { docId: RUNDOWN, kind: "rundown", home: HOME });
  storage.directory.setRole(RUNDOWN, "sam", "owner", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "leo", "view", []);
  storage.directory.setRole(RUNDOWN, "ana", "comment", []);

  const sam = fakePeer({ userId: "sam", name: "Sam" });
  const leo = fakePeer({ userId: "leo", name: "Leo" });
  const ana = fakePeer({ userId: "ana", name: "Ana" });
  service.attach(sam);
  service.attach(leo);
  service.attach(ana);

  // Seed initial rundown state via Sam
  const samDoc = createDoc({ clientId: 401 });
  initRundown(
    samDoc,
    {
      airDate: "2026-11-25",
      airAt: T0 + 7_200_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    samDoc,
    [
      { id: ROW_1, kind: "header", docId: null, blockId: null },
      { id: ROW_2, kind: "item", docId: null, blockId: null },
    ],
    null,
  );
  setCell(samDoc, ROW_2, "segment", "Cold Open", {
    userId: "sam",
    now: () => T0,
  });

  service.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [401],
    lastServerSeq: 0,
  });
  service.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 1,
    update: samDoc.encodeState(),
    heal: false,
  });
  fc.runDeferred();
  sam.take();

  return { fc, storage, service, sam, leo, ana, samDoc };
}

test("rundownViewSnapshot and rundownViewPatch project only touched roots and rows", () => {
  const doc = createDoc({ clientId: 1 });
  initRundown(
    doc,
    {
      airDate: "2026-11-25",
      airAt: T0 + 3_600_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: ROW_1, kind: "header", docId: null, blockId: null },
      { id: ROW_2, kind: "item", docId: null, blockId: null },
    ],
    null,
  );

  const snap = rundownViewSnapshot(readRundown(doc));
  expect(decode(encodeRundownView(snap))).toEqual({
    v: 1,
    kind: "rundown",
    rundown: {
      airDate: "2026-11-25",
      airAt: T0 + 3_600_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    columns: [...SHOW_COLUMNS],
    rows: readRundown(doc).rows,
  });

  // Single cell edit touches only ROW_2, not ROW_1, not rundown, not columns
  const cellUpdate = captureUpdate(doc, () =>
    setCell(doc, ROW_2, "segment", "Monologue", {
      userId: "sam",
      now: () => T0 + 100,
    }),
  );
  expect(rundownViewPatch(doc, cellUpdate)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [readRundown(doc).rows.find((r) => r.id === ROW_2)!],
  });

  // Field update touches only rundown root
  const fieldUpdate = captureUpdate(doc, () =>
    setRundownFields(doc, { targetMs: 2_400_000 }),
  );
  expect(rundownViewPatch(doc, fieldUpdate)).toEqual({
    v: 1,
    kind: "rundown",
    rundown: {
      airDate: "2026-11-25",
      airAt: T0 + 3_600_000,
      windowLeadMs: 3_600_000,
      targetMs: 2_400_000,
    },
    remove: [],
    upsert: [],
  });

  // Authority duration & prompter updates emit row upserts with server-only keys
  const durUpdate = captureUpdate(doc, () =>
    writeDurations(doc, new Map([[ROW_2, 45_000]])),
  );
  expect(rundownViewPatch(doc, durUpdate)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [
      expect.objectContaining({
        id: ROW_2,
        durationMs: 45_000,
      }),
    ],
  });

  const prompterUpdate = captureUpdate(doc, () =>
    writePrompterState(doc, ROW_2, {
      state: "on",
      versionId: "v-1",
      sentAt: T0 + 500,
      sentByUserId: "sam",
    }),
  );
  expect(rundownViewPatch(doc, prompterUpdate)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [
      expect.objectContaining({
        id: ROW_2,
        prompter: {
          state: "on",
          versionId: "v-1",
          sentAt: T0 + 500,
          sentByUserId: "sam",
        },
      }),
    ],
  });

  // Removing ROW_1 reports only ROW_1 in remove
  const removeUpdate = captureUpdate(doc, () => removeRows(doc, [ROW_1]));
  expect(rundownViewPatch(doc, removeUpdate)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [ROW_1],
    upsert: [],
  });

  doc.destroy();
});

test("Can view and Can comment rundown subscribers get projected snapshot, airWindow and incremental patches without CRDT or awareness", () => {
  const { fc, storage, service, sam, leo, ana, samDoc } = createRundownWorld();

  // Edit subscribe refused for view and comment
  service.receive(leo, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [501],
    lastServerSeq: 0,
  });
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "read_only_role" },
  ]);

  // Leo subscribes in view mode
  service.receive(leo, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "view",
    clientIds: [],
    lastServerSeq: 0,
  });
  const leoJoin = leo.take();
  expect(leoJoin.map((m) => m.type)).toEqual(["SUBSCRIBED", "VIEW_SNAPSHOT"]);
  expect(leoJoin[0]).toMatchObject({
    type: "SUBSCRIBED",
    role: "view",
    airWindow: {
      startsAt: T0 + 3_600_000,
      endsAt: T0 + 7_200_000 + 1_800_000,
    },
  });
  const snap = leoJoin[1] as Extract<Message, { type: "VIEW_SNAPSHOT" }>;
  expect(decode(snap.content)).toEqual({
    v: 1,
    kind: "rundown",
    ...readRundown(samDoc),
  });

  // Ana (comment) also subscribes in view mode (receives SUBSCRIBED, viewer_count CONTROL, VIEW_SNAPSHOT)
  service.receive(ana, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "view",
    clientIds: [],
    lastServerSeq: 0,
  });
  const anaJoin = ana.take();
  expect(anaJoin.map((m) => m.type)).toEqual([
    "SUBSCRIBED",
    "CONTROL",
    "VIEW_SNAPSHOT",
  ]);
  expect(anaJoin[0]).toMatchObject({ type: "SUBSCRIBED", role: "comment" });
  expect(anaJoin[1]).toMatchObject({
    type: "CONTROL",
    kind: "viewers_counted",
  });
  leo.take(); // drain viewer count CONTROL

  // Sam pushes a new row, a move, and a cell update
  const insertUpdate = captureUpdate(samDoc, () =>
    insertRows(
      samDoc,
      [{ id: ROW_3, kind: "item", docId: null, blockId: null }],
      ROW_2,
    ),
  );
  service.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 2,
    update: insertUpdate,
    heal: false,
  });
  fc.runDeferred();

  const leoAfterInsert = leo.take();
  expect(leoAfterInsert.map((m) => m.type)).toEqual(["VIEW_PATCH"]);
  const insertPatch = leoAfterInsert[0] as Extract<
    Message,
    { type: "VIEW_PATCH" }
  >;
  expect(decode(insertPatch.patch)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [readRundown(samDoc).rows.find((r) => r.id === ROW_3)!],
  });

  // Move ROW_3 before ROW_1
  const moveUpdate = captureUpdate(samDoc, () =>
    moveRows(samDoc, [ROW_3], null),
  );
  service.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 3,
    update: moveUpdate,
    heal: false,
  });
  fc.runDeferred();

  const leoAfterMove = leo.take();
  expect(leoAfterMove.map((m) => m.type)).toEqual(["VIEW_PATCH"]);
  const movePatch = leoAfterMove[0] as Extract<Message, { type: "VIEW_PATCH" }>;
  expect(decode(movePatch.patch)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [readRundown(samDoc).rows.find((r) => r.id === ROW_3)!],
  });

  // Leo cannot push or request SYNC step1
  service.receive(leo, {
    type: "SYNC",
    docId: RUNDOWN,
    generation: 1,
    step: "step1",
    data: new Uint8Array([0]),
  });
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);

  // Revoking leo evicts him and stops further patches while ana keeps receiving them
  ana.take();
  storage.directory.removeRole(RUNDOWN, "leo");
  service.membershipChanged(RUNDOWN, "leo", null, "sam");
  expect(leo.take()).toContainEqual(
    expect.objectContaining({
      type: "ERROR",
      code: 4403,
      message: "forbidden",
    }),
  );
  ana.take();
  const afterRevoke = captureUpdate(samDoc, () =>
    setCell(samDoc, ROW_2, "segment", "Closing", {
      userId: "sam",
      now: () => T0 + 200,
    }),
  );
  service.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 4,
    update: afterRevoke,
    heal: false,
  });
  fc.runDeferred();
  expect(leo.take()).toEqual([]);
  expect(ana.take().map((m) => m.type)).toEqual(["VIEW_PATCH"]);

  samDoc.destroy();
});

test("authorityWrite on a rundown streams VIEW_PATCH to viewers even with no editors connected", async () => {
  const { fc, service, sam, leo, samDoc } = createRundownWorld();
  // Disconnect Sam and let the room unload
  service.detach(sam);
  fc.advance(600_000);
  expect(service.stats().loadedRooms).toBe(0);

  // Leo joins as viewer -> room stays unloaded!
  service.receive(leo, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "view",
    clientIds: [],
    lastServerSeq: 0,
  });
  expect(leo.take().map((m) => m.type)).toEqual([
    "SUBSCRIBED",
    "VIEW_SNAPSHOT",
  ]);
  expect(service.stats().loadedRooms).toBe(0);

  // Server writes durationMs and prompter state via authorityWrite
  const writing = service.authorityWrite(RUNDOWN, {
    userId: "system",
    origin: "system",
    edit(doc) {
      writeDurations(doc, new Map([[ROW_2, 92_000]]));
      writePrompterState(doc, ROW_2, {
        state: "on",
        versionId: "v-prompter",
        sentAt: T0 + 1_000,
        sentByUserId: "sam",
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  fc.runDeferred();
  const outcome = await writing;
  expect(outcome.ok).toBe(true);

  const patches = leo.take();
  expect(patches.map((m) => m.type)).toEqual(["VIEW_PATCH"]);
  const patch = patches[0] as Extract<Message, { type: "VIEW_PATCH" }>;
  expect(decode(patch.patch)).toEqual({
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [
      expect.objectContaining({
        id: ROW_2,
        durationMs: 92_000,
        prompter: {
          state: "on",
          versionId: "v-prompter",
          sentAt: T0 + 1_000,
          sentByUserId: "sam",
        },
      }),
    ],
  });

  samDoc.destroy();
});
