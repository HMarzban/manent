import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  measureDoc,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import type { FlatBlock } from "@manent/schema";
import type { Message } from "@manent/sync-protocol";
import type { FakePeer } from "../src/testing/index.ts";
import { BLOCK, DOC, HOME, appendAll, createTypist, rawEdit } from "./seed.ts";
import {
  EMPTY_VECTOR,
  SAM_CLIENT,
  clientOf,
  createServiceWorld,
  push as pushMessage,
  subscribe,
} from "./service-world.ts";
import type { ServiceOptions } from "./service-world.ts";

/** Any measured document is over budget. */
const FORCE = { rebuildClientIds: 0, checkpointEvery: 1 };
const OTHER_CLIENT = 7007;

const movedTo = (generation: number): Message => ({
  type: "GENERATION_MOVED",
  docId: DOC,
  generation: generation - 1,
  newGeneration: generation,
});

/** The GENERATION_MOVED messages among what `peer` was sent since it last took. */
const moved = (peer: FakePeer): Message[] =>
  peer.take().filter((message) => message.type === "GENERATION_MOVED");

/** The service world over FORCE unless told otherwise, with Sam's typing and the steps the tests take. */
function rebuildWorld(options: ServiceOptions = { limits: FORCE }) {
  const world = createServiceWorld(options);
  const { service, clock, storage } = world;
  const file = storage.open(HOME);
  const typist = createTypist(SAM_CLIENT);
  let typed = false;
  let clientSeq = 0;
  /** Sam's next edit: BLOCK holding `text`, then `text` appended to it. */
  const typing = (text: string): Uint8Array => {
    if (typed) return typist.type(BLOCK, text);
    typed = true;
    return typist.insertBlock(BLOCK, null, text);
  };
  /** Each subscribes to the document's current generation; what they were sent is dropped. */
  const online = (...peers: FakePeer[]): void => {
    for (const peer of peers) {
      const mode = peer === world.leo ? "view" : "edit";
      service.receive(peer, subscribe(DOC, mode, [clientOf(peer)]));
      peer.take();
    }
  };
  const push = (peer: FakePeer, update: Uint8Array): void =>
    service.receive(peer, pushMessage(DOC, ++clientSeq, update));
  /** The blocks the log of the document's current generation builds. */
  const blocksOfRoom = (): FlatBlock[] => {
    const generation = file.log.get(DOC)?.generation ?? 0;
    const doc = createDoc();
    for (const row of file.log.tail(DOC, generation, 0).rows)
      doc.applyUpdate(row.update, ORIGIN_LOAD);
    return blocksOf(scriptBody(doc).materialize());
  };
  const rebuildNow = (): void => {
    online(world.sam, world.dana, world.leo);
    push(world.sam, typing("a"));
    clock.runDeferred();
    clock.advance(10_000);
  };
  return {
    ...world,
    file,
    typing,
    online,
    push,
    blocksOfRoom,
    rebuildNow,
  };
}

/** The update `write` makes to `doc`. */
function capture(
  doc: CrdtDoc,
  write: Parameters<ReturnType<typeof scriptBody>["write"]>[0],
): Uint8Array {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  scriptBody(doc).write(write);
  stop();
  const [update] = made;
  if (update === undefined) throw new RangeError("the write changed nothing");
  return update;
}

/** What `peer` is sent for an edit SUBSCRIBE and an empty step 1 to generation 2. */
function joinSecond(
  world: ReturnType<typeof rebuildWorld>,
  peer: FakePeer,
): Message[] {
  const { service } = world;
  service.receive(
    peer,
    subscribe(DOC, "edit", [clientOf(peer)], { generation: 2 }),
  );
  service.receive(peer, {
    type: "SYNC",
    docId: DOC,
    generation: 2,
    step: "step1",
    data: EMPTY_VECTOR,
  });
  return peer.take();
}

function stepTwoOf(messages: readonly Message[]): Uint8Array {
  const found = messages.find(
    (message) => message.type === "SYNC" && message.step === "step2",
  );
  if (found?.type !== "SYNC") throw new RangeError("no step 2 was sent");
  return found.data;
}

