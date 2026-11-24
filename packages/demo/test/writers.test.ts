import { expect, test } from "bun:test";
import {
  blockIds,
  decodeAwareness,
  scriptBody,
  scriptDocFromJSON,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blocksOf, parseFrom } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { Random } from "@manent/sync-client";
import { createFakeClock } from "@manent/sync-client/testing";
import type { FakeClock } from "@manent/sync-client/testing";
import { createRng, createSimulatedPerson, PROFILES } from "../src/index.ts";
import type {
  ProfileId,
  SimulatedPerson,
  SimulatedPersonEvent,
  WriterLine,
  WritingProfile,
} from "../src/index.ts";

const PROFILE_TABLE: Record<ProfileId, WritingProfile> = {
  demo: {
    id: "demo",
    keysPerSecond: 4,
    burstChars: [8, 40],
    pauseMs: [1_000, 4_000],
    sceneMovesPerHour: 0,
    pastesPerHour: 0,
    pastePages: [0, 0],
    offlinePerHour: 0,
    offlineMs: [0, 0],
    presence: true,
  },
  realistic: {
    id: "realistic",
    keysPerSecond: 4,
    burstChars: [8, 40],
    pauseMs: [2_000, 10_000],
    sceneMovesPerHour: 20,
    pastesPerHour: 0,
    pastePages: [0, 0],
    offlinePerHour: 1,
    offlineMs: [60_000, 1_200_000],
    presence: true,
  },
  rewrite_typist: {
    id: "rewrite_typist",
    keysPerSecond: 6,
    burstChars: [40, 200],
    pauseMs: [500, 2_000],
    sceneMovesPerHour: 6,
    pastesPerHour: 2,
    pastePages: [1, 3],
    offlinePerHour: 0,
    offlineMs: [0, 0],
    presence: true,
  },
  extreme: {
    id: "extreme",
    keysPerSecond: 40,
    burstChars: [40, 200],
    pauseMs: [200, 1_000],
    sceneMovesPerHour: 600,
    pastesPerHour: 60,
    pastePages: [10, 50],
    offlinePerHour: 10,
    offlineMs: [60_000, 28_800_000],
    presence: true,
  },
};

const CLIENT_ID = 4_242;
const REGION = { firstBlockId: "block-11", lastBlockId: "block-20" };

const idOf = (n: number): string => `block-${String(n).padStart(2, "0")}`;

const block = (n: number): BlockJSON => ({
  type: "block",
  attrs: { id: idOf(n), type: "action" },
  content: [{ type: "text", text: `The lamp on the pier is lit, beat ${n}.` }],
});

// three sections of ten blocks: block-01 to block-30
const SCRIPT: DocJSON = {
  type: "doc",
  content: [0, 1, 2].map((section) => ({
    type: "section",
    content: Array.from({ length: 10 }, (_, i) => block(section * 10 + i + 1)),
  })),
};

function seededRandom(seed: number): Random {
  const rng = createRng(seed);
  return {
    next: rng.next,
    clientId: () => rng.int(1, 4_294_967_295),
    bytes: (length) => Uint8Array.from({ length }, () => rng.int(0, 255)),
  };
}

interface World {
  doc: CrdtDoc;
  sent: Uint8Array[];
  switches: boolean[];
  fake: FakeClock;
  person: SimulatedPerson;
}

function world(
  profile: WritingProfile,
  options: {
    seed?: number;
    region?: { firstBlockId: string; lastBlockId: string };
    markers?: boolean;
    lines?: readonly WriterLine[];
  } = {},
): World {
  const doc = scriptDocFromJSON(SCRIPT, { clientId: CLIENT_ID });
  const sent: Uint8Array[] = [];
  const switches: boolean[] = [];
  const fake = createFakeClock();
  const person = createSimulatedPerson({
    handle: { doc: () => doc, sendAwareness: (u) => sent.push(u) },
    client: { setOnline: (w) => switches.push(w) },
    profile,
    clock: fake.clock,
    random: seededRandom(options.seed ?? 11),
    region: options.region ?? null,
    markers: options.markers ?? false,
    ...(options.lines === undefined ? {} : { lines: options.lines }),
  });
  return { doc, sent, switches, fake, person };
}

const typedIn = (person: SimulatedPerson): SimulatedPersonEvent[] =>
  person.events.filter((event) => event.type === "typed");

const textOf = (doc: CrdtDoc, blockId: string | null): string | null => {
  const found = blocksOf(scriptBody(doc).materialize()).find(
    (flat) => flat.attrs.id === blockId,
  );
  return found === undefined
    ? null
    : found.runs.map((run) => run.text).join("");
};

const allText = (doc: CrdtDoc): string =>
  blocksOf(scriptBody(doc).materialize())
    .map((flat) => flat.runs.map((run) => run.text).join(""))
    .join("\n");

