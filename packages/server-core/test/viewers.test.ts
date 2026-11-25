import { expect, test } from "bun:test";
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  NOTES_MAP,
  createDoc,
  jsonMap,
} from "@manent/crdt";
import type { Storage } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Message } from "@manent/sync-protocol";
import {
  createInlineCheckpointer,
  createRooms,
  createSnapshotAnswers,
  DEFAULT_LIMITS,
  materializeForView,
  viewSnapshot,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import { BLOCK, DOC, HOME, createTypist, replayAll, seedLog } from "./seed.ts";
import {
  LEO_CLIENT,
  SAM_CLIENT,
  createServiceWorld,
  push,
  set,
  subscribe,
} from "./service-world.ts";

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const BLOCK2 = "b000000000000002";
const docIdOf = (n: number): string =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

/** Sam edits DOC, which holds one block of his. */
function seeded() {
  const world = createServiceWorld({
    registry: { check: () => ({ ok: true }), isGuarded: () => false },
  });
  const typist = createTypist(SAM_CLIENT);
  world.service.receive(world.sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  world.service.receive(
    world.sam,
    push(DOC, 1, typist.insertBlock(BLOCK, null, "Rain")),
  );
  world.clock.runDeferred();
  world.sam.take();
  return { ...world, typist };
}

test("a viewer gets the script as blocks, then patches by block id, and never the CRDT", () => {
  const { service, sam, leo, clock, storage, typist } = seeded();
  service.receive(leo, subscribe(DOC, "view", []));
  const [subscribed, snapshot] = leo.take();
  expect(subscribed).toMatchObject({ type: "SUBSCRIBED", role: "view" });
  expect(
    JSON.parse(text((snapshot as { content: Uint8Array }).content)),
  ).toEqual({
    v: 1,
    blocks: replayAll(storage).content!.flatMap((s) => s.content ?? []),
  });
  expect(snapshot).toMatchObject({ type: "VIEW_SNAPSHOT", viewSeq: 1 });
  service.receive(sam, push(DOC, 2, typist.insertBlock(BLOCK2, BLOCK, "Dusk")));
  clock.runDeferred();
  const patches = leo.take();
  // no SYNC, no AWARENESS
  expect(patches.map((m) => m.type)).toEqual(["VIEW_PATCH"]);
  const [patch] = patches as Extract<Message, { type: "VIEW_PATCH" }>[];
  expect([patch!.viewSeq, JSON.parse(text(patch!.patch))]).toEqual([
    2,
    {
      v: 1,
      remove: [],
      insert: [
        {
          block: {
            type: "block",
            attrs: expect.objectContaining({ id: BLOCK2 }),
            content: [{ type: "text", text: "Dusk" }],
          },
          after: BLOCK,
        },
      ],
      update: [],
    },
  ]);
  service.receive(leo, push(DOC, 1, typist.type(BLOCK, "!")));
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);
  service.receive(leo, {
    type: "SYNC",
    docId: DOC,
    generation: 1,
    step: "step1",
    data: new Uint8Array([0]),
  });
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);
});

test("a viewer's writes to a script nobody is editing are refused", () => {
  const { service, leo } = createServiceWorld();
  service.receive(leo, subscribe(DOC, "view", []));
  leo.take();
  service.receive(
    leo,
    push(DOC, 1, createTypist(LEO_CLIENT).insertBlock(BLOCK, null, "Rain")),
  );
  service.receive(leo, set(DOC, 2, "script.paper", "a4"));
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);
  expect(service.stats()).toMatchObject({ rooms: 1, loadedRooms: 0 });
});

test("a viewer who subscribes in the turn of a push gets the snapshot before any patch", () => {
  const { service, sam, leo, clock, typist } = seeded();
  service.receive(sam, push(DOC, 2, typist.insertBlock(BLOCK2, BLOCK, "Dusk")));
  service.receive(leo, subscribe(DOC, "view", []));
  clock.runDeferred();
  expect(leo.take()).toMatchObject([
    { type: "SUBSCRIBED", role: "view" },
    { type: "VIEW_SNAPSHOT", viewSeq: 2 },
  ]);
});

