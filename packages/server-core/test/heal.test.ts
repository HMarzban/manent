import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { DocumentRow, HealingRow } from "@manent/storage";
import type { Message } from "@manent/sync-protocol";
import { admitsForeign, verifiedHead } from "../src/index.ts";
import {
  BLOCK,
  DOC,
  DOC2,
  HOME,
  PROJECT,
  createTypist,
  replayAll,
} from "./seed.ts";
import type { Typist } from "./seed.ts";
import {
  DANA_CLIENT,
  SAM_CLIENT,
  createServiceWorld,
  push,
  subscribe,
} from "./service-world.ts";
import type { ServiceOptions, ServiceWorld } from "./service-world.ts";

const DELETED_WORD = "Thunder";

const rowWithHead = (headSeq: number): DocumentRow => ({
  id: DOC,
  kind: "script",
  ownerUserId: null,
  generation: 1,
  headSeq,
  schemaVersion: 1,
  engineVersion: 0,
  locked: 0,
  createdAt: 0,
  deletedAt: null,
});

const healPush = (
  docId: string,
  update: Uint8Array,
  clientSeq = 1,
): Message => ({
  type: "PUSH",
  docId,
  generation: 1,
  clientSeq,
  update,
  heal: true,
});

/** Every block's text, in order. */
function textOf(doc: CrdtDoc | DocJSON): string {
  const json = "type" in doc ? doc : scriptBody(doc).materialize();
  return (json.content ?? [])
    .flatMap((section) => section.content ?? [])
    .map((block) => (block.content ?? []).map((run) => run.text).join(""))
    .join("\n");
}

/** The server's state vector, from the step 1 among the messages a SUBSCRIBE was answered with. */
function serverVector(messages: readonly Message[]): Uint8Array {
  const step = messages.find((m) => m.type === "SYNC" && m.step === "step1");
  if (step?.type !== "SYNC") throw new RangeError("no step 1 was sent");
  return step.data;
}

/** Sam holds a replica that took every update Dana's typist made. */
function replicaOf(updates: readonly Uint8Array[]): CrdtDoc {
  const doc = createDoc({ clientId: SAM_CLIENT });
  for (const update of updates) doc.applyUpdate(update);
  return doc;
}

interface Edited extends ServiceWorld {
  typist: Typist;
  updates: Uint8Array[];
}

/** Dana subscribes and pushes `updates`, each acknowledged. */
function editedBy(
  make: (typist: Typist) => Uint8Array[],
  options: ServiceOptions = {},
): Edited {
  const world = createServiceWorld(options);
  const typist = createTypist(DANA_CLIENT);
  const updates = make(typist);
  world.service.receive(world.dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  updates.forEach((update, i) =>
    world.service.receive(world.dana, push(DOC, i + 1, update)),
  );
  world.clock.runDeferred();
  expect(world.dana.take().filter((m) => m.type === "ACK")).toHaveLength(
    updates.length,
  );
  return Object.assign(world, { typist, updates });
}

const threeEdits = (typist: Typist) => [
  typist.insertBlock(BLOCK, null, "Rain"),
  typist.type(BLOCK, " on the"),
  typist.type(BLOCK, " roof"),
];

const file = (world: ServiceWorld) => world.storage.open(HOME);

test("the heal rule admits only what the ledger shows was acknowledged", () => {
  const ledger = new Map([
    [7, { userId: "dana", ackedClock: 40 }],
    [8, { userId: "sam", ackedClock: 10 }],
  ]);
  const flagged: HealingRow = {
    reason: "quarantine",
    verifiedSeq: 3,
    flaggedAt: 0,
    preHealVersionId: null,
  };
  expect(
    admitsForeign(flagged, ledger, "sam", true, [{ clientId: 7, toClock: 40 }]),
  ).toBe(true);
  // beyond what was acknowledged
  expect(
    admitsForeign(flagged, ledger, "sam", true, [{ clientId: 7, toClock: 41 }]),
  ).toBe(false);
  // an id the ledger never saw
  expect(
    admitsForeign(flagged, ledger, "sam", true, [{ clientId: 99, toClock: 1 }]),
  ).toBe(false);
  // not marked heal
  expect(
    admitsForeign(flagged, ledger, "sam", false, [{ clientId: 7, toClock: 5 }]),
  ).toBe(false);
  // not flagged
  expect(
    admitsForeign(null, ledger, "sam", true, [{ clientId: 7, toClock: 5 }]),
  ).toBe(false);
});

test("the verified head is the head, or what precedes the first quarantined row", () => {
  expect(verifiedHead(rowWithHead(9), null)).toBe(9);
  expect(
    verifiedHead(rowWithHead(9), {
      reason: "quarantine",
      verifiedSeq: 4,
      flaggedAt: 0,
      preHealVersionId: null,
    }),
  ).toBe(4);
  expect(
    verifiedHead(rowWithHead(9), {
      reason: "behind",
      verifiedSeq: 9,
      flaggedAt: 0,
      preHealVersionId: null,
    }),
  ).toBe(9);
});

test("a corrupt row heals from a client that had seen it, with a pre-heal version first", () => {
  const world = editedBy(threeEdits);
  // sam's replica holds all three
  const samDoc = replicaOf(world.updates);
  world.storage.corruptRow(DOC, 2);
  world.restart();
  const { service, sam, clock } = world;
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 3 }),
  );
  const answered = sam.take();
  // below what sam saw: sam must heal
  expect(answered[0]).toMatchObject({ type: "SUBSCRIBED", headSeq: 1 });
  service.receive(sam, healPush(DOC, samDoc.diff(serverVector(answered))));
  clock.runDeferred();
  expect(sam.take().at(-1)).toMatchObject({ type: "ACK" });
  // dana's lost edit is back, pushed by sam
  expect(textOf(replayAll(world.storage))).toBe(textOf(samDoc));
  expect(
    file(world)
      .versions.list(DOC)
      .map((v) => [v.kind, v.seq, v.createdByUserId]),
  ).toEqual([["pre_heal", 3, "sam"]]);
  expect(
    file(world)
      .log.tail(DOC, 1, 3)
      .rows.map((r) => r.origin),
  ).toEqual(["heal"]);
  expect(file(world).log.healing(DOC)?.preHealVersionId).toBe("version-1");
});

