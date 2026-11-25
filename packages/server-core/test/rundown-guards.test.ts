import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  jsonMap,
  readRundown,
  scriptBody,
} from "@manent/crdt";
import {
  RUNDOWN_FIELDS_ROOT,
  SHOW_COLUMNS,
  RUNDOWN_COLUMNS_ROOT,
} from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  createAirWindows,
  createRundownDurations,
  createSyncService,
} from "../src/index.ts";
import type { SyncService } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const OTHER_RUNDOWN = "22222222-2222-7222-8222-222222222223";
const SCRIPT = "33333333-3333-7333-8333-333333333333";
const INDEX = "44444444-4444-7444-8444-444444444444";
const ROW_INDEX = "row-indx-0000001";
const ROW_ITEM = "row-item-0000001";
const ROW_OTHER = "row-othr-0000001";
const BLK_LINE = "blk-line-0000001";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

async function flushAll(fc: FakeClock): Promise<void> {
  for (let i = 0; i < 6; i++) {
    fc.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createWorld(fc: FakeClock) {
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  let seq = 0;
  const ids = (): string => `id-${++seq}`;
  let sync!: SyncService;
  const airWindows = createAirWindows({ clock: fc.clock, storage });
  const durations = createRundownDurations({
    clock: fc.clock,
    storage,
    sync: () => sync,
    readRateOf: () => 150,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [durations, airWindows.hooks],
    airWindow: airWindows.isInside,
    airWindowOf: airWindows.windowOf,
  });
  return { storage, sync, airWindows };
}

test("non-script documents and non-script links are neither timed nor given an air window", async () => {
  const fc = fakeClock(10_000);
  const { storage, sync, airWindows } = createWorld(fc);
  const home = `project:${PROJECT}`;
  sync.access.create("sam", { docId: RUNDOWN, kind: "rundown", home });
  sync.access.create("sam", { docId: OTHER_RUNDOWN, kind: "rundown", home });
  sync.access.create("sam", { docId: INDEX, kind: "index", home });
  sync.access.create("sam", { docId: SCRIPT, kind: "script", home });
  storage.directory.setRole(RUNDOWN, "sam", "owner", ["edit_rundowns"]);

  const sam = fakePeer({ userId: "sam", name: "Sam" });
  sync.attach(sam);

  // Give SCRIPT spoken text so a real script link would produce a non-null duration
  const scriptDoc = createDoc({ clientId: 11 });
  scriptBody(scriptDoc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: BLK_LINE, type: "dialogue" },
        content: [{ type: "text", text: "One two three four five six." }],
      },
    ]),
  );
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: SCRIPT,
    generation: 0,
    mode: "edit",
    clientIds: [11],
    lastServerSeq: 0,
  });
  sync.receive(sam, {
    type: "PUSH",
    docId: SCRIPT,
    generation: 1,
    clientSeq: 1,
    update: scriptDoc.encodeState(),
    heal: false,
  });

  // Link INDEX and OTHER_RUNDOWN via kind "script", and link SCRIPT via kind "item"
  const rdDoc = createDoc({ clientId: 12 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-25",
      airAt: 20_000,
      windowLeadMs: 15_000,
      targetMs: 60_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rdDoc,
    [
      { id: ROW_INDEX, kind: "script", docId: INDEX, blockId: null },
      { id: ROW_OTHER, kind: "script", docId: OTHER_RUNDOWN, blockId: null },
      { id: ROW_ITEM, kind: "item", docId: SCRIPT, blockId: null },
    ],
    null,
  );
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [12],
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
  fc.advance(600);
  await flushAll(fc);

  // The rundown itself has an active air window at t = 10_600
  expect(airWindows.windowOf(RUNDOWN)).toEqual({
    startsAt: 5_000,
    endsAt: 80_000,
  });
  expect(airWindows.isInside(RUNDOWN, 10_600)).toBe(true);

  // Non-script INDEX and non-script-row-linked SCRIPT receive no projected air window
  expect(airWindows.windowOf(INDEX)).toBeNull();
  expect(airWindows.isInside(INDEX, 10_600)).toBe(false);
  expect(airWindows.windowOf(SCRIPT)).toBeNull();
  expect(airWindows.isInside(SCRIPT, 10_600)).toBe(false);

  // Non-script targets linked on script rows receive no server-computed duration
  const file = storage.open({ kind: "project", id: PROJECT });
  const row = file.log.get(RUNDOWN)!;
  const loaded = createDoc();
  for (const entry of file.log.tail(RUNDOWN, row.generation, 0).rows)
    loaded.applyUpdate(entry.update, "load");
  const rows = readRundown(loaded).rows;
  expect(rows.find((r) => r.id === ROW_INDEX)?.durationMs).toBeNull();
  expect(rows.find((r) => r.id === ROW_OTHER)?.durationMs).toBeNull();
  loaded.destroy();
  scriptDoc.destroy();
  rdDoc.destroy();
  sync.detach(sam);
});

