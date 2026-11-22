import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  ORIGIN_LOAD,
  createDoc,
  findTyped,
  loadDoc,
  scriptBody,
  scriptSettings,
  updateMeta,
} from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { REPLAY_REFUSALS, encodeReplayUpdates } from "@manent/sync-protocol";
import type { Message, ReplayRequest } from "@manent/sync-protocol";
import type { SyncLimits } from "../src/index.ts";
import type { FakePeer } from "../src/testing/index.ts";
import { DOC, DOC2, HOME, PROJECT, rawEdit } from "./seed.ts";
import type { ElementNode } from "./seed.ts";
import {
  DANA_CLIENT,
  EMPTY_VECTOR,
  SAM_CLIENT,
  clientOf,
  createServiceWorld,
} from "./service-world.ts";

const B1 = "b000000000000001";
const B2 = "b000000000000002";
const B9 = "b000000000000009";
const B1_TEXT = "Rain on the glass.";
const B2_TEXT = "The kettle sings.";
const KEY = "00112233445566778899aabbccddeeff";
const DANA_TABLET = 2003;
const OTHER_KEY = "ffeeddccbbaa99887766554433221100";
/** Any measured document is over budget. */
const FORCE = { rebuildClientIds: 0, checkpointEvery: 1 };

type Write = (writer: BlockWriter) => void;

const action = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

const typeInto =
  (id: string, text: string): Write =>
  (w) =>
    w.insertText(id, 0, text);

/** The one update `change` makes to `doc`. */
function capture(doc: CrdtDoc, change: () => void): Uint8Array {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  change();
  stop();
  const [update] = made;
  if (made.length !== 1 || update === undefined)
    throw new RangeError(`a change must make one update, not ${made.length}`);
  return update;
}

const written = (doc: CrdtDoc, write: Write): Uint8Array =>
  capture(doc, () => scriptBody(doc).write(write));

function stepTwoOf(messages: readonly Message[]): Uint8Array {
  const found = messages.find(
    (message) => message.type === "SYNC" && message.step === "step2",
  );
  if (found?.type !== "SYNC") throw new RangeError("no step 2 was sent");
  return found.data;
}

/** An image element inside B2, which validation refuses, written on `doc`. */
const imageEdit = (doc: CrdtDoc): Uint8Array =>
  rawEdit(doc, (body, make) => {
    const section = body.get(0) as ElementNode;
    const block = section.get(1) as ElementNode;
    block.insert(0, [make.element("img")]);
  });

/** A setting, which a replay may not write, written on `doc`. */
const settingEdit = (doc: CrdtDoc): Uint8Array =>
  capture(doc, () =>
    scriptSettings(doc).set("script.paper", "a4", {
      userId: "sam",
      setAt: 1_000,
      replaced: null,
    }),
  );

/** Text typed into a block the log never held, without the update that made the block. */
function needsMoreOf(clientId: number): Uint8Array {
  const stranger = createDoc({ clientId });
  written(stranger, (w) => w.insertBlocks(null, [action(B9, "")]));
  return written(stranger, typeInto(B9, "Fog."));
}

/**
 * The service over FORCE (or FORCE and `limits`). Dana is online and has written B1 and B2 in
 * generation 1; Sam then joined, so his copy is acknowledged at the head, and went on offline.
 */
