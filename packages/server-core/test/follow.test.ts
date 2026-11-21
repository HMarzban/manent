import { expect, test } from "bun:test";
import { updateMeta } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { StorageError } from "@manent/storage";
import type { DocJSON } from "@manent/schema";
import { DOC, DOC2, HOME, createTypist } from "./seed.ts";
import type { Typist } from "./seed.ts";
import { SAM_CLIENT, push, subscribe } from "./service-world.ts";
import type { ServiceOptions } from "./service-world.ts";
import {
  B1,
  B2,
  ack,
  createRelayWorld,
  materialize,
  rebuiltFrom,
  roomDoc,
  withBlock,
} from "./relay-world.ts";
import type { RelayWorld } from "./relay-world.ts";

const CLOUD_CLIENT = 9009;
const KEY = "0123456789abcdef0123456789abcdef";
/** FNV-1a 32-bit of "version-4" and "version-6", the ids the service draws for a follow and for the replay after it. */
const FOLLOW_CLIENT = 928617358;
const REPLAY_CLIENT = 895062120;

/**
 * Sam's window holds DOC2 with B1 "scene one" and B2 "scene two", both committed; `theirs` is that
 * content rebuilt into a fresh document at the cloud, where Dana then changed B2.
 */
function relayed(
  options: ServiceOptions = {},
): RelayWorld & { theirs: CrdtDoc } {
  const world = createRelayWorld(options);
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

/** Sam's window holds DOC2 with B1 "scene one" twice over, the second copy longer, both committed. */
function heldTwice(): RelayWorld & { typist: Typist } {
  const world = createRelayWorld();
  const { service, clock, sam } = world;
  const typist = createTypist(SAM_CLIENT);
  service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
  service.receive(
    sam,
    push(DOC2, 1, typist.insertBlock(B1, null, "scene one")),
  );
  const copy = typist.insertBlock(B1, B1, "scene one, again");
  service.receive(sam, push(DOC2, 2, copy));
  clock.runDeferred();
  sam.take();
  return Object.assign(world, { typist });
}

/** The text of each block, in order. */
const textsOf = (json: DocJSON): string[] =>
  (json.content ?? []).flatMap((section) =>
    (section.content ?? []).map((block) =>
      (block.content ?? []).map((run) => run.text).join(""),
    ),
  );

const generationOf = (world: RelayWorld): number | undefined =>
  world.storage.open(HOME).log.get(DOC2)?.generation;

/** The error `fn` throws; null when it throws none. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

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
  const { service, clock, storage, sam, theirs, typingIn } = world;
  service.pauseRelay(DOC2);
  // not yet committed when the follow fails
  service.receive(sam, push(DOC2, 3, typingIn(DOC2, B1, " more")));
  storage.fillDisk(true);
  const refused = thrownBy(() => service.follow(DOC2, theirs.encodeState()));
  expect(refused).toBeInstanceOf(StorageError);
  expect((refused as StorageError).code).toBe("disk_full");
  expect(generationOf(world)).toBe(1);
  storage.fillDisk(false);
  clock.runDeferred();
  expect(sam.take()).toEqual([ack(DOC2, 3, 3)]);
  service.follow(DOC2, theirs.encodeState());
  expect(generationOf(world)).toBe(2);
  expect(materialize(roomDoc(world, DOC2))).toEqual(
    withBlock(materialize(theirs), B1, "scene one more"),
  );
});

test("an edit that arrives before the pause and is acknowledged during it survives the follow", () => {
  const world = relayed();
  const { service, clock, sam, theirs, typingIn } = world;
  service.receive(sam, push(DOC2, 3, typingIn(DOC2, B1, " more")));
  service.pauseRelay(DOC2);
  clock.runDeferred();
  expect(sam.take()).toEqual([ack(DOC2, 3, 3)]);
  service.follow(DOC2, theirs.encodeState());
  expect(materialize(roomDoc(world, DOC2))).toEqual(
    withBlock(materialize(theirs), B1, "scene one more"),
  );
});

test("a follow waits until what the node holds on a full disk is committed", () => {
  const world = relayed({ fullDisk: "hold" });
  const { service, clock, storage, sam, theirs, typingIn } = world;
  service.pauseRelay(DOC2);
  service.receive(sam, push(DOC2, 3, typingIn(DOC2, B1, " more")));
  storage.fillDisk(true);
  clock.runDeferred();
  // the follow's own retry of what is held fails, though its freeze would not
  storage.fillDisk(false);
  storage.failNextCommit("disk_full");
  const refused = thrownBy(() => service.follow(DOC2, theirs.encodeState()));
  expect(refused).toBeInstanceOf(StorageError);
  expect((refused as StorageError).code).toBe("disk_full");
  expect(generationOf(world)).toBe(1);
  clock.advance(5_000);
  expect(sam.take()).toEqual([ack(DOC2, 3, 3)]);
  service.follow(DOC2, theirs.encodeState());
  expect(materialize(roomDoc(world, DOC2))).toEqual(
    withBlock(materialize(theirs), B1, "scene one more"),
  );
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

test("seed 44: a follow over a block ID held twice keeps the text of each copy", () => {
  const world = heldTwice();
  const theirs = rebuiltFrom(materialize(roomDoc(world, DOC2)), CLOUD_CLIENT);
  world.service.pauseRelay(DOC2);
  const out = world.service.follow(DOC2, theirs.encodeState());
  expect(materialize(roomDoc(world, DOC2))).toEqual(materialize(theirs));
  expect([out.overlaps, out.setAside]).toEqual([[], []]);
});

test("seed 44: a replay over a block ID held twice writes neither copy over the other", async () => {
  const world = heldTwice();
  const { service, clock, sam, typist } = world;
  const theirs = rebuiltFrom(materialize(roomDoc(world, DOC2)), CLOUD_CLIENT);
  service.pauseRelay(DOC2);
  const scene = typist.insertBlock(B2, B1, "scene two");
  service.receive(sam, push(DOC2, 3, scene));
  service.follow(DOC2, theirs.encodeState());
  clock.runDeferred();
  const replayed = service.replay("sam", {
    docId: DOC2,
    generation: 1,
    lastServerSeq: 2,
    key: KEY,
    updates: [scene.toBase64()],
  });
  clock.runDeferred();
  expect(await replayed).toMatchObject({ ok: true, response: { applied: 1 } });
  expect(textsOf(materialize(roomDoc(world, DOC2)))).toEqual([
    "scene one",
    "scene two",
    "scene one, again",
  ]);
});

test("a block a window adds under an ID the script holds already is set aside by a follow, never written over the first", () => {
  const world = createRelayWorld();
  const { service, clock, sam } = world;
  const typist = createTypist(SAM_CLIENT);
  service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
  service.receive(
    sam,
    push(DOC2, 1, typist.insertBlock(B1, null, "scene one")),
  );
  clock.runDeferred();
  const theirs = rebuiltFrom(materialize(roomDoc(world, DOC2)), CLOUD_CLIENT);
  service.pauseRelay(DOC2);
  service.receive(
    sam,
    push(DOC2, 2, typist.insertBlock(B1, B1, "a stray copy")),
  );
  clock.runDeferred();
  const out = service.follow(DOC2, theirs.encodeState());
  expect(materialize(roomDoc(world, DOC2))).toEqual(materialize(theirs));
  expect(out.setAside).toEqual([
    { blockId: B1, nearBlockId: B1, text: "a stray copy" },
  ]);
});

test("seed 44: what the node held on a full disk and had handed upstream already is neither doubled nor set to review by a follow", () => {
  const world = relayed({ fullDisk: "hold" });
  const { service, clock, storage, upstream, theirs, typingIn } = world;
  storage.fillDisk(true);
  service.receive(world.sam, push(DOC2, 3, typingIn(DOC2, B1, " more")));
  clock.runDeferred();
  expect(upstream.items.map((i) => i.kind === "update" && i.seq)).toEqual([
    1, 2, 3,
  ]);
  service.pauseRelay(DOC2);
  storage.fillDisk(false);
  // the cloud took the held edit, and Dana typed after it
  const json = withBlock(materialize(theirs), B1, "scene one more, by dana");
  const cloud = rebuiltFrom(json, CLOUD_CLIENT);
  const out = service.follow(DOC2, cloud.encodeState());
  expect(materialize(roomDoc(world, DOC2))).toEqual(json);
  expect([out.overlaps, out.setAside]).toEqual([[], []]);
});

test("seed 15: a follow writes under a client id drawn from the service's ids, not the smallest one free", () => {
  const world = relayed();
  world.service.pauseRelay(DOC2);
  world.service.follow(DOC2, world.theirs.encodeState());
  const frozen = world.storage.open(HOME).generations.get(DOC2, 1);
  // the cloud gives its own writes the smallest ids its ledger leaves free, which this ledger cannot see
  expect(frozen?.rebuiltByClientId).toBe(FOLLOW_CLIENT);
});

test("seed 1: a replay into a relayed script is written under a client id drawn from the service's ids", async () => {
  const world = relayed();
  const { service, clock, sam, upstream, theirs, typingIn } = world;
  service.pauseRelay(DOC2);
  const more = typingIn(DOC2, B1, " more");
  service.receive(sam, push(DOC2, 3, more));
  service.follow(DOC2, theirs.encodeState());
  clock.runDeferred();
  const replayed = service.replay("sam", {
    docId: DOC2,
    generation: 1,
    lastServerSeq: 2,
    key: KEY,
    updates: [more.toBase64()],
  });
  clock.runDeferred();
  await replayed;
  const last = upstream.items.at(-1);
  const written = last?.kind === "update" ? updateMeta(last.update) : [];
  expect(written.map((meta) => meta.clientId)).toEqual([REPLAY_CLIENT]);
});
