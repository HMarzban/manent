import { expect, test } from "bun:test";
import {
  createDoc,
  scriptBody,
  scriptSettings,
  updateMeta,
} from "@manent/crdt";
import type { Home } from "@manent/storage";
import { SimulatedCrash } from "@manent/storage/testing";
import { MESSAGE_LIMIT_BYTES } from "@manent/sync-protocol";
import type { WritePathPorts } from "../src/index.ts";
import {
  BLOCK,
  DOC,
  DOC2,
  HOME,
  createTypist,
  placeScript,
  rawEdit,
  replayAll,
} from "./seed.ts";
import {
  ALICE_CLIENT,
  BOB_CLIENT,
  createWorld,
  occurrences,
  pushOf,
  restartOn,
  setOf,
  textOf,
} from "./write-world.ts";
import type { WriteWorld } from "./write-world.ts";

const BLOCK2 = "b000000000000002";
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const bytes = (length: number): Uint8Array => new Uint8Array(length);

/** One person's typing: the first call inserts their block holding `text`, each later one appends. */
function typistFor(
  clientId: number,
  blockId: string,
): (text: string) => Uint8Array {
  const typist = createTypist(clientId);
  let started = false;
  return (text) => {
    if (started) return typist.type(blockId, text);
    started = true;
    return typist.insertBlock(blockId, null, text);
  };
}

/** A block holding an image, which the editor never writes. */
const hostileImg = (): Uint8Array =>
  rawEdit(createDoc({ clientId: ALICE_CLIENT }), (body, make) =>
    body.insert(0, [
      make.element("section", {}, [
        make.element("block", { id: BLOCK, type: "action" }, [
          make.element("img"),
        ]),
      ]),
    ]),
  );

/** A block whose text carries a mark this server does not know. */
function blinkMark(): Uint8Array {
  const doc = createDoc({ clientId: ALICE_CLIENT });
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: BLOCK, type: "action" },
        content: [{ type: "text", text: "x", marks: [{ type: "blink" }] }],
      },
    ]),
  );
  return doc.encodeState();
}

const updateByClient = (clientId: number): Uint8Array =>
  createTypist(clientId).insertBlock(BLOCK2, null, "not mine");

/** The second of two updates in a row; the first is never sent. */
function secondOfTwo(): Uint8Array {
  const typist = createTypist(ALICE_CLIENT);
  typist.insertBlock(BLOCK, null, "first");
  return typist.type(BLOCK, "second");
}

const types = (world: WriteWorld): string[] => world.events.map((e) => e.type);

test("a push is committed, then acknowledged, then published — in that order", () => {
  const { path, room, subA, clock, events } = createWorld();
  const typing = typistFor(ALICE_CLIENT, BLOCK);
  path.push(room, subA, pushOf(1, typing("a")));
  // nothing leaves before the commit
  expect(events).toEqual([]);
  clock.runDeferred();
  expect(events.map((e) => e.type)).toEqual(["commit", "ack", "publish"]);
  expect(events[1]).toMatchObject({ clientSeq: 1, serverSeq: 1 });
  expect(room.file.log.get(DOC)!.headSeq).toBe(1);
});

test("only a heal push is put to the heal rule, so an ordinary push reads no ledger", () => {
  const asked: boolean[] = [];
  const admitsForeign: WritePathPorts["admitsForeign"] = (_r, _u, heal) => {
    asked.push(heal);
    return false;
  };
  const { path, room, subA, clock } = createWorld({ ports: { admitsForeign } });
  const typing = typistFor(ALICE_CLIENT, BLOCK);
  path.push(room, subA, pushOf(1, typing("a")));
  path.push(room, subA, { ...pushOf(2, typing("b")), heal: true });
  clock.runDeferred();
  expect(asked).toEqual([true]);
});