test("a document over budget is rebuilt once its room has been quiet for ten seconds", () => {
  const world = rebuildWorld();
  const { service, clock, file, sam, dana, leo } = world;
  const { online, push, typing, blocksOfRoom } = world;
  online(sam, dana, leo);
  push(sam, typing("a"));
  // commits, and the inline checkpoint job measures
  clock.runDeferred();
  const before = blocksOfRoom();
  clock.advance(9_999);
  expect(moved(sam)).toEqual([]);
  clock.advance(1);
  for (const peer of [sam, dana, leo])
    expect(moved(peer)).toEqual([movedTo(2)]);
  expect(file.log.get(DOC)).toMatchObject({ generation: 2, headSeq: 1 });
  expect(file.generations.get(DOC, 1)).toMatchObject({
    finalSeq: 1,
    reason: "client_ids",
  });
  expect(blocksOfRoom()).toEqual(before);
  expect(service.stats()).toMatchObject({ rebuilds: 1 });
});

test("typing keeps a document from being rebuilt", () => {
  const world = rebuildWorld();
  const { service, clock, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  for (let elapsed = 5_000; elapsed <= 60_000; elapsed += 5_000) {
    clock.advance(5_000);
    push(sam, typing("b"));
    clock.runDeferred();
  }
  expect(moved(sam)).toEqual([]);
  clock.advance(10_000);
  expect(moved(sam)).toEqual([movedTo(2)]);
  expect(service.stats()).toMatchObject({ rebuilds: 1, rebuildsSkipped: {} });
});

test("a rebuild waits for the writes queued before it", () => {
  const world = rebuildWorld();
  const { service, clock, file, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  clock.advance(5_000);
  push(sam, typing("b"));
  clock.advance(5_000);
  expect(service.stats().rebuildsSkipped).toEqual({ busy_queue: 1 });
  expect(moved(sam)).toEqual([]);
  clock.runDeferred();
  clock.advance(9_999);
  expect(moved(sam)).toEqual([]);
  clock.advance(1);
  expect(moved(sam)).toEqual([movedTo(2)]);
  expect(file.generations.get(DOC, 1)).toMatchObject({ finalSeq: 2 });
});

test("never inside an air window", () => {
  let onAir = true;
  const asked: [string, number][] = [];
  const world = rebuildWorld({
    limits: FORCE,
    airWindow(docId, now) {
      asked.push([docId, now]);
      return onAir;
    },
  });
  const { service, clock, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  clock.advance(10_000);
  expect(service.stats().rebuildsSkipped).toEqual({ air_window: 1 });
  expect(moved(sam)).toEqual([]);
  onAir = false;
  clock.advance(10_000);
  expect(moved(sam)).toEqual([movedTo(2)]);
  expect(asked).toEqual([
    [DOC, 11_000],
    [DOC, 21_000],
  ]);
});

test("never while the document heals, or when its content cannot be copied faithfully", () => {
  const twice = createTypist(OTHER_CLIENT).insertBlock(BLOCK, null, "b");
  const page = rawEdit(createDoc({ clientId: OTHER_CLIENT }), (body, make) =>
    body.insert(0, [make.element("section", {}, [make.element("page")])]),
  );
  const cases: [string, (world: ReturnType<typeof rebuildWorld>) => void][] = [
    ["healing", ({ file }) => file.log.flagHealing(DOC, "behind", 1)],
    ["duplicate_ids", ({ storage }) => appendAll(storage, [twice])],
    ["invalid", ({ storage }) => appendAll(storage, [page])],
  ];
  for (const [reason, damage] of cases) {
    const world = rebuildWorld();
    const { service, clock, file, sam, online, push, typing } = world;
    appendAll(world.storage, [typing("a")]);
    damage(world);
    online(sam);
    push(sam, typing("c"));
    clock.runDeferred();
    clock.advance(10_000);
    expect([reason, service.stats().rebuildsSkipped]).toEqual([
      reason,
      { [reason]: 1 },
    ]);
    expect(moved(sam)).toEqual([]);
    expect(file.log.get(DOC)?.generation).toBe(1);
  }
});

test("a relay never rebuilds", () => {
  const world = rebuildWorld({ limits: FORCE, mode: "relay" });
  const { service, clock, file, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  clock.advance(10_000);
  expect(service.stats().rebuildsSkipped).toEqual({ relay: 1 });
  expect(moved(sam)).toEqual([]);
  expect(file.log.get(DOC)?.generation).toBe(1);
});

test("a document under budget is not rebuilt unless asked, and is when asked", () => {
  const world = rebuildWorld({});
  const { service, clock, file, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  clock.advance(10_000);
  expect(service.stats().rebuildsSkipped).toEqual({ under_budget: 1 });
  expect(moved(sam)).toEqual([]);
  service.requestRebuild(DOC);
  clock.advance(10_000);
  expect(moved(sam)).toEqual([movedTo(2)]);
  expect(file.generations.get(DOC, 1)).toMatchObject({ reason: "requested" });
  // the request is spent
  online(sam);
  clock.advance(10_000);
  expect(service.stats()).toMatchObject({
    rebuilds: 1,
    rebuildsSkipped: { under_budget: 2 },
  });
});

test("a quiet timer that outlives the room's load moves nothing", () => {
  const world = rebuildWorld({ limits: { ...FORCE, roomIdleMs: 5_000 } });
  const { service, clock, file, sam, online, push, typing } = world;
  online(sam);
  push(sam, typing("a"));
  clock.runDeferred();
  service.receive(sam, { type: "UNSUBSCRIBE", docId: DOC, generation: 1 });
  clock.advance(10_000);
  expect(service.stats().rebuildsSkipped).toEqual({ not_loaded: 1 });
  expect(file.log.get(DOC)?.generation).toBe(1);
});

test("after a rebuild the old generation is answered with where it went", () => {
  const world = rebuildWorld();
  const { service, clock, file, sam, typing, rebuildNow } = world;
  rebuildNow();
  sam.take();
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], {
      generation: 1,
      lastServerSeq: 500,
    }),
  );
  expect(sam.take()).toEqual([movedTo(2)]);
  // an earlier generation is never taken for a client that is ahead
  expect(file.log.healing(DOC)).toBeNull();
  // an editor of the new generation pushes what it typed in the old one
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT], { generation: 2 }));
  sam.take();
  service.receive(sam, pushMessage(DOC, 1, typing("x")));
  clock.runDeferred();
  expect(sam.take()).toMatchObject([
    {
      type: "ERROR",
      code: 4409,
      message: "generation_moved",
      permanent: false,
      clientSeq: null,
    },
  ]);
});

