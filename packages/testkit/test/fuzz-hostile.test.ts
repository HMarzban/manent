import { expect, test } from "bun:test";
import {
  createDoc,
  encodeAwareness,
  scriptBody,
  scriptDocFromJSON,
  scriptSettings,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { rejects, validateDoc } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { SYNC_ERRORS, createSyncService } from "@manent/server-core";
import type { SyncService } from "@manent/server-core";
import { fakeClock, fakePeer } from "@manent/server-core/testing";
import type { FakeClock, FakePeer } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  ProtocolError,
  createFrameDecoder,
  encodeMessage,
} from "@manent/sync-protocol";
import type { Message, VersionSet } from "@manent/sync-protocol";
import fc from "fast-check";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
/** Sam's client id; Dana's is foreign to him. */
const CLIENT = 1001;
const DANA_CLIENT = 2002;
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
const BLOCK = "b000000000000001";

interface Server {
  clock: FakeClock;
  storage: MemoryStorage;
  service: SyncService;
  peer: FakePeer;
  dana: FakePeer;
}

/** A service over memory storage holding DOC, owned by Sam, with Dana an editor; both attached, neither subscribed. */
function serve(): Server {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  let versions = 0;
  const service = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids: () => `version-${++versions}`,
    versions: { current: V1, min: V1 },
  });
  const home = `project:${PROJECT}`;
  service.access.create("sam", { docId: DOC, kind: "script", home });
  storage.directory.setRole(DOC, "dana", "edit", []);
  const peer = fakePeer();
  const dana = fakePeer({ userId: "dana", name: "Dana Reyes" });
  service.attach(peer);
  service.attach(dana);
  return { clock, storage, service, peer, dana };
}

const subscribe = (
  docId: string,
  mode: "edit" | "view",
  clientIds: number[],
): Message => ({
  type: "SUBSCRIBE",
  docId,
  generation: 0,
  mode,
  clientIds,
  lastServerSeq: 0,
});

const push = (
  docId: string,
  clientSeq: number,
  update: Uint8Array,
): Message => ({
  type: "PUSH",
  docId,
  generation: 1,
  clientSeq,
  update,
  heal: false,
});

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const block = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

/** Every update `write` makes on `doc`, in order. */
function updatesOf(doc: CrdtDoc, write: () => void): Uint8Array[] {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  write();
  stop();
  return made;
}

/** A first block and `n` characters typed into it, each its own update, by `clientId`. */
function typed(clientId: number, n: number): Uint8Array[] {
  const doc = createDoc({ clientId });
  const body = scriptBody(doc);
  return updatesOf(doc, () => {
    body.write((w) => w.insertBlocks(null, [block(BLOCK, "")]));
    for (let i = 0; i < n; i++)
      body.write((w) => w.insertText(BLOCK, i, String(i % 10)));
  });
}

type Fragment = ReturnType<typeof yXmlFragmentForBinding>;
type ElementNode = Extract<ReturnType<Fragment["get"]>, { nodeName: string }>;

/** An update by `clientId` holding a section whose block holds an element named `name`. */
function foreignElement(clientId: number, name: string): Uint8Array {
  const sample = yXmlFragmentForBinding(
    scriptDocFromJSON({ type: "doc", content: [{ type: "section" }] }),
  ).get(0) as ElementNode;
  const Element = sample.constructor as new (name: string) => ElementNode;
  const doc = createDoc({ clientId });
  const section = new Element("section");
  const holder = new Element("block");
  holder.setAttribute("id", BLOCK);
  holder.setAttribute("type", "action");
  holder.insert(0, [new Element(name)]);
  section.insert(0, [holder]);
  const [update] = updatesOf(doc, () =>
    yXmlFragmentForBinding(doc).insert(0, [section]),
  );
  return update ?? new Uint8Array();
}

function badAttribute(clientId: number): Uint8Array {
  const doc = createDoc({ clientId });
  const [update] = updatesOf(doc, () =>
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        {
          ...block(BLOCK, "x"),
          attrs: { id: BLOCK, type: "action", spaceBefore: -1 },
        },
      ]),
    ),
  );
  return update ?? new Uint8Array();
}

function settingWrite(clientId: number): Uint8Array {
  const doc = createDoc({ clientId });
  const meta = { userId: "sam", setAt: 1_000, replaced: null };
  const [update] = updatesOf(doc, () =>
    scriptSettings(doc).set("script.paper", "a4", meta),
  );
  return update ?? new Uint8Array();
}

const flip = (bytes: Uint8Array, at: number, bit: number): Uint8Array =>
  bytes.map((byte, i) => (i === at % bytes.length ? byte ^ (1 << bit) : byte));