function replayWorld(limits: Partial<SyncLimits> = {}) {
  const world = createServiceWorld({ limits: { ...FORCE, ...limits } });
  const { service, clock, storage, sam, dana } = world;
  const file = storage.open(HOME);
  let clientSeq = 0;
  const generation = (): number => file.log.get(DOC)?.generation ?? 0;
  /** The peer's copy of the current generation, under its own client id. */
  const join = (peer: FakePeer): CrdtDoc => {
    service.receive(peer, {
      type: "SUBSCRIBE",
      docId: DOC,
      generation: 0,
      mode: "edit",
      clientIds: [clientOf(peer)],
      lastServerSeq: 0,
    });
    service.receive(peer, {
      type: "SYNC",
      docId: DOC,
      generation: generation(),
      step: "step1",
      data: EMPTY_VECTOR,
    });
    return loadDoc(stepTwoOf(peer.take()), { clientId: clientOf(peer) });
  };
  let danaDoc = join(dana);
  const danaEdit = (write: Write): void => {
    const update = written(danaDoc, write);
    service.receive(dana, {
      type: "PUSH",
      docId: DOC,
      generation: generation(),
      clientSeq: ++clientSeq,
      update,
      heal: false,
    });
    clock.runDeferred();
    dana.take();
  };
  danaEdit((w) =>
    w.insertBlocks(null, [action(B1, B1_TEXT), action(B2, B2_TEXT)]),
  );
  const samDoc = join(sam);
  const acked = file.log.get(DOC)?.headSeq ?? 0;
  return {
    ...world,
    file,
    samDoc,
    danaEdit,
    /** Sam's edit on his offline copy, as the updates his device holds. */
    samOffline: (write: Write): Uint8Array[] => [written(samDoc, write)],
    /** The room goes quiet and is rebuilt; Dana loads the new generation. */
    rebuildNow(): void {
      clock.advance(10_000);
      danaDoc = join(dana);
    },
    requestOf: (
      updates: readonly Uint8Array[],
      given: { generation: number; key: string; lastServerSeq?: number },
    ): ReplayRequest => ({
      docId: DOC,
      generation: given.generation,
      lastServerSeq: given.lastServerSeq ?? acked,
      key: given.key,
      updates: encodeReplayUpdates(updates),
    }),
    /** The replay's answer once the turn that commits it has ended. */
    replayed(userId: string, body: unknown) {
      const outcome = service.replay(userId, body);
      clock.runDeferred();
      return outcome;
    },
    /** The text of the block as the log of the current generation builds it. */
    textOfRoom(id: string): string {
      const doc = createDoc();
      for (const row of file.log.tail(DOC, generation(), 0).rows)
        doc.applyUpdate(row.update, ORIGIN_LOAD);
      const found = blocksOf(scriptBody(doc).materialize()).find(
        (block) => block.attrs.id === id,
      );
      return found === undefined ? "" : blockText(found);
    },
  };
}

test("edits in untouched blocks are re-applied as that person's edits, after a version kept before them", async () => {
  const world = replayWorld();
  const { file, dana, samOffline, rebuildNow, replayed, requestOf } = world;
  const offline = samOffline((w) => w.insertText(B2, 0, "Night. "));
  rebuildNow();
  const outcome = await replayed(
    "sam",
    requestOf(offline, { generation: 1, key: KEY }),
  );
  expect(outcome).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 2,
      applied: 1,
      overlaps: [],
      setAside: [],
    },
  });
  expect(
    file.log.tail(DOC, 2, 1).rows.map((r) => [r.seq, r.origin, r.userId]),
  ).toEqual([[2, "replay", "sam"]]);
  expect(
    file.versions
      .list(DOC)
      .map((v) => [v.kind, v.generation, v.seq, v.createdByUserId]),
  ).toEqual([["pre_merge", 2, 1, "sam"]]);
  expect(world.textOfRoom(B2)).toBe("Night. " + B2_TEXT);
  expect(dana.take()).toMatchObject([{ type: "SYNC", step: "update" }]);
});

test("each person's replayed edits are written under a client id that person owns", async () => {
  const world = replayWorld();
  const { file, samDoc, samOffline, rebuildNow, replayed, requestOf } = world;
  const danaOffline = loadDoc(samDoc.encodeState(), { clientId: DANA_TABLET });
  const sams = samOffline(typeInto(B1, "Dusk. "));
  const danas = [written(danaOffline, typeInto(B2, "Dawn. "))];
  rebuildNow();
  const answers = [
    await replayed("sam", requestOf(sams, { generation: 1, key: KEY })),
    await replayed("dana", requestOf(danas, { generation: 1, key: OTHER_KEY })),
  ];
  expect(answers).toMatchObject([{ ok: true }, { ok: true }]);
  const ledger = file.log.ledger(DOC);
  const rows = file.log
    .tail(DOC, 2, 1)
    .rows.map((row) => [
      row.userId,
      updateMeta(row.update).map(
        (meta) => ledger.get(meta.clientId)?.userId ?? null,
      ),
    ]);
  expect(rows).toEqual([
    ["sam", ["sam"]],
    ["dana", ["dana"]],
  ]);
  expect(world.textOfRoom(B1)).toBe("Dusk. " + B1_TEXT);
  expect(world.textOfRoom(B2)).toBe("Dawn. " + B2_TEXT);
});