test("the new generation starts with one client id, and every joiner gets the same state", () => {
  const world = rebuildWorld();
  const { sam, dana, rebuildNow } = world;
  rebuildNow();
  sam.take();
  dana.take();
  const samJoined = joinSecond(world, sam);
  const danaJoined = joinSecond(world, dana);
  expect(stepTwoOf(danaJoined)).toEqual(stepTwoOf(samJoined));
  expect(measureDoc(loadDoc(stepTwoOf(samJoined))).clientIds).toBe(1);
  expect(samJoined[0]).toMatchObject({
    type: "SUBSCRIBED",
    generation: 2,
    headSeq: 1,
  });
});

test("a rebuild that cannot commit moves nothing and poisons the room", () => {
  const world = rebuildWorld();
  const { storage, clock, file, sam, dana } = world;
  const { online, push, typing } = world;
  online(sam, dana);
  push(sam, typing("a"));
  clock.runDeferred();
  sam.take();
  dana.take();
  storage.failNextCommit();
  clock.advance(10_000);
  for (const peer of [sam, dana])
    expect(peer.take()).toMatchObject([
      { type: "ERROR", code: 1011, message: "storage_failed" },
    ]);
  expect(file.log.get(DOC)?.generation).toBe(1);
  expect(file.generations.get(DOC, 1)).toBeNull();
  expect(moved(sam)).toEqual([]);
});

test("a rebuilt document is not rebuilt again for its size alone", () => {
  const world = rebuildWorld({
    limits: { rebuildMinBytes: 0, rebuildBytesRatio: 0, checkpointEvery: 1 },
  });
  const { service, clock, file, sam, rebuildNow } = world;
  rebuildNow();
  expect(file.generations.get(DOC, 1)).toMatchObject({ reason: "bytes" });
  const fresh = loadDoc(stepTwoOf(joinSecond(world, sam)), {
    clientId: SAM_CLIENT,
  });
  for (const [clientSeq, text] of ["x", "y", "z"].entries()) {
    const update = capture(fresh, (w) => w.insertText(BLOCK, 0, text));
    service.receive(sam, {
      type: "PUSH",
      docId: DOC,
      generation: 2,
      clientSeq: clientSeq + 1,
      update,
      heal: false,
    });
    clock.runDeferred();
  }
  clock.advance(10_000);
  expect(file.log.get(DOC)).toMatchObject({ generation: 2, headSeq: 4 });
  expect(service.stats()).toMatchObject({
    rebuilds: 1,
    rebuildsSkipped: { under_budget: 1 },
  });
});
