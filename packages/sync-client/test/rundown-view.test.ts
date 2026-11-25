import { expect, test } from "bun:test";
import type { RundownJSON, RundownRowJSON } from "@manent/schema";
import { SHOW_COLUMNS } from "@manent/schema";
import {
  applyRundownViewPatch,
  readRundownViewPatch,
  readRundownViewSnapshot,
} from "../src/index.ts";
import type { RundownViewPatch, RundownViewSnapshot } from "../src/index.ts";
import { setup, utf8 } from "./scripted-server.ts";

const RUNDOWN = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";
const ROW_1 = "row-rd-000000001";
const ROW_2 = "row-rd-000000002";
const ROW_3 = "row-rd-000000003";

const row = (
  id: string,
  order: string,
  overrides: Partial<RundownRowJSON> = {},
): RundownRowJSON => ({
  id,
  order,
  kind: "item",
  cells: {},
  docId: null,
  blockId: null,
  durationMs: null,
  prompter: null,
  unnumbered: false,
  ...overrides,
});

const INITIAL_RUNDOWN: RundownJSON = {
  rundown: {
    airDate: "2026-11-25",
    airAt: 100_000,
    windowLeadMs: 60_000,
    targetMs: 1_800_000,
  },
  columns: [...SHOW_COLUMNS],
  rows: [
    row(ROW_1, "B", { kind: "header" }),
    row(ROW_2, "D", {
      cells: {
        segment: {
          value: "Opening",
          userId: "sam",
          setAt: 50_000,
          previous: null,
        },
      },
    }),
  ],
};

test("applyRundownViewPatch applies field, column, upsert, reorder and remove changes immutably", () => {
  const patch: RundownViewPatch = {
    v: 1,
    kind: "rundown",
    rundown: { ...INITIAL_RUNDOWN.rundown, targetMs: 2_400_000 },
    remove: [ROW_1, "missing-row"],
    upsert: [
      row(ROW_3, "A", { durationMs: 30_000 }),
      row(ROW_2, "D", {
        durationMs: 45_000,
        prompter: {
          state: "on",
          versionId: "v-1",
          sentAt: 55_000,
          sentByUserId: "sam",
        },
      }),
    ],
  };

  const next = applyRundownViewPatch(INITIAL_RUNDOWN, patch);
  expect(next.rundown.targetMs).toBe(2_400_000);
  expect(next.columns).toEqual([...SHOW_COLUMNS]);
  expect(next.rows.map((r) => r.id)).toEqual([ROW_3, ROW_2]);
  expect(next.rows[1]?.durationMs).toBe(45_000);
  expect(next.rows[1]?.prompter?.state).toBe("on");
  // Input unchanged
  expect(INITIAL_RUNDOWN.rows.map((r) => r.id)).toEqual([ROW_1, ROW_2]);
  expect(INITIAL_RUNDOWN.rundown.targetMs).toBe(1_800_000);
});

test("readRundownViewSnapshot and readRundownViewPatch reject malformed payloads", () => {
  const validSnapshot: RundownViewSnapshot = {
    v: 1,
    kind: "rundown",
    ...INITIAL_RUNDOWN,
  };
  expect(readRundownViewSnapshot(validSnapshot)).toEqual(validSnapshot);
  expect(readRundownViewSnapshot({ v: 2, kind: "rundown" })).toBeNull();
  expect(
    readRundownViewSnapshot({
      ...validSnapshot,
      columns: ["not_a_column"],
    }),
  ).toBeNull();
  expect(
    readRundownViewSnapshot({
      ...validSnapshot,
      rows: [{ ...row(ROW_1, "A"), kind: "bogus" }],
    }),
  ).toBeNull();
  expect(
    readRundownViewPatch({
      v: 1,
      kind: "rundown",
      remove: [42],
      upsert: [],
    }),
  ).toBeNull();
});