/** Advances in steps of `stepMs` until `done` holds, at most `limitMs` in all. */
function advanceUntil(
  fake: FakeClock,
  done: () => boolean,
  stepMs: number,
  limitMs: number,
): void {
  for (let spent = 0; !done() && spent < limitMs; spent += stepMs)
    fake.advance(stepMs);
}

/** Thirty seconds of an extreme writer with markers. */
function extremeRun(seed: number): {
  events: SimulatedPersonEvent[];
  doc: DocJSON;
} {
  const w = world(PROFILES.extreme, { seed, markers: true });
  w.person.start();
  w.fake.advance(30_000);
  return { events: [...w.person.events], doc: scriptBody(w.doc).materialize() };
}

test("the profiles are these", () => {
  expect(PROFILES).toEqual(PROFILE_TABLE);
});

test("a person given lines types only those lines, each block in its own element", () => {
  const lines: WriterLine[] = [
    [{ element: "action", text: "The tide is out." }],
    [
      { element: "character", text: "ESME" },
      { element: "dialogue", text: "Mind the rope." },
    ],
  ];
  const w = world(PROFILES.demo, { lines });
  w.person.start();
  w.fake.advance(60_000);
  // a keystroke falls due every 250 ms during a burst, so this ends in a pause
  advanceUntil(
    w.fake,
    () => typedIn(w.person).at(-1)!.at + 250 <= w.fake.clock.now(),
    250,
    60_000,
  );
  const typed = new Set(typedIn(w.person).map((event) => event.blockId));
  const blocks = blocksOf(scriptBody(w.doc).materialize())
    .filter((flat) => typed.has(flat.attrs.id))
    .map((flat) => ({
      element: flat.attrs.type,
      text: flat.runs.map((run) => run.text).join(""),
    }));
  const sequence = lines.flat();
  expect(blocks.length).toBeGreaterThan(3);
  expect(blocks).toEqual(blocks.map((_, i) => sequence[i % sequence.length]!));
});

test("a realistic writer types at four keystrokes a second in bursts, in their own scenes", () => {
  // several seeds, so that a writer who ignored the region could not stay inside it by chance
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = world(PROFILES.realistic, { seed, region: REGION });
    w.person.start();
    w.fake.advance(60_000);
    const typed = typedIn(w.person);
    expect(typed.length).toBeGreaterThanOrEqual(8);
    expect(typed.length).toBeLessThanOrEqual(240);
    const order = blockIds(w.doc);
    const region = order.slice(
      order.indexOf(REGION.firstBlockId),
      order.indexOf(REGION.lastBlockId) + 1,
    );
    expect(typed.filter((event) => !region.includes(event.blockId!))).toEqual(
      [],
    );
    const gaps = typed.slice(1).map((event, i) => event.at - typed[i]!.at);
    expect(Math.min(...gaps)).toBe(250);
    expect(Math.max(...gaps)).toBeGreaterThan(2_000);
  }
});

test("a person is deterministic for a seed", () => {
  const first = extremeRun(5);
  expect(new Set(first.events.map((event) => event.type)).has("moved")).toBe(
    true,
  );
  expect(extremeRun(5)).toEqual(first);
});

test("a scene move keeps the blocks' ids and marks where they came from", () => {
  const w = world({ ...PROFILES.rewrite_typist, sceneMovesPerHour: 3_600 });
  const before = blockIds(w.doc);
  w.person.start();
  advanceUntil(
    w.fake,
    () => w.person.events.some((event) => event.type === "moved"),
    10,
    60_000,
  );
  const moved = blocksOf(scriptBody(w.doc).materialize()).filter(
    (flat) => flat.attrs.from !== null,
  );
  const ids = moved.map((flat) => flat.attrs.id!);
  const nonce = parseFrom(moved[0]!.attrs.from)!.nonce;
  expect(moved.map((flat) => parseFrom(flat.attrs.from))).toEqual(
    ids.map((id) => ({ originId: id, nonce })),
  );
  const start = before.indexOf(ids[0]!);
  expect(ids).toEqual(before.slice(start, start + ids.length));
  expect(ids.length).toBeGreaterThanOrEqual(5);
  expect(ids.length).toBeLessThanOrEqual(25);
  expect(blockIds(w.doc).indexOf(ids[0]!)).not.toBe(start);
  expect(before.filter((id) => !blockIds(w.doc).includes(id))).toEqual([]);
  expect(
    w.person.events
      .filter((event) => event.type === "moved")
      .map((event) => [event.blockId, event.marker]),
  ).toEqual([[ids[0]!, null]]);
});