test("pushes of one turn share one transaction and keep their order", () => {
  const { path, room, subA, subB, clock, events, storage } = createWorld();
  const typing = {
    sam: typistFor(ALICE_CLIENT, BLOCK),
    dana: typistFor(BOB_CLIENT, BLOCK2),
  };
  for (let n = 1; n <= 50; n++)
    path.push(
      room,
      n % 2 ? subA : subB,
      pushOf(n, (n % 2 ? typing.sam : typing.dana)(String(n))),
    );
  const before = storage.commits();
  clock.runDeferred();
  expect(storage.commits() - before).toBe(1);
  expect(room.file.log.tail(DOC, 1, 0).rows.map((r) => r.seq)).toEqual(
    range(1, 50),
  );
  expect(
    events
      .filter((e) => e.type === "ack")
      .map((e) => e.type === "ack" && e.serverSeq),
  ).toEqual(range(1, 50));
});

test("pushes to documents in two files commit separately", () => {
  const world = createWorld();
  const { path, room, subA, clock, storage, rooms } = world;
  const own: Home = { kind: "user", id: "sam" };
  placeScript(storage, { docId: DOC2, home: own });
  storage.open(own).log.registerClients(DOC2, "sam", [ALICE_CLIENT]);
  const second = rooms.room(DOC2, own, "private");
  rooms.load(second);
  second.editors.set(subA.peer, subA);
  path.push(room, subA, pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")));
  path.push(second, subA, pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("b")));
  const before = storage.commits();
  clock.runDeferred();
  expect(storage.commits() - before).toBe(2);
  expect(world.newAcks()).toEqual([1, 1]);
  expect([
    room.file.log.get(DOC)!.headSeq,
    second.file.log.get(DOC2)!.headSeq,
  ]).toEqual([1, 1]);
});

test("a duplicate is acknowledged in its place and neither stored nor published", () => {
  const { path, room, subA, clock, events } = createWorld();
  const typing = typistFor(ALICE_CLIENT, BLOCK);
  const update = typing("a");
  path.push(room, subA, pushOf(1, update));
  path.push(room, subA, pushOf(1, update));
  path.push(room, subA, pushOf(2, typing("b")));
  clock.runDeferred();
  expect(events.map((e) => e.type)).toEqual([
    "commit",
    "ack",
    "publish",
    "ack",
    "ack",
    "publish",
  ]);
  expect(
    events.flatMap((e) =>
      e.type === "ack" ? [[e.clientSeq, e.serverSeq]] : [],
    ),
  ).toEqual([
    [1, 1],
    [1, 1],
    [2, 2],
  ]);
  expect(room.file.log.get(DOC)!.headSeq).toBe(2);
});

test("each refusal has its code, stalls the subscription and commits nothing of it", () => {
  const cases: [
    string,
    (w: WriteWorld) => void,
    number,
    string,
    boolean,
    number,
  ][] = [
    [
      "not an update",
      (w) => w.path.push(w.room, w.subA, pushOf(1, new Uint8Array([1, 2, 3]))),
      4400,
      "bad_update",
      true,
      1,
    ],
    [
      "someone else's client id",
      (w) => w.path.push(w.room, w.subA, pushOf(1, updateByClient(BOB_CLIENT))),
      4400,
      "foreign_client_id",
      true,
      1,
    ],
    [
      "depends on an update never sent",
      (w) => w.path.push(w.room, w.subA, pushOf(2, secondOfTwo())),
      4400,
      "incomplete",
      true,
      2,
    ],
    [
      "an image inside a block",
      (w) => w.path.push(w.room, w.subA, pushOf(1, hostileImg())),
      4422,
      "invalid",
      true,
      1,
    ],
    [
      "content this server does not know",
      (w) => w.path.push(w.room, w.subA, pushOf(1, blinkMark())),
      4422,
      "invalid",
      true,
      1,
    ],
    [
      "larger than a message may be",
      (w) =>
        w.path.push(w.room, w.subA, pushOf(1, bytes(MESSAGE_LIMIT_BYTES + 1))),
      4413,
      "too_large",
      true,
      1,
    ],
    [
      "another generation",
      (w) =>
        w.path.push(w.room, w.subA, {
          ...pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")),
          generation: 2,
        }),
      4409,
      "generation_moved",
      false,
      1,
    ],
    [
      "a viewer",
      (w) =>
        w.path.push(
          w.room,
          w.subViewer,
          pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")),
        ),
      4403,
      "not_subscribed",
      false,
      1,
    ],
  ];
  for (const [name, act, code, message, permanent, sentSeq] of cases) {
    const world = createWorld();
    act(world);
    world.clock.runDeferred();
    // only a final refusal names its entry
    expect([name, world.refusals]).toEqual([
      name,
      [
        {
          code,
          message,
          permanent,
          retryAfterMs: null,
          clientSeq: permanent ? sentSeq : null,
        },
      ],
    ]);
    expect([name, world.subA.stalled]).toEqual([name, permanent]);
    expect([name, world.room.file.log.get(DOC)!.headSeq]).toEqual([name, 0]);
  }
});