test("both sides changing one block merge by character, or keep theirs with this person's text to review", async () => {
  const apart = replayWorld();
  const cold = apart.samOffline(typeInto(B2, "cold "));
  apart.rebuildNow();
  apart.danaEdit((w) => w.insertText(B2, B2_TEXT.length, " hard"));
  const merged = await apart.replayed(
    "sam",
    apart.requestOf(cold, { generation: 1, key: KEY }),
  );
  expect(merged).toMatchObject({ ok: true, response: { applied: 1 } });
  expect(apart.textOfRoom(B2)).toBe("cold " + B2_TEXT + " hard");

  const touching = replayWorld();
  const after = touching.samOffline((w) =>
    w.insertText(B2, B2_TEXT.length, " cold"),
  );
  touching.rebuildNow();
  touching.danaEdit((w) => w.insertText(B2, B2_TEXT.length, " hard"));
  const kept = await touching.replayed(
    "sam",
    touching.requestOf(after, { generation: 1, key: KEY }),
  );
  expect(kept).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 2,
      applied: 0,
      overlaps: [{ blockId: B2, text: B2_TEXT + " cold" }],
      setAside: [],
    },
  });
  expect(touching.textOfRoom(B2)).toBe(B2_TEXT + " hard");
});

test("an edit in a block deleted since is set aside with the block before it", async () => {
  const world = replayWorld();
  const offline = world.samOffline(typeInto(B2, "Night. "));
  world.danaEdit((w) => w.deleteBlock(B2));
  world.rebuildNow();
  expect(
    await world.replayed(
      "sam",
      world.requestOf(offline, { generation: 1, key: KEY }),
    ),
  ).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 1,
      applied: 0,
      overlaps: [],
      setAside: [{ blockId: B2, nearBlockId: B1, text: "Night. " + B2_TEXT }],
    },
  });
  expect(world.textOfRoom(B2)).toBe("");
});

test("several skipped generations are carried through in turn", async () => {
  const world = replayWorld();
  const offline = world.samOffline(typeInto(B2, "Night. "));
  world.rebuildNow();
  world.danaEdit((w) => w.insertText(B1, B1_TEXT.length, " Thunder."));
  world.rebuildNow();
  expect(world.file.log.get(DOC)?.generation).toBe(3);
  expect(
    await world.replayed(
      "sam",
      world.requestOf(offline, { generation: 1, key: KEY }),
    ),
  ).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 3,
      serverSeq: 2,
      applied: 1,
      overlaps: [],
      setAside: [],
    },
  });
  expect(world.textOfRoom(B2)).toBe("Night. " + B2_TEXT);
  expect(world.textOfRoom(B1)).toBe(B1_TEXT + " Thunder.");
});

test("a replay retried with its key applies nothing twice", async () => {
  const world = replayWorld();
  const { service, clock, file, samOffline, rebuildNow, replayed } = world;
  const request = world.requestOf(samOffline(typeInto(B2, "x")), {
    generation: 1,
    key: KEY,
  });
  rebuildNow();
  // the second and third arrive while the first is queued
  const pending = [
    service.replay("sam", request),
    service.replay("sam", request),
    service.replay("dana", request),
  ] as const;
  clock.runDeferred();
  const [first, second, theirs] = await Promise.all(pending);
  const third = await replayed("sam", request);
  expect(first).toMatchObject({ ok: true, response: { applied: 1 } });
  expect(second).toEqual(first);
  expect(third).toEqual(first);
  expect(theirs).toEqual({ ok: false, code: "bad_request" });
  expect(
    file.log.tail(DOC, 2, 0).rows.filter((r) => r.origin === "replay"),
  ).toHaveLength(1);
  // another person's key
  expect(await replayed("dana", request)).toEqual({
    ok: false,
    code: "bad_request",
  });
  expect(world.textOfRoom(B2)).toBe("x" + B2_TEXT);
});

