import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Message } from "@manent/sync-protocol";
import {
  createInlineCheckpointer,
  createRooms,
  DEFAULT_LIMITS,
  materializeForView,
  viewSnapshot,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import { BLOCK, DOC, HOME, createTypist, replayAll, seedLog } from "./seed.ts";
import {
  SAM_CLIENT,
  createServiceWorld,
  push,
  set,
  subscribe,
} from "./service-world.ts";

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const BLOCK2 = "b000000000000002";

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