test("ViewHandle exposes rundown snapshot, incremental patches and airWindow for rundown viewers", async () => {
  const w = await setup();
  const { server, network, store } = w;
  server.answer.view = false;
  const client = w.makeClient({ userId: "leo" });
  const view = client.view(RUNDOWN);
  const seen: (RundownJSON | null)[] = [];
  const stopRundown = view.rundown!.subscribe((value) => seen.push(value));
  await w.online();

  expect(server.got("SUBSCRIBE")).toEqual([
    {
      type: "SUBSCRIBE",
      docId: RUNDOWN,
      generation: 0,
      mode: "view",
      clientIds: [],
      lastServerSeq: 0,
    },
  ]);
  expect(view.rundown!.get()).toBeNull();
  expect(view.airWindow!.get()).toBeNull();

  // Server answers SUBSCRIBED (with role view & airWindow) and rundown VIEW_SNAPSHOT
  server.send({
    type: "SUBSCRIBED",
    docId: RUNDOWN,
    generation: 1,
    role: "view",
    capabilities: [],
    headSeq: 1,
    minSchemaVersion: 1,
    engineVersion: 0,
    lockLevel: 0,
    lockAnchors: null,
    revision: null,
    airWindow: { startsAt: 40_000, endsAt: 1_900_000 },
  });
  server.send({
    type: "VIEW_SNAPSHOT",
    docId: RUNDOWN,
    generation: 1,
    viewSeq: 1,
    content: utf8(
      JSON.stringify({ v: 1, kind: "rundown", ...INITIAL_RUNDOWN }),
    ),
  });
  await w.settle();

  expect(view.status.get()).toEqual({
    link: "online",
    live: true,
    role: "view",
  });
  expect(view.airWindow!.get()).toEqual({
    startsAt: 40_000,
    endsAt: 1_900_000,
  });
  expect(view.rundown!.get()).toEqual(INITIAL_RUNDOWN);
  expect(view.blocks.get()).toEqual([]);
  expect(seen).toEqual([INITIAL_RUNDOWN]);

  // Incremental VIEW_PATCH adds ROW_3 at top and updates ROW_2 duration
  server.viewPatch(RUNDOWN, {
    v: 1,
    kind: "rundown",
    remove: [],
    upsert: [
      row(ROW_3, "A", { durationMs: 15_000 }),
      { ...INITIAL_RUNDOWN.rows[1]!, durationMs: 60_000 },
    ],
  });
  await w.settle();

  expect(view.rundown!.get()!.rows.map((r) => r.id)).toEqual([
    ROW_3,
    ROW_1,
    ROW_2,
  ]);
  expect(view.rundown!.get()!.rows[2]!.durationMs).toBe(60_000);

  // Malformed rundown patch is never applied and triggers a fresh SUBSCRIBE
  const subscribesBefore = server.got("SUBSCRIBE").length;
  server.send({
    type: "VIEW_PATCH",
    docId: RUNDOWN,
    generation: 1,
    viewSeq: 3,
    patch: utf8('{"v":1,"kind":"rundown","remove":[1],"upsert":[]}'),
  });
  await w.settle();
  expect(server.got("SUBSCRIBE").length).toBe(subscribesBefore + 1);
  expect(view.rundown!.get()!.rows.map((r) => r.id)).toEqual([
    ROW_3,
    ROW_1,
    ROW_2,
  ]);

  // Reconnect after partition restores fresh snapshot and stores nothing locally
  network.partition(true);
  await w.settle();
  expect(view.status.get()).toMatchObject({ link: "offline", live: false });
  network.partition(false);
  w.fake.advance(30_000);
  await w.settle();
  server.send({
    type: "SUBSCRIBED",
    docId: RUNDOWN,
    generation: 1,
    role: "view",
    capabilities: [],
    headSeq: 4,
    minSchemaVersion: 1,
    engineVersion: 0,
    lockLevel: 0,
    lockAnchors: null,
    revision: null,
    airWindow: null,
  });
  server.send({
    type: "VIEW_SNAPSHOT",
    docId: RUNDOWN,
    generation: 1,
    viewSeq: 4,
    content: utf8(
      JSON.stringify({ v: 1, kind: "rundown", ...INITIAL_RUNDOWN }),
    ),
  });
  await w.settle();
  expect(view.airWindow!.get()).toBeNull();
  expect(view.rundown!.get()).toEqual(INITIAL_RUNDOWN);
  expect([await store.load(RUNDOWN), server.got("SYNC")]).toEqual([null, []]);

  // Leaving the last rundown listener unsubscribes
  stopRundown();
  w.fake.advance(1);
  await w.settle();
  expect(server.got("UNSUBSCRIBE")).toHaveLength(1);
  view.close();
});
