import { expect, test } from "bun:test";
import { decodeAwareness, encodeAwareness } from "@manent/crdt";
import type { AwarenessEntry } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Message } from "@manent/sync-protocol";
import {
  DEFAULT_LIMITS,
  createAwarenessHub,
  createInlineCheckpointer,
  createRooms,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakePeer } from "../src/testing/index.ts";
import { DOC, HOME } from "./seed.ts";
import {
  DANA_CLIENT,
  LEO_CLIENT,
  SAM_CLIENT,
  clientOf,
  createServiceWorld,
  subscribe,
} from "./service-world.ts";

const awareness = (docId: string, entries: AwarenessEntry[]): Message => ({
  type: "AWARENESS",
  docId,
  generation: 1,
  update: encodeAwareness(entries),
});

/** Every entry in the AWARENESS frames among `messages`, in order. */
function entriesIn(messages: readonly Message[]): AwarenessEntry[] {
  return messages.flatMap((m) =>
    m.type === "AWARENESS" ? decodeAwareness(m.update) : [],
  );
}

/** userId → colour index, from the server's stamp on each entry. */
function colorsSeen(messages: readonly Message[]): Record<string, number> {
  const seen: Record<string, number> = {};
  for (const { state } of entriesIn(messages)) {
    const user = state?.user;
    if (
      typeof user === "object" &&
      user !== null &&
      "userId" in user &&
      "colorIndex" in user &&
      typeof user.userId === "string" &&
      typeof user.colorIndex === "number"
    )
      seen[user.userId] = user.colorIndex;
  }
  return seen;
}

/** Sam and Dana edit DOC; neither has taken anything since. */
function editing() {
  const world = createServiceWorld();
  for (const peer of [world.sam, world.dana]) {
    world.service.receive(peer, subscribe(DOC, "edit", [clientOf(peer)]));
    peer.take();
  }
  return world;
}

test("colours follow the order in which people first opened the script to edit, and are kept", () => {
  const world = createServiceWorld();
  const { sam, dana, ana, priya, clock } = world;
  const open = (peers: FakePeer[]) => {
    for (const peer of peers)
      world.service.receive(peer, subscribe(DOC, "edit", [clientOf(peer)]));
  };
  const announce = (peers: FakePeer[], at: number) => {
    for (const peer of peers)
      world.service.receive(
        peer,
        awareness(DOC, [{ clientId: clientOf(peer), clock: at, state: {} }]),
      );
  };
  open([sam, dana, ana, priya]);
  announce([sam, dana, ana], 1);
  priya.take();
  clock.advance(100);
  // priya (3) reads them
  expect(colorsSeen(priya.take())).toEqual({ sam: 0, dana: 1, ana: 2 });
  world.restart();
  // back in another order
  open([priya, ana, dana, sam]);
  announce([ana, dana, sam], 2);
  priya.take();
  clock.advance(100);
  expect(colorsSeen(priya.take())).toEqual({ sam: 0, dana: 1, ana: 2 });
});

test("presence is batched every 100 ms and stamped by the server", () => {
  const { service, sam, dana, clock } = editing();
  service.receive(
    sam,
    awareness(DOC, [
      {
        clientId: SAM_CLIENT,
        clock: 1,
        state: {
          cursor: { blockId: "b1" },
          user: { userId: "mallory", name: "Mallory" },
        },
      },
    ]),
  );
  service.receive(
    sam,
    awareness(DOC, [
      { clientId: SAM_CLIENT, clock: 2, state: { cursor: { blockId: "b2" } } },
    ]),
  );
  clock.advance(99);
  expect(dana.take()).toEqual([]);
  clock.advance(1);
  const frames = dana.take();
  // one frame, the newest state, the server's name and colour
  expect(frames).toHaveLength(1);
  expect(entriesIn(frames)).toEqual([
    {
      clientId: SAM_CLIENT,
      clock: 2,
      state: {
        cursor: { blockId: "b2" },
        user: { userId: "sam", name: "Sam Okafor", colorIndex: 0 },
      },
    },
  ]);
});

test("an entry over 4 KB, for someone else's client id, or from a viewer is dropped", () => {
  const { service, sam, dana, leo, clock } = editing();
  service.receive(leo, subscribe(DOC, "view", []));
  // the editors are told of one more viewer
  clock.advance(100);
  for (const peer of [dana, leo]) peer.take();
  service.receive(
    sam,
    awareness(DOC, [
      { clientId: SAM_CLIENT, clock: 1, state: { note: "x".repeat(5_000) } },
      { clientId: DANA_CLIENT, clock: 1, state: { cursor: null } },
    ]),
  );
  clock.advance(100);
  expect(dana.take()).toEqual([]);
  expect(service.stats().awarenessDropped).toBe(2);
  service.receive(
    sam,
    awareness(DOC, [
      { clientId: SAM_CLIENT, clock: 2, state: { note: "x".repeat(5_000) } },
      { clientId: SAM_CLIENT, clock: 3, state: { cursor: "kept" } },
    ]),
  );
  clock.advance(100);
  expect(entriesIn(dana.take()).map((e) => e.clock)).toEqual([3]);
  service.receive(leo, awareness(DOC, [{ clientId: 77, clock: 1, state: {} }]));
  clock.advance(100);
  expect(leo.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);
  expect(dana.take()).toEqual([]);
});

