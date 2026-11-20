import { expect, test } from "bun:test";
import { DOC, DOC2 } from "./seed.ts";
import { DANA_CLIENT, SAM_CLIENT, push, subscribe } from "./service-world.ts";
import { ack, createRelayWorld, tail } from "./relay-world.ts";
import type { RelayWorld } from "./relay-world.ts";

/** Sam and Dana edit `docId`; what they were sent is dropped. */
function editing(world: RelayWorld, docId: string): void {
  const { service, sam, dana } = world;
  service.receive(sam, subscribe(docId, "edit", [SAM_CLIENT]));
  service.receive(dana, subscribe(docId, "edit", [DANA_CLIENT]));
  sam.take();
  dana.take();
}

test("on a full disk the node holds what it could not commit and retries", () => {
  const world = createRelayWorld({ fullDisk: "hold" });
  const { service, clock, storage, sam, dana, upstream, deviceStates } = world;
  editing(world, DOC2);
  service.receive(sam, push(DOC2, 1, world.typingIn(DOC2)));
  service.receive(sam, push(DOC2, 2, world.typingIn(DOC2, undefined, "!")));
  storage.fillDisk(true);
  clock.runDeferred();
  expect(sam.take()).toEqual([]);
  expect(deviceStates).toEqual(["failing"]);
  // still on its way to the cloud, and others see it at once
  expect(upstream.items.map((i) => i.kind)).toEqual(["update", "update"]);
  expect(dana.take().map((m) => m.type)).toEqual(["SYNC", "SYNC"]);
  // still full
  clock.advance(5_000);
  expect(sam.take()).toEqual([]);
  storage.fillDisk(false);
  clock.advance(5_000);
  expect(sam.take()).toEqual([ack(DOC2, 1, 1), ack(DOC2, 2, 2)]);
  expect(deviceStates).toEqual(["failing", "ok"]);
  // never handed on twice
  expect(upstream.items).toHaveLength(2);
  expect(tail(world, DOC2).map((r) => r.seq)).toEqual([1, 2]);
});

test("what arrives while the disk is full waits behind what is held", () => {
  const world = createRelayWorld({ fullDisk: "hold" });
  const { service, clock, storage, sam, typingIn } = world;
  editing(world, DOC2);
  service.receive(sam, push(DOC2, 1, typingIn(DOC2)));
  service.receive(sam, push(DOC2, 2, typingIn(DOC2, undefined, "!")));
  storage.fillDisk(true);
  clock.runDeferred();
  // the disk has room again, but what is held goes first
  storage.fillDisk(false);
  service.receive(sam, push(DOC2, 3, typingIn(DOC2, undefined, "?")));
  clock.runDeferred();
  expect(sam.take()).toEqual([]);
  clock.advance(5_000);
  expect(sam.take()).toEqual([
    ack(DOC2, 1, 1),
    ack(DOC2, 2, 2),
    ack(DOC2, 3, 3),
  ]);
  expect(world.upstream.items.map((i) => i.kind === "update" && i.seq)).toEqual(
    [1, 2, 3],
  );
});

test("the cloud still poisons on a full disk", () => {
  const world = createRelayWorld();
  const { service, clock, storage, sam, deviceStates } = world;
  editing(world, DOC);
  service.receive(sam, push(DOC, 1, world.typingIn(DOC)));
  storage.fillDisk(true);
  clock.runDeferred();
  expect(sam.take()).toEqual([
    {
      type: "ERROR",
      code: 1011,
      message: "storage_failed",
      permanent: false,
      retryAfterMs: 1000,
      clientSeq: null,
      doc: { docId: DOC, generation: 1 },
    },
  ]);
  expect(service.stats()).toMatchObject({ poisoned: 1, loadedRooms: 0 });
  storage.fillDisk(false);
  clock.advance(5_000);
  expect([deviceStates, tail(world, DOC)]).toEqual([[], []]);
});

test("at shutdown what is held is tried once more, then let go", async () => {
  const world = createRelayWorld({ fullDisk: "hold" });
  const { service, clock, storage, sam, deviceStates } = world;
  editing(world, DOC2);
  service.receive(sam, push(DOC2, 1, world.typingIn(DOC2)));
  storage.fillDisk(true);
  clock.runDeferred();
  await service.shutdown();
  storage.fillDisk(false);
  clock.advance(10_000);
  expect(sam.take().filter((m) => m.type === "ACK")).toEqual([]);
  expect([deviceStates, tail(world, DOC2)]).toEqual([["failing"], []]);
});