test("a viewer never causes a room to stay loaded", () => {
  const { service, leo } = createServiceWorld();
  service.receive(leo, subscribe(DOC, "view", []));
  expect(service.stats()).toMatchObject({ rooms: 1, loadedRooms: 0 });
  service.detach(leo);
  expect(service.stats()).toMatchObject({ rooms: 0 });
});

test("a commenter reads through the viewer path and cannot edit", () => {
  const { service, ana, storage } = createServiceWorld();
  storage.directory.setRole(DOC, "ana", "comment", []);
  service.receive(ana, subscribe(DOC, "view", []));
  expect(ana.take()).toMatchObject([
    { type: "SUBSCRIBED", role: "comment" },
    { type: "VIEW_SNAPSHOT" },
  ]);
  service.receive(ana, subscribe(DOC, "edit", [3003]));
  expect(ana.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "read_only_role" },
  ]);
});

test("a change no viewer can see sends no patch", () => {
  const { service, sam, leo, clock, typist } = seeded();
  service.receive(leo, subscribe(DOC, "view", []));
  leo.take();
  const update = typist.type(BLOCK, " falls");
  service.receive(sam, push(DOC, 2, update));
  clock.runDeferred();
  expect(leo.take().map((m) => m.type)).toEqual(["VIEW_PATCH"]);
  sam.take();
  // a duplicate, and a setting
  service.receive(sam, push(DOC, 2, update));
  service.receive(sam, set(DOC, 3, "script.paper", "a4"));
  clock.runDeferred();
  expect(leo.take()).toEqual([]);
  expect(sam.take().map((m) => m.type)).toEqual(["ACK", "SYNC", "ACK"]);
});

test("a script nobody is editing is read from its checkpoint and tail for one answer", () => {
  const clock = fakeClock();
  const storage = createMemoryStorage({ now: clock.clock.now });
  seedLog(storage, 30);
  const rooms = createRooms({
    storage,
    clock: clock.clock,
    limits: DEFAULT_LIMITS,
    checkpointer: createInlineCheckpointer({ storage, defer: clock.defer }),
  });
  const room = rooms.room(DOC, HOME, "script");
  expect(materializeForView(storage, room)).toEqual({
    snapshot: viewSnapshot(replayAll(storage)),
    viewSeq: 30,
  });
  expect(room.doc).toBeNull();
});

test("the snapshot cache keeps the latest answer for 512 documents and evicts the least recently used", () => {
  const clock = fakeClock(1_000);
  const backing = createMemoryStorage({ now: clock.clock.now });
  let reads = 0;
  const counted: Storage = {
    ...backing,
    open(home) {
      const file = backing.open(home);
      return {
        ...file,
        log: {
          ...file.log,
          tail(docId, generation, afterSeq, options) {
            reads += 1;
            return file.log.tail(docId, generation, afterSeq, options);
          },
        },
      };
    },
  };
  const rooms = createRooms({
    storage: backing,
    clock: clock.clock,
    limits: DEFAULT_LIMITS,
    checkpointer: createInlineCheckpointer({
      storage: backing,
      defer: clock.defer,
    }),
  });
  const list = Array.from({ length: 513 }, (_, index) => {
    const id = docIdOf(index + 1);
    backing.open(HOME).log.create({
      id,
      kind: "script",
      ownerUserId: null,
      schemaVersion: 1,
      engineVersion: 0,
    });
    return rooms.room(id, HOME, "script");
  });
  const answers = createSnapshotAnswers(counted);
  for (let i = 0; i < 512; i++) answers(list[i]!);
  expect(reads).toBe(512);
  // repeated head advances on one document replace its own entry instead of evicting other documents
  const first = list[0]!;
  for (let seq = 1; seq <= 5; seq++) {
    first.row = { ...first.row, headSeq: seq };
    answers(first);
  }
  expect(reads).toBe(517);
  for (let i = 1; i < 512; i++) answers(list[i]!);
  expect(reads).toBe(517);
  // touching the first document makes the second least recently used
  answers(first);
  expect(reads).toBe(517);
  answers(list[512]!);
  expect(reads).toBe(518);
  answers(first);
  expect(reads).toBe(518);
  answers(list[1]!);
  expect(reads).toBe(519);
});

