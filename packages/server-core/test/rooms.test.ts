import { beforeEach, expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { rejects, validateDoc } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  DEFAULT_LIMITS,
  createInlineCheckpointer,
  createRooms,
  runCheckpointJob,
} from "../src/index.ts";
import type { Room, Rooms, Subscription, SyncLimits } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";
import {
  BLOCK,
  DOC,
  HOME,
  PROJECT,
  appendAll,
  appendMore,
  createTypist,
  placeScript,
  replayAll,
  seedLog,
} from "./seed.ts";

let storage: MemoryStorage;
let clock: FakeClock;
let rooms: Rooms;

function start(limits: Partial<SyncLimits> = {}): void {
  storage = createMemoryStorage({ now: () => clock.clock.now() });
  rooms = createRooms({
    storage,
    clock: clock.clock,
    limits: { ...DEFAULT_LIMITS, ...limits },
    checkpointer: createInlineCheckpointer({ storage, defer: clock.defer }),
  });
}

beforeEach(() => {
  clock = fakeClock(1_000);
  start();
});

const editor = (): Subscription => ({
  peer: fakePeer(),
  mode: "edit",
  access: { role: "owner", capabilities: [] },
  stalled: false,
});

function loaded(docId = DOC): Room {
  const room = rooms.room(docId, HOME, "script");
  expect(rooms.load(room)).toEqual({ ok: true });
  return room;
}

/** Scripts placed in HOME, each with one row, so that each can be loaded. */
function placeMany(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const docId = `${PROJECT.slice(0, -2)}${String(i).padStart(2, "0")}`;
    placeScript(storage, { docId });
    appendAll(storage, [createTypist(200 + i).insertBlock(BLOCK, null)], {
      docId,
    });
    return docId;
  });
}

test("a room loads from the newest checkpoint and the tail, and equals a full replay", () => {
  const typist = seedLog(storage, 2_500);
  runCheckpointJob(storage, { home: HOME, docId: DOC });
  appendMore(storage, typist, 40);
  const room = rooms.room(DOC, HOME, "script");
  expect(rooms.load(room)).toEqual({ ok: true });
  expect(scriptBody(room.doc!).materialize()).toEqual(replayAll(storage));
  expect(room.sinceCheckpoint).toBe(40);
  expect(room.row.headSeq).toBe(2_540);
});

test("a damaged checkpoint falls back to an older one, and to the bare log", () => {
  const typist = seedLog(storage, 300);
  runCheckpointJob(storage, { home: HOME, docId: DOC });
  appendMore(storage, typist, 20);
  runCheckpointJob(storage, { home: HOME, docId: DOC });
  appendMore(storage, typist, 5);
  const room = loaded();
  storage.corruptCheckpoint(DOC);
  rooms.reload(room);
  expect([room.sinceCheckpoint, scriptBody(room.doc!).materialize()]).toEqual([
    25,
    replayAll(storage),
  ]);
  storage.corruptCheckpoint(DOC);
  rooms.reload(room);
  expect([room.sinceCheckpoint, scriptBody(room.doc!).materialize()]).toEqual([
    325,
    replayAll(storage),
  ]);
});

test("a damaged row is quarantined, what depended on it is dropped, and the document is flagged", () => {
  placeScript(storage);
  const typist = createTypist(101);
  const second = "b000000000000002";
  // rows 3 and later type inside the block row 2 created
  appendAll(storage, [
    typist.insertBlock(BLOCK, null, "Rain"),
    typist.insertBlock(second, BLOCK),
    typist.type(second, "Dusk"),
    typist.type(second, " falls"),
  ]);
  storage.corruptRow(DOC, 2);
  const room = rooms.room(DOC, HOME, "script");
  rooms.load(room);
  expect(room.doc!.hasPendingStructs()).toBe(false);
  expect(room.file.log.healing(DOC)).toMatchObject({
    reason: "quarantine",
    verifiedSeq: 1,
  });
  expect(rejects(validateDoc(scriptBody(room.doc!).materializeRaw()))).toBe(
    false,
  );
  const expected = createTypist(9);
  expected.insertBlock(BLOCK, null, "Rain");
  expect(scriptBody(room.doc!).materialize()).toEqual(
    scriptBody(expected.doc).materialize(),
  );
});

