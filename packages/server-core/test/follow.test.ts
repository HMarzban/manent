import { expect, test } from "bun:test";
import type { CrdtDoc } from "@manent/crdt";
import { StorageError } from "@manent/storage";
import { DOC, DOC2, HOME } from "./seed.ts";
import { SAM_CLIENT, push, subscribe } from "./service-world.ts";
import {
  B1,
  B2,
  createRelayWorld,
  materialize,
  rebuiltFrom,
  roomDoc,
  withBlock,
} from "./relay-world.ts";
import type { RelayWorld } from "./relay-world.ts";

const CLOUD_CLIENT = 9009;
const KEY = "0123456789abcdef0123456789abcdef";

/**
 * Sam's window holds DOC2 with B1 "scene one" and B2 "scene two", both committed; `theirs` is that
 * content rebuilt into a fresh document at the cloud, where Dana then changed B2.
 */
function relayed(): RelayWorld & { theirs: CrdtDoc } {
  const world = createRelayWorld();
  const { service, clock, sam, typingIn } = world;
  service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
  service.receive(sam, push(DOC2, 1, typingIn(DOC2)));
  service.receive(sam, push(DOC2, 2, typingIn(DOC2, B2, "scene two")));
  clock.runDeferred();
  sam.take();
  const theirs = rebuiltFrom(materialize(roomDoc(world, DOC2)), CLOUD_CLIENT);
  const dana = withBlock(materialize(theirs), B2, "scene two, by dana");
  return Object.assign(world, { theirs: rebuiltFrom(dana, CLOUD_CLIENT) });
}

const generationOf = (world: RelayWorld): number | undefined =>
  world.storage.open(HOME).log.get(DOC2)?.generation;

test("a followed document starts a new generation on the node and windows move to it", () => {
  const world = relayed();
  const { service, clock, sam, upstream, theirs, typingIn } = world;
  service.pauseRelay(DOC2);
  // committed during the pause
  service.receive(sam, push(DOC2, 3, typingIn(DOC2, B1, " more")));
  clock.runDeferred();
  const out = service.follow(DOC2, theirs.encodeState());
  // Dana's change and Sam's paused typing, once each
  expect(materialize(roomDoc(world, DOC2))).toEqual(
    withBlock(materialize(theirs), B1, "scene one more"),
  );
  expect(sam.take().at(-1)).toEqual({
    type: "GENERATION_MOVED",
    docId: DOC2,
    generation: 1,
    newGeneration: 2,
  });
  // the paused item went into the merge, not upstream
  expect(upstream.items.map((i) => i.kind === "update" && i.seq)).toEqual([
    1, 2,
  ]);
  expect(out.update.length).toBeGreaterThan(0);
  expect([out.overlaps, out.setAside]).toEqual([[], []]);
});

test("what was not committed when the node follows is replayed by the window, not lost", async () => {
  const world = relayed();
  const { service, clock, sam, upstream, theirs, typingIn } = world;
  service.pauseRelay(DOC2);
  const more = typingIn(DOC2, B1, " more");
  service.receive(sam, push(DOC2, 3, more));
  service.follow(DOC2, theirs.encodeState());
  clock.runDeferred();
  expect(sam.take().filter((m) => m.type === "ACK")).toEqual([]);
  expect(materialize(roomDoc(world, DOC2))).toEqual(materialize(theirs));
  const replayed = service.replay("sam", {
    docId: DOC2,
    generation: 1,
    lastServerSeq: 2,
    key: KEY,
    updates: [more.toBase64()],
  });
  clock.runDeferred();
  expect(await replayed).toMatchObject({
    ok: true,
    response: { docId: DOC2, generation: 2, serverSeq: 2, applied: 1 },
  });
  expect(materialize(roomDoc(world, DOC2))).toEqual(
    withBlock(materialize(theirs), B1, "scene one more"),
  );
  expect(upstream.items.map((i) => i.kind === "update" && i.seq)).toEqual([
    1, 2, 2,
  ]);
  expect(upstream.items.at(-1)).toMatchObject({ docId: DOC2, generation: 2 });
});

test("a follow on a full disk changes nothing and can be tried again", () => {
  const world = relayed();
  const { service, storage, theirs } = world;
  service.pauseRelay(DOC2);
  storage.fillDisk(true);
  let refused: unknown = null;
  try {
    service.follow(DOC2, theirs.encodeState());
  } catch (error) {
    refused = error;
  }
  expect(refused).toBeInstanceOf(StorageError);
  expect((refused as StorageError).code).toBe("disk_full");
  expect(generationOf(world)).toBe(1);
  storage.fillDisk(false);
  service.follow(DOC2, theirs.encodeState());
  expect(generationOf(world)).toBe(2);
  expect(materialize(roomDoc(world, DOC2))).toEqual(materialize(theirs));
});

test("follow refuses a room that is not paused or not relayed", () => {
  const { service, theirs } = relayed();
  const refusal = new RangeError("follow needs a paused relayed document");
  expect(() => service.follow(DOC2, theirs.encodeState())).toThrow(refusal);
  expect(() => service.follow(DOC, theirs.encodeState())).toThrow(refusal);
});

test("a pause is for a relayed document only", () => {
  const { service } = relayed();
  expect(() => service.pauseRelay(DOC)).toThrow(
    new RangeError("a pause is for a relayed document"),
  );
});