test("edits that rest on what the device saw after its last acknowledgement still merge", async () => {
  const world = replayWorld();
  const { file, samDoc, danaEdit } = world;
  danaEdit((w) => w.insertText(B1, B1_TEXT.length, " 2"));
  danaEdit((w) => w.insertText(B1, B1_TEXT.length + 2, " 3"));
  // Sam's copy is acknowledged at 3, then receives Dana's new block at 4 and types into it
  for (const row of file.log.tail(DOC, 1, 1).rows.slice(0, 2))
    samDoc.applyUpdate(row.update, ORIGIN_LOAD);
  danaEdit((w) => w.insertBlocks(B2, [action(B9, "")]));
  for (const row of file.log.tail(DOC, 1, 3).rows)
    samDoc.applyUpdate(row.update, ORIGIN_LOAD);
  const offline = world.samOffline(typeInto(B9, "Fog."));
  world.rebuildNow();
  expect(
    await world.replayed(
      "sam",
      world.requestOf(offline, { generation: 1, key: KEY, lastServerSeq: 3 }),
    ),
  ).toMatchObject({ ok: true, response: { applied: 1, setAside: [] } });
  expect(world.textOfRoom(B9)).toBe("Fog.");
});

test("offline typing a replay writes is the device's own text where it was typed", async () => {
  const world = replayWorld();
  const offline = world.samOffline(typeInto(B1, "Rain. "));
  world.rebuildNow();
  await world.replayed(
    "sam",
    world.requestOf(offline, { generation: 1, key: KEY }),
  );
  const doc = createDoc();
  for (const row of world.file.log.tail(DOC, 2, 0).rows)
    doc.applyUpdate(row.update, ORIGIN_LOAD);
  const found = findTyped(doc, new Map([[SAM_CLIENT, 0]])).get(B1);
  const typed = [...(found?.text ?? "")].filter((_, i) => found?.typed[i]);
  expect([found?.text, typed.join("")]).toEqual(["Rain. " + B1_TEXT, "Rain. "]);
});

test("offline text a block's move removed unseen is set aside beside the moved block when that one is set aside too", async () => {
  const world = replayWorld();
  const { file, samDoc, danaEdit } = world;
  const typed = world.samOffline(typeInto(B2, "Night. "));
  // Dana moves B2 above B1 without seeing Sam's text; Sam receives it, types into the moved block,
  // and Dana then deletes it
  danaEdit((w) => {
    w.deleteBlock(B2);
    w.insertBlocks(null, [action(B2, B2_TEXT)]);
  });
  for (const row of file.log.tail(DOC, 1, 1).rows)
    samDoc.applyUpdate(row.update, ORIGIN_LOAD);
  const moved = world.samOffline(typeInto(B2, "Fog. "));
  danaEdit((w) => w.deleteBlock(B2));
  world.rebuildNow();
  expect(
    await world.replayed(
      "sam",
      world.requestOf([...typed, ...moved], { generation: 1, key: KEY }),
    ),
  ).toEqual({
    ok: true,
    response: {
      docId: DOC,
      generation: 2,
      serverSeq: 1,
      applied: 0,
      overlaps: [],
      setAside: [
        { blockId: B2, nearBlockId: B1, text: "Night. " },
        { blockId: B2, nearBlockId: null, text: "Fog. " + B2_TEXT },
      ],
    },
  });
});