test("a stalled subscription's later pushes and settings are dropped unanswered", () => {
  const { path, room, subA, clock, events } = createWorld();
  path.push(room, subA, pushOf(1, hostileImg()));
  path.push(room, subA, pushOf(2, typistFor(ALICE_CLIENT, BLOCK)("a")));
  path.set(room, subA, setOf(3, "script.paper", "a4"));
  clock.runDeferred();
  expect(events.map((e) => e.type)).toEqual(["refuse"]);
});

test("after a refusal the room is the log again, and what was queued before it is kept", () => {
  const world = createWorld();
  const { path, room, subA, subB, storage } = world;
  path.push(room, subB, pushOf(1, typistFor(BOB_CLIENT, BLOCK2)("kept")));
  path.push(room, subA, pushOf(1, hostileImg()));
  // the refusal committed the queue first
  expect(room.file.log.get(DOC)!.headSeq).toBe(1);
  // reloaded: no trace of the refused push
  expect(scriptBody(room.doc!).materialize()).toEqual(replayAll(storage));
  expect(world.events.filter((e) => e.type === "ack")).toHaveLength(1);
});

test("a document that would pass 64 MB is refused before it is applied", () => {
  const { path, room, subA, clock, refusals } = createWorld({
    limits: { documentBytes: 1_000 },
  });
  room.sizeBytes = 990;
  const before = scriptBody(room.doc!).materialize();
  path.push(room, subA, pushOf(1, bytes(11)));
  clock.runDeferred();
  expect(refusals).toEqual([
    {
      code: 4413,
      message: "too_large",
      permanent: true,
      retryAfterMs: null,
      clientSeq: 1,
    },
  ]);
  expect(scriptBody(room.doc!).materialize()).toEqual(before);
});