test("the full state is encoded once per change and reused", () => {
  const typist = seedLog(storage, 10);
  const room = loaded();
  const first = rooms.fullState(room);
  // the same object
  expect(rooms.fullState(room)).toBe(first);
  const sizeBefore = room.sizeBytes;
  const anUpdate = typist.type(BLOCK, "x");
  room.doc!.applyUpdate(anUpdate);
  rooms.changed(room, anUpdate.byteLength);
  expect(rooms.fullState(room)).not.toBe(first);
  expect(room.sizeBytes).toBe(sizeBefore + anUpdate.byteLength);
});

test("a room unloads 30 s after its last editor leaves, asks for a checkpoint, and keeps nothing", () => {
  seedLog(storage, 10);
  const room = loaded();
  const sub = editor();
  room.editors.set(sub.peer, sub);
  rooms.changed(room, 10);
  room.editors.delete(sub.peer);
  rooms.left(room);
  clock.advance(29_999);
  expect(rooms.stats()).toEqual({ rooms: 1, loaded: 1 });
  clock.advance(1);
  clock.runDeferred();
  expect(rooms.stats()).toEqual({ rooms: 0, loaded: 0 });
  expect(rooms.find(DOC)).toBeNull();
  expect(room.file.checkpoints.newest(DOC, 1)!.seq).toBe(room.row.headSeq);
});

test("an editor who comes back within 30 s keeps the room", () => {
  seedLog(storage, 10);
  const room = loaded();
  const sub = editor();
  room.editors.set(sub.peer, sub);
  room.editors.delete(sub.peer);
  rooms.left(room);
  clock.advance(20_000);
  room.editors.set(sub.peer, sub);
  clock.advance(60_000);
  expect(rooms.stats()).toEqual({ rooms: 1, loaded: 1 });
});

test("a room with only viewers holds no document", () => {
  seedLog(storage, 10);
  const room = rooms.room(DOC, HOME, "script");
  const viewer: Subscription = { ...editor(), mode: "view" };
  room.viewers.set(viewer.peer, viewer);
  expect(rooms.stats()).toEqual({ rooms: 1, loaded: 0 });
  expect(room.doc).toBeNull();
  room.viewers.delete(viewer.peer);
  rooms.left(room);
  expect(rooms.stats()).toEqual({ rooms: 0, loaded: 0 });
});

test("every 2,000 updates a checkpoint is asked for", () => {
  const typist = seedLog(storage, 1);
  runCheckpointJob(storage, { home: HOME, docId: DOC });
  const room = loaded();
  expect(room.sinceCheckpoint).toBe(0);
  appendMore(storage, typist, 2_000);
  for (let n = 1; n <= 1_999; n++) rooms.changed(room, 1);
  clock.runDeferred();
  expect(room.file.checkpoints.newest(DOC, 1)!.seq).toBe(1);
  rooms.changed(room, 1);
  clock.runDeferred();
  expect(room.file.checkpoints.newest(DOC, 1)!.seq).toBe(2_001);
  expect(room.row.headSeq).toBe(2_001);
  expect(room.sinceCheckpoint).toBe(0);
});

test("at the cap the idlest room without an editor makes way; with editors everywhere the answer is busy", () => {
  start({ maxLoadedRooms: 2 });
  const [a, b, c, d] = placeMany(4).map((docId) =>
    rooms.room(docId, HOME, "script"),
  ) as [Room, Room, Room, Room];
  const subA = editor();
  rooms.load(a);
  a.editors.set(subA.peer, subA);
  rooms.load(b);
  expect(rooms.load(c)).toEqual({ ok: true });
  expect([a.doc === null, b.doc === null, c.doc === null]).toEqual([
    false,
    true,
    false,
  ]);
  const subC = editor();
  c.editors.set(subC.peer, subC);
  expect(rooms.load(d)).toEqual({ ok: false, code: "busy" });
  expect(rooms.stats()).toEqual({ rooms: 3, loaded: 2 });
});

test("loads are bounded per second", () => {
  start({ roomLoadsPerSecond: 2 });
  const [a, b, c] = placeMany(3).map((docId) =>
    rooms.room(docId, HOME, "script"),
  ) as [Room, Room, Room];
  expect([rooms.load(a), rooms.load(b), rooms.load(c)]).toEqual([
    { ok: true },
    { ok: true },
    { ok: false, code: "busy" },
  ]);
  clock.advance(500);
  expect(rooms.load(c)).toEqual({ ok: true });
});