test("past the window the changes are not merged", async () => {
  const world = replayWorld();
  const { clock, file, samOffline, rebuildNow, replayed, requestOf } = world;
  const offline = samOffline(typeInto(B2, "Night. "));
  rebuildNow();
  clock.advance(7_776_000_000);
  expect(
    await replayed("sam", requestOf(offline, { generation: 1, key: KEY })),
  ).toMatchObject({ ok: true, response: { applied: 1 } });
  clock.advance(1);
  const head = file.log.get(DOC)?.headSeq;
  const versions = file.versions.list(DOC);
  expect(
    await replayed(
      "sam",
      requestOf(offline, { generation: 1, key: OTHER_KEY }),
    ),
  ).toEqual({ ok: false, code: "past_window" });
  expect(file.log.get(DOC)?.headSeq).toBe(head);
  expect(file.versions.list(DOC)).toEqual(versions);
  expect(file.replays.get(DOC, OTHER_KEY)).toBeNull();
});

/** What a refused replay leaves: the head, the versions and the stored keys. */
function writtenOf(world: ReturnType<typeof replayWorld>): unknown {
  const { file } = world;
  return [
    file.log.get(DOC)?.headSeq,
    file.versions.list(DOC),
    file.replays.get(DOC, KEY),
  ];
}