test("an empty bucket answers with how long to wait, and takes nothing", () => {
  const taken: number[] = [];
  const { path, room, subA, clock, refusals } = createWorld({
    ports: {
      bucketOf: () => ({
        frames: { take: () => ({ ok: false, retryAfterMs: 250 }) },
        bytes: {
          take: (cost) => {
            taken.push(cost);
            return { ok: true };
          },
        },
      }),
    },
  });
  path.push(room, subA, pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")));
  clock.runDeferred();
  expect(refusals).toEqual([
    {
      code: 4429,
      message: "rate_limited",
      permanent: false,
      retryAfterMs: 250,
      clientSeq: null,
    },
  ]);
  expect([taken, room.file.log.get(DOC)!.headSeq, subA.stalled]).toEqual([
    [],
    0,
    false,
  ]);
});

test("when the commit fails the rooms are poisoned and nothing is acknowledged", () => {
  const world = createWorld();
  const { path, room, subA, clock, storage, dropped } = world;
  path.push(room, subA, pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")));
  storage.failNextCommit();
  clock.runDeferred();
  expect(types(world)).toEqual(["poisoned"]);
  expect(dropped).toEqual([room]);
  expect(room.file.log.get(DOC)!.headSeq).toBe(0);
});

test("a replay commits its version, its update and its key together, and tells every editor", () => {
  const KEY = "00112233445566778899aabbccddeeff";
  const record = {
    docId: DOC,
    key: KEY,
    userId: "sam",
    fromGeneration: 1,
    generation: 1,
    result: "{}",
    createdAt: 1_000,
  };
  const version = {
    id: "version-1",
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "pre_merge" as const,
    name: null,
    createdByUserId: "sam",
    createdAt: 1_000,
    deviceId: null,
  };
  /** Writes BLOCK into the room's document as a replay does, and queues it. */
  const replayInto = (world: WriteWorld, done: string[]): void => {
    const { room } = world;
    const made: Uint8Array[] = [];
    const doc = room.doc!;
    const stop = doc.subscribe((update) => made.push(update));
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        { type: "block", attrs: { id: BLOCK, type: "action" }, content: [] },
      ]),
    );
    stop();
    const item = { userId: "sam", update: made[0]!, version, record };
    world.path.replay(room, item, (result) =>
      done.push(`${JSON.stringify(result)} after ${types(world).join(",")}`),
    );
  };

  const world = createWorld();
  const done: string[] = [];
  replayInto(world, done);
  world.clock.runDeferred();
  expect(done).toEqual(['{"ok":true,"seq":1} after commit']);
  expect(world.events).toEqual([
    { type: "commit" },
    { type: "publish", peer: null, seq: 1, echo: true },
  ]);
  const file = world.room.file;
  expect(
    file.log.tail(DOC, 1, 0).rows.map((r) => [r.seq, r.origin, r.userId]),
  ).toEqual([[1, "replay", "sam"]]);
  expect(file.versions.list(DOC)).toEqual([version]);
  expect(file.replays.get(DOC, KEY)).toEqual({ ...record, seq: 1 });

  const failing = createWorld();
  const refused: string[] = [];
  replayInto(failing, refused);
  failing.storage.failNextCommit();
  failing.clock.runDeferred();
  expect(refused).toEqual(['{"ok":false} after poisoned']);
  expect(failing.dropped).toEqual([failing.room]);
  expect(failing.storage.open(HOME).replays.get(DOC, KEY)).toBeNull();
  expect(failing.storage.open(HOME).versions.list(DOC)).toEqual([]);
});

test("killed at any step, nothing acknowledged is lost", () => {
  for (const step of [
    "before_commit",
    "after_commit",
    "after_ack",
    "after_publish",
  ] as const) {
    // the ports throw SimulatedCrash there: storage.crashOnCommit("before" | "after"), or ack / publish throwing
    const world = createWorld({ crashAt: { step, occurrence: 2 } });
    const typist = createTypist(ALICE_CLIENT);
    const markers = ["[one]", "[two]", "[three]"];
    const edits = [
      typist.insertBlock(BLOCK, null, markers[0]),
      typist.type(BLOCK, markers[1]!),
      typist.type(BLOCK, markers[2]!),
    ];
    const acked: number[] = [];
    let crashed: unknown = null;
    try {
      for (let n = 1; n <= 3; n++) {
        world.path.push(world.room, world.subA, pushOf(n, edits[n - 1]!));
        world.clock.runDeferred();
        acked.push(...world.newAcks());
      }
    } catch (e) {
      crashed = e;
    }
    acked.push(...world.newAcks());
    expect([step, crashed instanceof SimulatedCrash]).toEqual([step, true]);
    // new rooms and a new write path over the same storage
    const after = restartOn(world.storage);
    // every acknowledged edit is in the document built from the log
    for (const n of acked)
      expect([step, textOf(after.room)]).toEqual([
        step,
        expect.stringContaining(markers[n - 1]!),
      ]);
    for (let n = 1; n <= 3; n++)
      after.path.push(after.room, after.subA, pushOf(n, edits[n - 1]!));
    after.clock.runDeferred();
    // resending everything is safe: once each, never twice
    for (const m of markers)
      expect([step, m, occurrences(textOf(after.room), m)]).toEqual([
        step,
        m,
        1,
      ]);
  }
});