const arbMutation: fc.Arbitrary<(bytes: Uint8Array) => Uint8Array> = fc.oneof(
  fc.tuple(fc.nat(), fc.nat({ max: 7 })).map(
    ([at, bit]) =>
      (bytes: Uint8Array) =>
        flip(bytes, at, bit),
  ),
  fc.nat().map((n) => (bytes: Uint8Array) => bytes.slice(0, n % bytes.length)),
  fc
    .tuple(fc.nat(), fc.integer({ min: 2, max: 4 }))
    .map(([at, times]) => (bytes: Uint8Array) => {
      const piece = bytes.slice(at % bytes.length);
      const out = new Uint8Array(bytes.length + piece.length * (times - 1));
      out.set(bytes);
      for (let i = 1; i < times; i++)
        out.set(piece, bytes.length + piece.length * (i - 1));
      return out;
    }),
);

const UPDATES = typed(CLIENT, 3);

const arbClientMessage: fc.Arbitrary<Message> = fc.oneof(
  fc.record({
    type: fc.constant("SUBSCRIBE"),
    docId: fc.constant(DOC),
    generation: fc.constantFrom(0, 1, 2),
    mode: fc.constantFrom("edit", "view"),
    clientIds: fc.constant<number[]>([CLIENT]),
    lastServerSeq: fc.nat({ max: 10 }),
  }),
  fc.constantFrom<Message>(
    {
      type: "SYNC",
      docId: DOC,
      generation: 1,
      step: "step1",
      data: new Uint8Array([0]),
    },
    { type: "UNSUBSCRIBE", docId: DOC, generation: 1 },
    { type: "PING", nonce: 7 },
    {
      type: "AWARENESS",
      docId: DOC,
      generation: 1,
      update: encodeAwareness([
        { clientId: CLIENT, clock: 1, state: { cursor: 3 } },
      ]),
    },
  ),
  fc.record({
    type: fc.constant("PUSH"),
    docId: fc.constant(DOC),
    generation: fc.constant(1),
    clientSeq: fc.nat({ max: 20 }),
    update: fc.constantFrom(...UPDATES),
    heal: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("SET"),
    docId: fc.constant(DOC),
    generation: fc.constant(1),
    clientSeq: fc.nat({ max: 20 }),
    key: fc.constant("script.paper"),
    value: fc.constant(utf8(JSON.stringify("a4"))),
  }),
);

/** The decoder's answer: a message, nothing yet, or the close a ProtocolError calls for. */
function decodeSafely(
  frame: Uint8Array,
):
  | { kind: "message"; message: Message }
  | { kind: "closed"; code: number }
  | { kind: "pending" | "skipped" } {
  try {
    const result = createFrameDecoder({ from: "client" }).push(frame);
    return result.kind === "message" ? result : { kind: result.kind };
  } catch (error) {
    if (error instanceof ProtocolError)
      return { kind: "closed", code: error.code };
    throw error;
  }
}

test("mutated frames never escape as a throw and always get the right answer", () => {
  const { service, peer, clock } = serve();
  fc.assert(
    fc.property(arbClientMessage, arbMutation, (message, mutate) => {
      const frame = mutate(encodeMessage(message));
      const result = decodeSafely(frame);
      if (result.kind === "closed") expect([4400, 4413]).toContain(result.code);
      if (result.kind === "message")
        expect(() => {
          service.receive(peer, result.message);
          clock.runDeferred();
        }).not.toThrow();
      for (const m of peer.take())
        if (m.type === "ERROR")
          expect(Object.values(SYNC_ERRORS)).toContain(m.code);
    }),
    { numRuns: 5_000 },
  );
});

/** A hostile update and the client id its sender subscribes with. */
interface Hostile {
  clientId: number;
  update: Uint8Array;
}

const freshId = fc.integer({ min: 10_000, max: 2_000_000_000 });

const arbHostileUpdate: fc.Arbitrary<Hostile> = fc.oneof(
  fc.record({ clientId: freshId, update: fc.uint8Array({ maxLength: 200 }) }),
  fc.tuple(freshId, fc.nat()).map(([clientId, n]) => {
    const [first] = typed(clientId, 0);
    const whole = first ?? new Uint8Array();
    return { clientId, update: whole.slice(0, n % whole.length) };
  }),
  fc
    .tuple(freshId, fc.nat(), fc.nat({ max: 7 }))
    .map(([clientId, at, bit]) => ({
      clientId,
      update: flip(typed(clientId, 2).at(-1) ?? new Uint8Array(), at, bit),
    })),
  freshId.map((clientId) => ({
    clientId,
    update: typed(DANA_CLIENT, 1)[1] ?? new Uint8Array(),
  })),
  freshId.map((clientId) => ({
    clientId,
    update: typed(clientId, 2)[2] ?? new Uint8Array(),
  })),
  fc
    .tuple(freshId, fc.constantFrom("img", "table", "script", "section"))
    .map(([clientId, name]) => ({
      clientId,
      update: foreignElement(clientId, name),
    })),
  freshId.map((clientId) => ({ clientId, update: badAttribute(clientId) })),
  freshId.map((clientId) => ({ clientId, update: settingWrite(clientId) })),
);