test("writers-only material never reaches a viewer and a revoked viewer gets no further patches", () => {
  const { service, sam, leo, ana, clock, storage, typist } = seeded();
  storage.directory.setRole(DOC, "ana", "view", []);
  service.receive(leo, subscribe(DOC, "view", []));
  leo.take();
  const writerDoc = createDoc({ clientId: SAM_CLIENT });
  jsonMap(writerDoc, NOTES_MAP).set("n1", { body: "private note" });
  jsonMap(writerDoc, ALTERNATES_MAP).set("a1", { body: "private alternate" });
  jsonMap(writerDoc, CUTS_MAP).set("c1", { body: "private cut" });
  service.receive(sam, push(DOC, 2, writerDoc.encodeState()));
  clock.runDeferred();
  expect(leo.take()).toEqual([]);
  service.receive(ana, subscribe(DOC, "view", []));
  const snapshot = ana
    .take()
    .find(
      (message): message is Extract<Message, { type: "VIEW_SNAPSHOT" }> =>
        message.type === "VIEW_SNAPSHOT",
    );
  expect(snapshot?.type).toBe("VIEW_SNAPSHOT");
  const snapshotText = text(snapshot!.content);
  expect(snapshotText.includes("private note")).toBe(false);
  expect(snapshotText.includes("private alternate")).toBe(false);
  expect(snapshotText.includes("private cut")).toBe(false);
  storage.directory.removeRole(DOC, "leo");
  service.membershipChanged(DOC, "leo", null, "sam");
  expect(leo.take()).toContainEqual(
    expect.objectContaining({
      type: "ERROR",
      code: 4403,
      message: "forbidden",
    }),
  );
  ana.take();
  service.receive(sam, push(DOC, 3, typist.type(BLOCK, "!")));
  clock.runDeferred();
  expect(leo.take()).toEqual([]);
  expect(ana.take().map((message) => message.type)).toEqual(["VIEW_PATCH"]);
});

test("membership change reaches viewers of an unloaded room before eviction", () => {
  const { service, leo, ana, storage } = createServiceWorld();
  storage.directory.setRole(DOC, "ana", "view", []);
  service.receive(leo, subscribe(DOC, "view", []));
  service.receive(ana, subscribe(DOC, "view", []));
  leo.take();
  ana.take();
  expect(service.stats()).toMatchObject({ rooms: 1, loadedRooms: 0 });

  storage.directory.removeRole(DOC, "leo");
  service.membershipChanged(DOC, "leo", null, "sam");

  const leoMsgs = leo.take();
  expect(leoMsgs.map((m) => m.type)).toEqual(["CONTROL", "ERROR"]);
  const leoControl = leoMsgs[0] as Extract<Message, { type: "CONTROL" }>;
  expect(leoControl.kind).toBe("membership_changed");
  expect(JSON.parse(text(leoControl.data))).toEqual({
    userId: "leo",
    role: null,
    byUserId: "sam",
  });
  expect(leoMsgs[1]).toMatchObject({
    type: "ERROR",
    code: 4403,
    message: "forbidden",
  });

  const anaMsgs = ana.take();
  expect(anaMsgs.map((m) => m.type)).toEqual(["CONTROL"]);
  const anaControl = anaMsgs[0] as Extract<Message, { type: "CONTROL" }>;
  expect(anaControl.kind).toBe("membership_changed");
  expect(JSON.parse(text(anaControl.data))).toEqual({});
});