test("relay mode stores, acknowledges, publishes and hands every committed update upstream, in order", () => {
  const relay = createWorld({ mode: "relay" });
  const typing = typistFor(ALICE_CLIENT, BLOCK);
  for (let n = 1; n <= 3; n++)
    relay.path.push(relay.room, relay.subA, pushOf(n, typing(String(n))));
  relay.clock.runDeferred();
  expect(
    relay.upstream.map((u) => [
      u.kind,
      u.docId,
      u.generation,
      u.kind === "update" ? u.seq : 0,
    ]),
  ).toEqual([
    ["update", DOC, 1, 1],
    ["update", DOC, 1, 2],
    ["update", DOC, 1, 3],
  ]);
  expect(types(relay)).toEqual([
    "commit",
    "upstream",
    "upstream",
    "upstream",
    "ack",
    "publish",
    "ack",
    "publish",
    "ack",
    "publish",
  ]);
});

test("relay mode hands a setting upstream and writes nothing itself", () => {
  const relay = createWorld({ mode: "relay" });
  const request = setOf(4, "script.paper", "a4");
  relay.path.set(relay.room, relay.subA, request);
  relay.clock.runDeferred();
  expect(relay.upstream).toEqual([
    {
      kind: "set",
      docId: DOC,
      generation: 1,
      userId: "sam",
      clientSeq: 4,
      key: "script.paper",
      value: request.value,
    },
  ]);
  expect(relay.newAcks()).toEqual([4]);
  expect(scriptSettings(relay.room.doc!).entries()).toEqual({});
  expect(relay.room.file.log.get(DOC)!.headSeq).toBe(0);
});

test("relay mode never raises the schema and never treats a push as healing", () => {
  const relay = createWorld({
    mode: "relay",
    ports: { schemaFloor: () => 2, admitsForeign: () => true },
  });
  relay.path.push(
    relay.room,
    relay.subA,
    pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")),
  );
  relay.clock.runDeferred();
  expect(relay.room.file.log.get(DOC)!.schemaVersion).toBe(1);
  expect(types(relay)).not.toContain("schema_raised");
  relay.path.push(relay.room, relay.subA, {
    ...pushOf(2, updateByClient(BOB_CLIENT)),
    heal: true,
  });
  relay.clock.runDeferred();
  expect(relay.refusals).toEqual([
    {
      code: 4400,
      message: "foreign_client_id",
      permanent: true,
      retryAfterMs: null,
      clientSeq: 2,
    },
  ]);
  expect(relay.room.file.log.healing(DOC)).toBeNull();
});

test("authority mode raises the minimum schema in the commit and tells the room before publishing", () => {
  const world = createWorld({ ports: { schemaFloor: () => 2 } });
  world.path.push(
    world.room,
    world.subA,
    pushOf(1, typistFor(ALICE_CLIENT, BLOCK)("a")),
  );
  world.clock.runDeferred();
  expect(world.room.file.log.get(DOC)!.schemaVersion).toBe(2);
  expect(types(world)).toEqual(["commit", "ack", "schema_raised", "publish"]);
});

test("a push the heal rule admits is stored as a heal", () => {
  const asked: unknown[] = [];
  const world = createWorld({
    ports: {
      admitsForeign: (_room, userId, heal, ranges) => {
        asked.push([userId, heal, ranges]);
        return true;
      },
    },
  });
  const update = updateByClient(BOB_CLIENT);
  world.path.push(world.room, world.subA, { ...pushOf(1, update), heal: true });
  world.clock.runDeferred();
  expect(asked).toEqual([["sam", true, updateMeta(update)]]);
  expect(
    world.room.file.log.tail(DOC, 1, 0).rows.map((r) => [r.origin, r.userId]),
  ).toEqual([["heal", "sam"]]);
});