test("a heal push cannot carry what the server never acknowledged", () => {
  const world = editedBy(threeEdits);
  const { service, sam, clock } = world;
  // flagged as behind
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 50 }),
  );
  sam.take();
  // one struct past dana's acknowledged clock
  const forged = world.typist.type(BLOCK, "!");
  service.receive(sam, healPush(DOC, forged));
  clock.runDeferred();
  expect(sam.take().at(-1)).toMatchObject({
    type: "ERROR",
    code: 4400,
    message: "foreign_client_id",
    permanent: true,
    clientSeq: 1,
  });
  expect(file(world).versions.list(DOC)).toEqual([]);
});

test("a heal flag on a healthy document buys nothing", () => {
  const world = editedBy(threeEdits);
  const { service, sam, clock } = world;
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 3 }),
  );
  const answered = sam.take();
  expect(answered[0]).toMatchObject({ type: "SUBSCRIBED", headSeq: 3 });
  const extra = createTypist(DANA_CLIENT);
  service.receive(
    sam,
    healPush(DOC, extra.insertBlock("b000000000000002", null, "x")),
  );
  clock.runDeferred();
  expect(sam.take()).toMatchObject([
    { type: "ERROR", code: 4400, message: "foreign_client_id" },
  ]);
  expect(file(world).log.healing(DOC)).toBeNull();
});

test("a client that reports a head beyond the server's flags the document", () => {
  const world = editedBy(threeEdits);
  world.service.receive(
    world.sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 50 }),
  );
  expect(file(world).log.healing(DOC)).toMatchObject({
    reason: "behind",
    verifiedSeq: 3,
  });
  expect(world.sam.take()[0]).toMatchObject({ type: "SUBSCRIBED", headSeq: 3 });
});

test("a damaged row that only deleted text is healed too", () => {
  const world = editedBy((typist) => [
    typist.insertBlock(BLOCK, null, `Rain and ${DELETED_WORD} tonight`),
    typist.deleteText(BLOCK, "Rain and ".length, DELETED_WORD.length),
  ]);
  const samDoc = replicaOf(world.updates);
  world.storage.corruptRow(DOC, 2);
  world.restart();
  const { service, sam, clock } = world;
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 2 }),
  );
  // the server has forgotten the deletion
  expect(textOf(replayAll(world.storage))).toContain(DELETED_WORD);
  const answered = sam.take();
  // sam's diff carries its whole delete set
  service.receive(sam, healPush(DOC, samDoc.diff(serverVector(answered))));
  clock.runDeferred();
  expect(sam.take().at(-1)).toMatchObject({ type: "ACK" });
  expect(textOf(replayAll(world.storage))).not.toContain(DELETED_WORD);
  expect(textOf(replayAll(world.storage))).toBe("Rain and  tonight");
});

test("healing twice changes nothing and stores nothing", () => {
  const world = editedBy(threeEdits);
  const samDoc = replicaOf(world.updates);
  world.storage.corruptRow(DOC, 2);
  world.restart();
  const { service, sam, clock } = world;
  service.receive(
    sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 3 }),
  );
  const heal = healPush(DOC, samDoc.diff(serverVector(sam.take())));
  service.receive(sam, heal);
  clock.runDeferred();
  const first = sam.take().at(-1);
  service.receive(sam, heal);
  clock.runDeferred();
  expect(sam.take()).toEqual([first!]);
  expect(first).toMatchObject({ type: "ACK", serverSeq: 4 });
  expect(
    file(world)
      .log.tail(DOC, 1, 0)
      .rows.filter((r) => r.origin === "heal"),
  ).toHaveLength(1);
});

test("after a restore every document is flagged at its head", () => {
  const world = editedBy(threeEdits);
  world.service.access.create("sam", {
    docId: DOC2,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  world.service.restored();
  expect([
    file(world).log.healing(DOC),
    file(world).log.healing(DOC2),
  ]).toMatchObject([
    { reason: "restore", verifiedSeq: 3 },
    { reason: "restore", verifiedSeq: 0 },
  ]);
});

test("a relay never heals", () => {
  const world = editedBy(threeEdits, { mode: "relay" });
  world.service.receive(
    world.sam,
    subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq: 50 }),
  );
  expect(world.sam.take()[0]).toMatchObject({ type: "SUBSCRIBED", headSeq: 3 });
  world.service.restored();
  expect(file(world).log.healing(DOC)).toBeNull();
});