test("each way a replay can be refused has its answer, and writes nothing", async () => {
  const world = replayWorld();
  const { samDoc, samOffline, requestOf, storage } = world;
  // what Sam's device held before it typed: each copy's edit rests on it alone
  const acked = samDoc.encodeState();
  const copy = (clientId: number): CrdtDoc => loadDoc(acked, { clientId });
  const good = requestOf(samOffline(typeInto(B2, "Night. ")), {
    generation: 1,
    key: KEY,
  });
  const withUpdate = (update: Uint8Array): ReplayRequest => ({
    ...good,
    updates: encodeReplayUpdates([update]),
  });
  const img = imageEdit(copy(SAM_CLIENT));
  const settings = settingEdit(copy(SAM_CLIENT));
  // Dana's other device: a client id of hers that wrote nothing Sam's copy holds
  world.file.log.registerClients(DOC, "dana", [DANA_TABLET]);
  const needsMore = needsMoreOf(8008);
  world.rebuildNow();
  const before = writtenOf(world);
  const cases: [string, string, unknown][] = [
    ["bad_request", "sam", null],
    ["bad_request", "sam", "x"],
    ["bad_request", "sam", []],
    ["bad_request", "sam", {}],
    ["bad_request", "sam", { ...good, docId: "not-a-doc" }],
    ["bad_request", "sam", { ...good, key: "ABC" }],
    ["bad_request", "sam", { ...good, updates: "x" }],
    ["bad_request", "sam", { ...good, updates: ["@@@@"] }],
    ["bad_request", "sam", { ...good, generation: 0 }],
    ["bad_request", "sam", { ...good, generation: 1.5 }],
    ["bad_request", "sam", { ...good, lastServerSeq: -1 }],
    ["not_found", "sam", { ...good, docId: DOC2 }],
    ["forbidden", "leo", good],
    [
      "forbidden",
      "sam",
      withUpdate(written(copy(DANA_TABLET), typeInto(B2, "x"))),
    ],
    ["generation_current", "sam", { ...good, generation: 2 }],
    ["unknown_generation", "sam", { ...good, generation: 7 }],
    ["invalid", "sam", withUpdate(img)],
    ["invalid", "sam", withUpdate(settings)],
    ["invalid", "sam", withUpdate(new Uint8Array([1, 2, 3]))],
    ["incomplete", "sam", withUpdate(needsMore)],
  ];
  for (const [code, userId, body] of cases) {
    expect([body, await world.replayed(userId, body)]).toEqual([
      body,
      { ok: false, code },
    ]);
    expect(writtenOf(world)).toEqual(before);
  }
  storage.directory.tombstone(DOC, "sam");
  expect(await world.replayed("sam", good)).toEqual({
    ok: false,
    code: "deleted",
  });
  expect(writtenOf(world)).toEqual(before);

  const small = replayWorld({ replayBodyBytes: 8 });
  const large = small.requestOf(small.samOffline(typeInto(B2, "x")), {
    generation: 1,
    key: KEY,
  });
  small.rebuildNow();
  const smallBefore = writtenOf(small);
  expect(await small.replayed("sam", large)).toEqual({
    ok: false,
    code: "too_large",
  });
  expect(writtenOf(small)).toEqual(smallBefore);

  // the only room that may be loaded holds Dana's other script
  const full = replayWorld({ maxLoadedRooms: 1 });
  full.service.access.create("sam", {
    docId: DOC2,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  full.storage.directory.setRole(DOC2, "dana", "edit", []);
  const waiting = full.requestOf(full.samOffline(typeInto(B2, "x")), {
    generation: 1,
    key: KEY,
  });
  full.clock.advance(10_000);
  full.service.receive(full.dana, {
    type: "SUBSCRIBE",
    docId: DOC2,
    generation: 0,
    mode: "edit",
    clientIds: [DANA_CLIENT],
    lastServerSeq: 0,
  });
  const fullBefore = writtenOf(full);
  expect(await full.replayed("sam", waiting)).toEqual({
    ok: false,
    code: "busy",
  });
  expect(writtenOf(full)).toEqual(fullBefore);
});

test("any body ends in an answer or one of the declared refusals, and never throws", async () => {
  const world = replayWorld();
  const { file, samDoc, samOffline, requestOf } = world;
  const head = file.log.get(DOC)?.headSeq ?? 0;
  // devices of whoever sends them first, resting on what Sam's copy was acknowledged at
  const acked = samDoc.encodeState();
  const fromAcked = written(
    loadDoc(acked, { clientId: 1007 }),
    typeInto(B1, "Dusk. "),
  );
  const img = imageEdit(loadDoc(acked, { clientId: 1008 }));
  const settings = settingEdit(loadDoc(acked, { clientId: 1009 }));
  const [valid] = samOffline(typeInto(B2, "Night. "));
  if (valid === undefined) throw new RangeError("Sam's edit made no update");
  world.rebuildNow();
  // from a device nobody holds yet
  const needsMore = fc.integer({ min: 10_000, max: 2 ** 30 }).map(needsMoreOf);
  const update = fc.oneof(
    { arbitrary: fc.constantFrom(valid, fromAcked), weight: 6 },
    { arbitrary: needsMore, weight: 2 },
    fc.constantFrom(img, settings),
    fc.uint8Array({ maxLength: 48 }),
    fc
      .tuple(fc.nat(), fc.integer({ min: 0, max: 255 }))
      .map(([at, byte]) => valid.with(at % valid.length, byte)),
    fc.nat().map((cut) => valid.slice(0, cut % valid.length)),
  );
  const near = fc
    .record({
      generation: fc.constantFrom(1, 1, 1, 2, 7),
      lastServerSeq: fc.constantFrom(0, head, head, 99),
      // mostly a key never used, so that the checks after it run
      key: fc.oneof(
        fc
          .uint8Array({ minLength: 16, maxLength: 16 })
          .map((bytes) => Buffer.from(bytes).toString("hex")),
        fc.constant(KEY),
      ),
      updates: fc.array(update, { minLength: 1, maxLength: 3 }),
      docId: fc.constantFrom(DOC, DOC, DOC, DOC2),
    })
    .map(({ updates, generation, key, lastServerSeq, docId }) => ({
      ...requestOf(updates, { generation, key, lastServerSeq }),
      docId,
    }));
  const field = fc.constantFrom(
    "docId",
    "generation",
    "lastServerSeq",
    "key",
    "updates",
  );
  const broken = fc
    .tuple(near, field, fc.jsonValue())
    .map(([request, name, value]) => ({ ...request, [name]: value }));
  const body = fc.oneof({ arbitrary: near, weight: 3 }, broken, fc.jsonValue());
  const declared: readonly string[] = REPLAY_REFUSALS;
  const reached = new Set<string>();
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom("sam", "sam", "dana", "leo"),
      body,
      async (userId, given) => {
        const outcome = await world.replayed(userId, given);
        const code = outcome.ok ? "ok" : outcome.code;
        reached.add(code);
        return outcome.ok || declared.includes(outcome.code);
      },
    ),
    { numRuns: 400 },
  );
  expect([...reached].toSorted()).toEqual([
    "bad_request",
    "forbidden",
    "generation_current",
    "incomplete",
    "invalid",
    "not_found",
    "ok",
    "unknown_generation",
  ]);
});