test("a new editor is told who is here, and a leaver is removed for everyone", () => {
  const world = createServiceWorld();
  const { service, sam, dana, clock } = world;
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(
    sam,
    awareness(DOC, [{ clientId: SAM_CLIENT, clock: 2, state: { at: 1 } }]),
  );
  clock.advance(100);
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  const joined = dana.take();
  expect(joined.map((m) => m.type)).toEqual([
    "SUBSCRIBED",
    "SYNC",
    "AWARENESS",
  ]);
  expect(entriesIn(joined)).toMatchObject([
    { clientId: SAM_CLIENT, clock: 2, state: { at: 1 } },
  ]);
  service.detach(sam);
  clock.advance(100);
  expect(entriesIn(dana.take())).toEqual([
    { clientId: SAM_CLIENT, clock: 3, state: null },
  ]);
});

test("presence that is not renewed for 30 s is removed", () => {
  const { service, sam, dana, clock } = editing();
  service.receive(
    sam,
    awareness(DOC, [{ clientId: SAM_CLIENT, clock: 1, state: {} }]),
  );
  clock.advance(100);
  dana.take();
  clock.advance(29_899);
  expect(dana.take()).toEqual([]);
  clock.advance(101);
  expect(entriesIn(dana.take())).toEqual([
    { clientId: SAM_CLIENT, clock: 2, state: null },
  ]);
});

test("bytes that are not awareness are dropped, not fatal", () => {
  const { service, sam, dana, clock } = editing();
  service.receive(sam, {
    type: "AWARENESS",
    docId: DOC,
    generation: 1,
    update: new Uint8Array([1]),
  });
  clock.advance(100);
  expect([sam.take(), dana.take()]).toEqual([[], []]);
  service.receive(
    sam,
    awareness(DOC, [{ clientId: SAM_CLIENT, clock: 1, state: {} }]),
  );
  clock.advance(100);
  expect(entriesIn(dana.take()).map((e) => e.clientId)).toEqual([SAM_CLIENT]);
});

test("a presence entry at the maximum safe clock is dropped so leaving still publishes", () => {
  const { service, sam, dana, clock } = editing();
  service.receive(
    sam,
    awareness(DOC, [
      {
        clientId: SAM_CLIENT,
        clock: Number.MAX_SAFE_INTEGER,
        state: { at: 1 },
      },
    ]),
  );
  clock.advance(100);
  expect(dana.take()).toEqual([]);
  expect(service.stats().awarenessDropped).toBe(1);
  service.receive(
    sam,
    awareness(DOC, [{ clientId: SAM_CLIENT, clock: 1, state: { at: 2 } }]),
  );
  clock.advance(100);
  expect(entriesIn(dana.take())).toEqual([
    {
      clientId: SAM_CLIENT,
      clock: 1,
      state: {
        at: 2,
        user: { userId: "sam", name: "Sam Okafor", colorIndex: 0 },
      },
    },
  ]);
  service.detach(sam);
  clock.advance(100);
  expect(entriesIn(dana.take())).toEqual([
    { clientId: SAM_CLIENT, clock: 2, state: null },
  ]);
});

test("only subscribed editors can publish or receive presence", () => {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  storage.open(HOME).log.create({
    id: DOC,
    kind: "script",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
  const rooms = createRooms({
    storage,
    clock: clock.clock,
    limits: DEFAULT_LIMITS,
    checkpointer: createInlineCheckpointer({ storage, defer: clock.defer }),
  });
  const room = rooms.room(DOC, HOME, "script");
  const sam = fakePeer({ userId: "sam", name: "Sam Okafor" });
  const leo = fakePeer({ userId: "leo", name: "Leo Marsh" });
  room.editors.set(sam, {
    peer: sam,
    mode: "edit",
    access: { role: "owner", capabilities: [] },
    stalled: false,
  });
  room.viewers.set(leo, {
    peer: leo,
    mode: "view",
    access: { role: "view", capabilities: [] },
    stalled: false,
  });
  room.owners.set(SAM_CLIENT, "sam");
  room.owners.set(LEO_CLIENT, "leo");
  const hub = createAwarenessHub({
    clock: clock.clock,
    limits: DEFAULT_LIMITS,
  });
  expect(
    hub.accept(
      room,
      sam,
      encodeAwareness([{ clientId: SAM_CLIENT, clock: 1, state: { at: 1 } }]),
    ),
  ).toBe(0);
  expect(
    hub.accept(
      room,
      leo,
      encodeAwareness([{ clientId: LEO_CLIENT, clock: 1, state: { at: 2 } }]),
    ),
  ).toBe(1);
  hub.joined(room, leo);
  expect(leo.take()).toEqual([]);
  clock.advance(100);
  expect(leo.take()).toEqual([]);
  expect(entriesIn(sam.take()).map((entry) => entry.clientId)).toEqual([
    SAM_CLIENT,
  ]);
});