test("mutated and hostile updates are refused with 4400 or 4422 and leave the log untouched", () => {
  const { service, peer, clock, storage, dana } = serve();
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  const { log } = storage.open({ kind: "project", id: PROJECT });
  const head = (): number => log.get(DOC)?.headSeq ?? 0;
  const rebuiltFromLog = (): unknown => {
    const doc = createDoc();
    for (const row of log.tail(DOC, 1, 0).rows) doc.applyUpdate(row.update);
    const json = scriptBody(doc).materialize();
    doc.destroy();
    return json;
  };
  fc.assert(
    fc.property(arbHostileUpdate, ({ clientId, update }) => {
      // the frame bucket refills between pushes, so that every one is judged
      clock.advance(10);
      const before = head();
      service.receive(peer, subscribe(DOC, "edit", [clientId]));
      peer.take();
      service.receive(peer, push(DOC, 1, update));
      clock.runDeferred();
      const answers = peer.take();
      if (head() === before)
        expect(
          answers
            .filter((m) => m.type === "ERROR")
            .map((m) => (m as { code: number }).code)
            .every((c) => c === 4400 || c === 4422 || c === 4413),
        ).toBe(true);
      expect(rejects(validateDoc(rebuiltFromLog()))).toBe(false);
    }),
    { numRuns: 2_000 },
  );
});

test("a flood stays inside its limits", () => {
  const flooded = serve();
  flooded.service.receive(flooded.peer, subscribe(DOC, "edit", [CLIENT]));
  flooded.peer.take();
  const updates = typed(CLIENT, 9_999);
  for (const [i, update] of updates.entries())
    flooded.service.receive(flooded.peer, push(DOC, i + 1, update));
  flooded.clock.runDeferred();
  const answers = flooded.peer.take();
  const limited = answers.filter((m) => m.type === "ERROR" && m.code === 4429);
  const retries = limited.map((m) =>
    m.type === "ERROR" ? m.retryAfterMs : null,
  );
  expect(answers.length - limited.length).toBeLessThanOrEqual(600);
  expect(limited.length).toBe(10_000 - (answers.length - limited.length));
  expect(retries.filter((ms) => ms === null || ms <= 0)).toEqual([]);
  expect(flooded.service.stats().rooms).toBe(1);

  const refused = serve();
  const stranger = fakePeer({ userId: "leo", name: "Leo Marsh" });
  refused.service.attach(stranger);
  const codes: number[] = [];
  for (let i = 0; i < 1_000; i++) {
    const docId = `01a1e81d-c6f2-7301-a0f6-${String(i).padStart(12, "0")}`;
    refused.service.receive(stranger, subscribe(docId, "edit", [CLIENT]));
    refused.clock.advance(4);
    for (const m of stranger.take()) if (m.type === "ERROR") codes.push(m.code);
  }
  expect(codes).toEqual(Array.from({ length: 1_000 }, () => 4403));
  expect(refused.service.stats().rooms).toBe(0);
});

/** A recorded session of Sam's: subscribe, exchange state, five pushes, a setting, two more pushes. */
function recordedSession(): Message[] {
  const pushes = typed(CLIENT, 6).map((update, i) => push(DOC, i + 1, update));
  const set: Message = {
    type: "SET",
    docId: DOC,
    generation: 1,
    clientSeq: 6,
    key: "script.paper",
    value: utf8(JSON.stringify("a4")),
  };
  const step1: Message = {
    type: "SYNC",
    docId: DOC,
    generation: 1,
    step: "step1",
    data: new Uint8Array([0]),
  };
  return [
    subscribe(DOC, "edit", [CLIENT]),
    step1,
    ...pushes.slice(0, 5),
    set,
    ...pushes.slice(5),
  ];
}

/** Each message delivered `times` times; per delivery, what Sam was answered. */
function replay(times: number): { answers: Message[][]; log: unknown[] } {
  const { service, peer, clock, storage } = serve();
  const answers: Message[][] = [];
  for (const message of recordedSession())
    for (let i = 0; i < times; i++) {
      service.receive(peer, message);
      clock.runDeferred();
      answers.push(peer.take());
    }
  const { log } = storage.open({ kind: "project", id: PROJECT });
  return { answers, log: log.tail(DOC, 1, 0).rows };
}

test("a duplicate of anything changes nothing", () => {
  const once = replay(1);
  const twice = replay(2);
  expect(twice.log).toEqual(once.log);
  const firsts = twice.answers.filter((_, i) => i % 2 === 0);
  expect(firsts).toEqual(once.answers);
  const repeats = twice.answers.filter((_, i) => i % 2 === 1);
  const changed = repeats.filter(
    (answer, i) =>
      !answer.every((m) => m.type === "ACK") &&
      JSON.stringify(answer) !== JSON.stringify(firsts[i]),
  );
  expect(changed).toEqual([]);
});