test("rundown root fields and columns are type-checked on every client push", async () => {
  const fc = fakeClock(10_000);
  const { storage, sync } = createWorld(fc);
  const home = `project:${PROJECT}`;
  sync.access.create("sam", { docId: RUNDOWN, kind: "rundown", home });
  storage.directory.setRole(RUNDOWN, "sam", "owner", ["edit_rundowns"]);

  const sam = fakePeer({ userId: "sam", name: "Sam" });
  sync.attach(sam);
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "edit",
    clientIds: [21, 22, 23, 24, 25],
    lastServerSeq: 0,
  });
  sam.take();

  // Valid init push passes cleanly
  const validDoc = createDoc({ clientId: 21 });
  initRundown(
    validDoc,
    {
      airDate: "2026-11-25",
      airAt: 10_000_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    SHOW_COLUMNS,
  );
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 1,
    update: validDoc.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  expect(sam.take()).toEqual([
    { type: "ACK", docId: RUNDOWN, generation: 1, clientSeq: 1, serverSeq: 1 },
  ]);

  // Invalid rundown root field type (airAt string) is rejected with 4422
  const badField = createDoc({ clientId: 22 });
  jsonMap(badField, RUNDOWN_FIELDS_ROOT).set("airAt", "not-a-timestamp");
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 2,
    update: badField.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  expect(sam.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422, clientSeq: 2 }),
  ]);

  // Re-subscribe to clear stalled state, then push an unknown rundown root field
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 1,
    mode: "edit",
    clientIds: [23],
    lastServerSeq: 1,
  });
  sam.take();
  const unknownField = createDoc({ clientId: 23 });
  jsonMap(unknownField, RUNDOWN_FIELDS_ROOT).set("bogus", 1);
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 3,
    update: unknownField.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  expect(sam.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422, clientSeq: 3 }),
  ]);

  // Re-subscribe and push a stray map entry onto the columns root
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 1,
    mode: "edit",
    clientIds: [24, 25],
    lastServerSeq: 1,
  });
  sam.take();
  const badColMapDoc = createDoc({ clientId: 24 });
  jsonMap(badColMapDoc, RUNDOWN_COLUMNS_ROOT).set("0", "bogus");
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 4,
    update: badColMapDoc.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  expect(sam.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422, clientSeq: 4 }),
  ]);

  // Re-subscribe and push an invalid column string as a real Y.Array entry in columns
  sync.receive(sam, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 1,
    mode: "edit",
    clientIds: [25],
    lastServerSeq: 1,
  });
  sam.take();
  const badColArrDoc = createDoc({ clientId: 25 });
  initRundown(
    badColArrDoc,
    {
      airDate: "2026-11-25",
      airAt: 10_000_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    ["segment"],
  );
  const forgedBytes = new Uint8Array(badColArrDoc.encodeState());
  const needle = new TextEncoder().encode("segment");
  const replacement = new TextEncoder().encode("bogusxx");
  let at = -1;
  for (let i = 0; i <= forgedBytes.length - needle.length; i += 1) {
    if (needle.every((b, j) => forgedBytes[i + j] === b)) {
      at = i;
      break;
    }
  }
  expect(at).toBeGreaterThanOrEqual(0);
  forgedBytes.set(replacement, at);
  sync.receive(sam, {
    type: "PUSH",
    docId: RUNDOWN,
    generation: 1,
    clientSeq: 5,
    update: forgedBytes,
    heal: false,
  });
  await flushAll(fc);
  expect(sam.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422, clientSeq: 5 }),
  ]);

  validDoc.destroy();
  badField.destroy();
  unknownField.destroy();
  badColMapDoc.destroy();
  badColArrDoc.destroy();
  sync.detach(sam);
});
