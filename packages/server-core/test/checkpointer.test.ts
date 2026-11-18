import { afterAll, beforeEach, expect, test } from "bun:test";
import { loadDoc, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { createTempTrees } from "@manent/testkit";
import {
  DEFAULT_LIMITS,
  createInlineCheckpointer,
  createRooms,
  createWorkerCheckpointer,
  runCheckpointJob,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import {
  BLOCK,
  DOC,
  HOME,
  appendAll,
  replayAll,
  replayThrough,
  seedLog,
} from "./seed.ts";
import type { Typist } from "./seed.ts";

const trees = createTempTrees("manent-checkpoints-");
afterAll(() => trees.removeAll());

let storage: MemoryStorage;
beforeEach(() => {
  storage = createMemoryStorage({ now: () => 1_000 });
});

const WORKER = new URL("./fixtures/checkpoint-worker.ts", import.meta.url);

function appendOne(on: Storage, typist: Typist, n: number): void {
  appendAll(on, [typist.type(BLOCK, String(n % 10))]);
}

test("the stored checkpoint format is version 1: this state still loads", () => {
  const FIXTURE =
    "010a010007010b70726f73656d6972726f72030773656374696f6e070001000305626c6f636b2800010102696401771062303030303030303030303030303031" +
    "280001010474797065017706616374696f6e28000101076f6d69747465640179280001010873796e6f7073697301770028000101076e6f436f6e7464017928000101086e" +
    "6f54696d696e670179070001010604000108045261696e00";
  // written by Yjs 13.6.33: one section, one action block b000000000000001, "Rain"
  const doc = loadDoc(new Uint8Array(Buffer.from(FIXTURE, "hex")));
  expect(
    blocksOf(scriptBody(doc).materialize()).map((b) => [
      b.attrs.id,
      b.attrs.type,
      blockText(b),
    ]),
  ).toEqual([["b000000000000001", "action", "Rain"]]);
});
// if this fails, a new format is needed (CHECKPOINT_FORMAT_VERSION 2 beside 1), never a change to this fixture

test("a job writes the state at the head, through a document", () => {
  seedLog(storage, 300);
  expect(runCheckpointJob(storage, { home: HOME, docId: DOC })).toEqual({
    seq: 300,
  });
  const newest = storage.open(HOME).checkpoints.newest(DOC, 1)!;
  expect(newest.seq).toBe(300);
  expect(scriptBody(loadDoc(newest.state)).materialize()).toEqual(
    replayAll(storage),
  );
  // nothing new
  expect(runCheckpointJob(storage, { home: HOME, docId: DOC })).toBeNull();
});

test("a job leaves a damaged row for the serving thread", () => {
  seedLog(storage, 30);
  storage.corruptRow(DOC, 12);
  expect(runCheckpointJob(storage, { home: HOME, docId: DOC })).toBeNull();
  const file = storage.open(HOME);
  expect(file.log.tail(DOC, 1, 0, { quarantine: false }).corrupt).toEqual([12]);
  expect(file.log.healing(DOC)).toBeNull();
  expect(file.checkpoints.newest(DOC, 1)).toBeNull();
});

test("an inline job runs when the turn ends, or at once when idle is awaited", async () => {
  seedLog(storage, 20);
  const clock = fakeClock();
  const inline = createInlineCheckpointer({ storage, defer: clock.defer });
  inline.request({ home: HOME, docId: DOC });
  expect(storage.open(HOME).checkpoints.newest(DOC, 1)).toBeNull();
  await inline.idle();
  expect(storage.open(HOME).checkpoints.newest(DOC, 1)!.seq).toBe(20);
  clock.runDeferred();
  expect(storage.open(HOME).checkpoints.newest(DOC, 1)!.seq).toBe(20);
});

test(
  "the worker does the job off the serving thread",
  async () => {
    const dir = await trees.tree({});
    const sqlite = openSqliteStorage({ dir, now: () => 1_000 });
    seedLog(sqlite, 2_500);
    const cp = createWorkerCheckpointer({ entry: WORKER, data: { dir } });
    cp.request({ home: HOME, docId: DOC });
    await cp.idle();
    expect(sqlite.open(HOME).checkpoints.newest(DOC, 1)!.seq).toBe(2_500);
    await cp.close();
    sqlite.close();
  },
  { timeout: 30_000 },
);

test(
  "a checkpoint taken while commits go on holds exactly the rows up to its sequence",
  async () => {
    const dir = await trees.tree({});
    const sqlite = openSqliteStorage({ dir, now: () => 1_000 });
    const typist = seedLog(sqlite, 2_500);
    const clock = fakeClock();
    const rooms = createRooms({
      storage: sqlite,
      clock: clock.clock,
      limits: DEFAULT_LIMITS,
      checkpointer: createInlineCheckpointer({
        storage: sqlite,
        defer: clock.defer,
      }),
    });
    const cp = createWorkerCheckpointer({ entry: WORKER, data: { dir } });
    cp.request({ home: HOME, docId: DOC });
    // the serving thread keeps committing during the job
    for (let n = 1; n <= 200; n++) appendOne(sqlite, typist, n);
    await cp.idle();
    const newest = sqlite.open(HOME).checkpoints.newest(DOC, 1)!;
    expect(newest.seq).toBeGreaterThanOrEqual(2_500);
    expect(newest.seq).toBeLessThanOrEqual(2_700);
    // no row after its seq, none before it missing
    expect(scriptBody(loadDoc(newest.state)).materialize()).toEqual(
      replayThrough(sqlite, newest.seq),
    );
    rooms.load(rooms.room(DOC, HOME, "script"));
    expect(scriptBody(rooms.find(DOC)!.doc!).materialize()).toEqual(
      replayAll(sqlite),
    );
    await cp.close();
    sqlite.close();
  },
  { timeout: 30_000 },
);