test("going offline and coming back is the client's own switch", () => {
  const w = world({
    ...PROFILES.extreme,
    sceneMovesPerHour: 0,
    pastesPerHour: 0,
    offlinePerHour: 3_600,
    offlineMs: [60_000, 60_000],
  });
  w.person.start();
  advanceUntil(
    w.fake,
    () => w.person.events.some((event) => event.type === "online"),
    25,
    600_000,
  );
  const switched = w.person.events.filter(
    (event) => event.type === "offline" || event.type === "online",
  );
  const offlineAt = switched[0]!.at;
  expect(w.switches.slice(0, 2)).toEqual([false, true]);
  expect(switched.slice(0, 2)).toEqual([
    { type: "offline", at: offlineAt, blockId: null, marker: null },
    { type: "online", at: offlineAt + 60_000, blockId: null, marker: null },
  ]);
});

test("a person who stops while offline comes back online", async () => {
  const w = world({
    ...PROFILES.extreme,
    sceneMovesPerHour: 0,
    pastesPerHour: 0,
    offlinePerHour: 3_600,
    offlineMs: [60_000, 60_000],
  });
  w.person.start();
  advanceUntil(w.fake, () => w.switches.length > 0, 25, 600_000);
  await w.person.stop();
  expect(w.switches).toEqual([false, true]);
  expect(w.person.events.at(-1)).toEqual({
    type: "online",
    at: w.fake.clock.now(),
    blockId: null,
    marker: null,
  });
});

test("markers tell each burst apart", () => {
  const w = world(PROFILES.realistic, { markers: true });
  w.person.start();
  w.fake.advance(120_000);
  const markers = w.person.events.flatMap((event) =>
    event.type === "typed" && event.marker !== null ? [event.marker] : [],
  );
  const text = allText(w.doc);
  expect(markers[0]).toBe("⟦4242:1⟧");
  expect(markers.length).toBeGreaterThan(2);
  expect(markers.map((marker) => text.split(marker).length - 1)).toEqual(
    markers.map(() => 1),
  );
});

/** The head of the caret an awareness update sends; null when it sends none. */
const headOf = (update: Uint8Array): unknown => {
  const state = decodeAwareness(update)[0]?.state ?? null;
  const cursor: unknown = state === null ? null : state["cursor"];
  return cursor === null ? null : Reflect.get(Object(cursor), "head");
};

test("presence shows the caret from the moment the person starts, with the block's place as its hint", () => {
  const w = world(PROFILES.realistic, { region: REGION });
  w.person.start();
  const blockId = String(Reflect.get(Object(headOf(w.sent[0]!)), "blockId"));
  const caret = { blockId, offset: textOf(w.doc, blockId)!.length };
  advanceUntil(w.fake, () => typedIn(w.person).length > 0, 50, 10_000);
  expect([decodeAwareness(w.sent[0]!), typedIn(w.person)[0]?.blockId]).toEqual([
    [
      {
        clientId: CLIENT_ID,
        clock: 1,
        state: {
          cursor: {
            anchor: caret,
            head: caret,
            at: blockIds(w.doc).indexOf(blockId),
          },
        },
      },
    ],
    blockId,
  ]);
});

test("presence follows the caret while the person types", () => {
  const w = world(PROFILES.realistic, { region: REGION });
  const misplaced: number[] = [];
  w.person.start();
  for (let step = 0; step < 2_400; step++) {
    w.fake.advance(50);
    const now = w.fake.clock.now();
    const last = typedIn(w.person).at(-1);
    // 200 ms after a key, and before the next, the caret sent is where that key left it
    if (last?.blockId == null || now - last.at < 200 || now - last.at >= 250)
      continue;
    const end = {
      blockId: last.blockId,
      offset: textOf(w.doc, last.blockId)!.length,
    };
    if (JSON.stringify(headOf(w.sent.at(-1)!)) !== JSON.stringify(end))
      misplaced.push(now);
  }
  expect({
    misplaced,
    checked: typedIn(w.person).length > 100,
  }).toEqual({ misplaced: [], checked: true });
});

test("a person who pauses sends their caret again every 15 seconds, so that the server keeps them", () => {
  const w = world(
    { ...PROFILES.demo, pauseMs: [40_000, 40_000] },
    { region: REGION },
  );
  const sentAt: number[] = [];
  w.person.start();
  for (let step = 0; step < 2_400; step++) {
    w.fake.advance(50);
    while (sentAt.length < w.sent.length) sentAt.push(w.fake.clock.now());
  }
  const gaps = sentAt.slice(1).map((at, i) => at - sentAt[i]!);
  expect(Math.max(...gaps)).toBe(15_000);
});

test("a person who stops sends no more and leaves presence", async () => {
  const w = world(PROFILES.realistic, { region: REGION });
  w.person.start();
  w.fake.advance(30_000);
  await w.person.stop();
  let writes = 0;
  w.doc.subscribe(() => {
    writes += 1;
  });
  const events = w.person.events.length;
  w.fake.advance(600_000);
  expect({ writes, events: w.person.events.length }).toEqual({
    writes: 0,
    events,
  });
  expect(w.fake.pending()).toBe(0);
  expect(decodeAwareness(w.sent.at(-1)!)).toEqual([
    { clientId: CLIENT_ID, clock: w.sent.length, state: null },
  ]);
});
