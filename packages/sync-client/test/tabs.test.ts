import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  TAB_PROTOCOL_VERSION,
  readTabMessage,
  soloLeader,
  tabMessage,
} from "../src/index.ts";
import type {
  DocMeta,
  DocStatus,
  RecoveredItem,
  TabBody,
} from "../src/index.ts";
import { memoryTabs } from "../src/testing/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

const settle = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const META: DocMeta = {
  docId: DOC,
  generation: 2,
  lastServerSeq: 41,
  clientIds: [7, 9],
  ackedClocks: { "7": 12 },
  neverSynced: false,
  create: { kind: "script", home: "user" },
  parked: { reason: "deleted", parkedAt: 1_000 },
  recovering: { versionId: "v1", heal: true },
  lastDeviceVersionAt: 900,
  lastSyncedAt: null,
};
const STATUS: DocStatus = {
  saved: true,
  synced: false,
  waiting: 3,
  link: "connecting",
  docSync: "local",
  wentOfflineAt: 500,
  neverSynced: true,
  recovered: 1,
  side: ["not_saved", "read_only"],
};
const ITEM: RecoveredItem = {
  id: "r1",
  docId: DOC,
  blockId: null,
  nearBlockId: "b2",
  text: "The kettle boils over.",
  recoveredAt: 700,
  cause: "merge",
};
const SAMPLES: Record<TabBody["t"], TabBody> = {
  who: { t: "who" },
  leader: { t: "leader" },
  open: {
    t: "open",
    docId: DOC,
    clientId: 7,
    create: { kind: "script", home: "user" },
  },
  close: { t: "close", docId: DOC },
  state: {
    t: "state",
    to: "t2",
    docId: DOC,
    state: new Uint8Array([1, 2]),
    meta: META,
  },
  edit: {
    t: "edit",
    docId: DOC,
    n: 3,
    update: new Uint8Array([3]),
    elements: ["b1", "b2"],
  },
  saved: { t: "saved", to: "t2", docId: DOC, n: 3, refused: false },
  remote: { t: "remote", docId: DOC, update: new Uint8Array([4]) },
  status: { t: "status", docId: DOC, status: STATUS },
  event: { t: "event", docId: DOC, event: { type: "replaced" } },
  recovered: { t: "recovered", docId: DOC, items: [ITEM] },
  replace: { t: "replace", docId: DOC, state: new Uint8Array([5]) },
  aw: { t: "aw", docId: DOC, update: new Uint8Array([6]) },
};

test("the channel's messages are pinned at version 1", () => {
  expect(TAB_PROTOCOL_VERSION).toBe(1);
  expect(
    tabMessage("t1", {
      t: "edit",
      docId: DOC,
      n: 3,
      update: new Uint8Array([1]),
      elements: ["b1"],
    }),
  ).toEqual({
    v: 1,
    from: "t1",
    t: "edit",
    docId: DOC,
    n: 3,
    update: new Uint8Array([1]),
    elements: ["b1"],
  });
  expect(Object.keys(SAMPLES).toSorted()).toEqual([
    "aw",
    "close",
    "edit",
    "event",
    "leader",
    "open",
    "recovered",
    "remote",
    "replace",
    "saved",
    "state",
    "status",
    "who",
  ]);
  for (const sample of Object.values(SAMPLES))
    expect(readTabMessage(structuredClone(tabMessage("t1", sample)))).toEqual(
      tabMessage("t1", sample),
    );
});

test("a message from another version, of an unknown kind or of the wrong shape is ignored", () => {
  for (const bad of [
    null,
    7,
    "who",
    {},
    { v: 2, from: "t1", t: "who" },
    { v: 1, from: "t1", t: "dance" },
    { v: 1, t: "who" },
    {
      v: 1,
      from: "t1",
      t: "edit",
      docId: DOC,
      n: "3",
      update: new Uint8Array(),
      elements: [],
    },
    { v: 1, from: "t1", t: "saved", to: "t2", docId: DOC, n: 1 },
  ])
    expect(readTabMessage(bad)).toBeNull();
  expect(readTabMessage({ v: 1, from: "t1", t: "who", extra: true })).toEqual({
    v: 1,
    from: "t1",
    t: "who",
  });
});

test("bytes, a map or a date where an object belongs is of the wrong shape", () => {
  for (const notObject of [
    new Uint8Array([1]),
    new Map([["7", 1]]),
    new Date(0),
  ])
    expect(
      readTabMessage({
        ...tabMessage("t1", SAMPLES.state),
        meta: { ...META, ackedClocks: notObject },
      }),
    ).toBeNull();
});

test("a link, sync state, side state, reason or cause this build does not know is of the wrong shape", () => {
  for (const unknown of [
    {
      ...tabMessage("t1", SAMPLES.status),
      status: { ...STATUS, link: "asleep" },
    },
    {
      ...tabMessage("t1", SAMPLES.status),
      status: { ...STATUS, docSync: "asleep" },
    },
    {
      ...tabMessage("t1", SAMPLES.status),
      status: { ...STATUS, side: ["asleep"] },
    },
    {
      ...tabMessage("t1", SAMPLES.state),
      meta: { ...META, parked: { reason: "asleep", parkedAt: 1 } },
    },
    {
      ...tabMessage("t1", SAMPLES.recovered),
      items: [{ ...ITEM, cause: "asleep" }],
    },
  ])
    expect(readTabMessage(unknown)).toBeNull();
});

/** The items, then one hole: a sparse list, which a copy keeps sparse. */
function withHole<T>(items: readonly T[]): T[] {
  const holed = [...items];
  holed.length += 1;
  return holed;
}

test("a list with a hole in it is of the wrong shape", () => {
  for (const holed of [
    { ...tabMessage("t1", SAMPLES.edit), elements: withHole(["b1"]) },
    {
      ...tabMessage("t1", SAMPLES.status),
      status: { ...STATUS, side: withHole(STATUS.side) },
    },
    { ...tabMessage("t1", SAMPLES.recovered), items: withHole([ITEM]) },
    {
      ...tabMessage("t1", SAMPLES.state),
      meta: { ...META, clientIds: withHole(META.clientIds) },
    },
  ])
    expect(readTabMessage(structuredClone(holed))).toBeNull();
});

test("one tab leads at a time, and the next takes over when it goes", async () => {
  const tabs = memoryTabs();
  const elected: string[] = [];
  const lead = (id: string) => ({
    onElected: () => {
      elected.push(id);
    },
    onDeposed: () => {
      elected.push(`-${id}`);
    },
  });
  for (const id of ["a", "b", "c"]) tabs.port(id).campaign(lead(id));
  expect(elected).toEqual([]);
  await settle();
  expect(elected).toEqual(["a"]);
  expect(tabs.leader()).toBe("a");
  tabs.closeTab("a");
  await settle();
  expect(elected).toEqual(["a", "b"]);
  const resign = tabs.port("d").campaign(lead("d"));
  resign();
  tabs.closeTab("b");
  await settle();
  expect(elected).toEqual(["a", "b", "c"]);
  tabs.port("e").campaign(lead("e"));
  tabs.depose();
  await settle();
  expect(elected).toEqual(["a", "b", "c", "-c", "e"]);
});

test("a leader that gives the lead up hands it to the next tab", async () => {
  const tabs = memoryTabs();
  const none = { onElected: () => {}, onDeposed: () => {} };
  const resign = tabs.port("a").campaign(none);
  tabs.port("b").campaign(none);
  await settle();
  resign();
  await settle();
  expect(tabs.leader()).toBe("b");
});

test("a message reaches every other tab of the user, as a copy, and never its sender", async () => {
  const tabs = memoryTabs();
  const got: Record<string, unknown[]> = { a: [], b: [], c: [] };
  for (const id of ["a", "b", "c"])
    tabs.port(id).listen((m) => got[id]!.push(m));
  const bytes = new Uint8Array([1]);
  tabs
    .port("a")
    .post(tabMessage("a", { t: "remote", docId: DOC, update: bytes }));
  bytes[0] = 9;
  await settle();
  expect(got.a).toEqual([]);
  expect(got.b).toEqual(got.c);
  expect((got.b![0] as { update: Uint8Array }).update).toEqual(
    new Uint8Array([1]),
  );
  tabs.closeTab("c");
  tabs.port("a").post(tabMessage("a", { t: "who" }));
  await settle();
  expect(got.c).toHaveLength(1);
});

test("a dying tab hears nothing more, though it still leads", async () => {
  const tabs = memoryTabs();
  const got: unknown[] = [];
  tabs.port("a").campaign({ onElected: () => {}, onDeposed: () => {} });
  tabs.port("a").listen((m) => got.push(m));
  tabs.dropMessagesTo("a");
  tabs.port("b").post(tabMessage("b", { t: "who" }));
  await settle();
  expect([got, tabs.leader()]).toEqual([[], "a"]);
});

test("every message any tab posts is on record, in the order posted", () => {
  const tabs = memoryTabs();
  tabs.port("a").post(tabMessage("a", { t: "who" }));
  tabs.port("b").post({ v: 1, from: "b", t: "leader", extra: true });
  tabs.port("b").post("not a message");
  expect(tabs.posted()).toEqual([
    { v: 1, from: "a", t: "who" },
    { v: 1, from: "b", t: "leader" },
  ]);
});

test("a solo leader is elected and talks to nobody", async () => {
  const solo = soloLeader("only");
  let elected = 0;
  solo.campaign({
    onElected: () => {
      elected++;
    },
    onDeposed: () => {},
  });
  expect(elected).toBe(0);
  await settle();
  expect(elected).toBe(1);
  solo.post(tabMessage("only", { t: "who" }));
  expect(solo.tabId).toBe("only");
});

test("a solo client that withdraws before its turn never leads", async () => {
  let elected = 0;
  const withdraw = soloLeader("only").campaign({
    onElected: () => {
      elected++;
    },
    onDeposed: () => {},
  });
  withdraw();
  await settle();
  expect(elected).toBe(0);
});

const text = fc.string({ maxLength: 8 });
const int = fc.integer();
const nullable = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });
const bytes = fc.uint8Array({ maxLength: 8 });
const create = nullable(fc.record({ kind: text, home: text }));
const meta: fc.Arbitrary<DocMeta> = fc.record({
  docId: text,
  generation: int,
  lastServerSeq: int,
  clientIds: fc.array(int, { maxLength: 4 }),
  ackedClocks: fc.dictionary(text, int, { maxKeys: 3, noNullPrototype: true }),
  neverSynced: fc.boolean(),
  create,
  parked: nullable(
    fc.record({
      reason: fc.constantFrom("access_removed", "deleted"),
      parkedAt: int,
    }),
  ),
  recovering: nullable(fc.record({ versionId: text, heal: fc.boolean() })),
  lastDeviceVersionAt: int,
  lastSyncedAt: nullable(int),
});
const status: fc.Arbitrary<DocStatus> = fc.record({
  saved: fc.boolean(),
  synced: fc.boolean(),
  waiting: int,
  link: fc.constantFrom("offline", "connecting", "authenticating", "online"),
  docSync: fc.constantFrom("local", "syncing", "synced"),
  wentOfflineAt: nullable(int),
  neverSynced: fc.boolean(),
  recovered: int,
  side: fc.array(
    fc.constantFrom(
      "access_removed",
      "deleted",
      "read_only",
      "rejected",
      "not_saved",
      "sign_in",
      "server_old",
    ),
    { maxLength: 3 },
  ),
});
const item: fc.Arbitrary<RecoveredItem> = fc.record({
  id: text,
  docId: text,
  blockId: nullable(text),
  nearBlockId: nullable(text),
  text,
  recoveredAt: int,
  cause: fc.constantFrom("merge", "rejected"),
});
const body: fc.Arbitrary<TabBody> = fc.oneof(
  fc.constant({ t: "who" as const }),
  fc.constant({ t: "leader" as const }),
  fc.record({
    t: fc.constant("open" as const),
    docId: text,
    clientId: int,
    create,
  }),
  fc.record({ t: fc.constant("close" as const), docId: text }),
  fc.record({
    t: fc.constant("state" as const),
    to: text,
    docId: text,
    state: bytes,
    meta,
  }),
  fc.record({
    t: fc.constant("edit" as const),
    docId: text,
    n: int,
    update: bytes,
    elements: fc.array(text, { maxLength: 3 }),
  }),
  fc.record({
    t: fc.constant("saved" as const),
    to: text,
    docId: text,
    n: int,
    refused: fc.boolean(),
  }),
  fc.record({ t: fc.constant("remote" as const), docId: text, update: bytes }),
  fc.record({ t: fc.constant("status" as const), docId: text, status }),
  fc.record({
    t: fc.constant("event" as const),
    docId: text,
    event: fc.jsonValue(),
  }),
  fc.record({
    t: fc.constant("recovered" as const),
    docId: text,
    items: fc.array(item, { maxLength: 2 }),
  }),
  fc.record({ t: fc.constant("replace" as const), docId: text, state: bytes }),
  fc.record({ t: fc.constant("aw" as const), docId: text, update: bytes }),
);

test("a message another tab posted reads back unchanged, whatever its fields hold", () => {
  fc.assert(
    fc.property(text, body, (from, posted) => {
      expect(readTabMessage(structuredClone(tabMessage(from, posted)))).toEqual(
        tabMessage(from, posted),
      );
    }),
    { numRuns: 500 },
  );
});

/** Every place inside a message that holds a value, nested objects and lists included, bytes excluded. */
function slots(value: unknown, path: readonly string[] = []): string[][] {
  if (
    value instanceof Uint8Array ||
    typeof value !== "object" ||
    value === null
  )
    return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    [...path, key],
    ...slots(inner, [...path, key]),
  ]);
}

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return value instanceof Uint8Array ? "bytes" : typeof value;
}

const anyValue = fc.anything({
  withBigInt: true,
  withDate: true,
  withMap: true,
  withNullPrototype: true,
  withSet: true,
  withSparseArray: true,
  withTypedArray: true,
});

/** A valid message with the value at one place replaced; `wrongKind` when the new value cannot be of that place's type. */
const nearMessage = fc
  .tuple(text, body, fc.nat(), anyValue)
  .map(([from, posted, pick, value]) => {
    const message: unknown = structuredClone(tabMessage(from, posted));
    const path = slots(message)[pick % slots(message).length]!;
    let parent = message as Record<string, unknown>;
    for (const key of path.slice(0, -1))
      parent = parent[key] as Record<string, unknown>;
    const was = parent[path.at(-1)!];
    parent[path.at(-1)!] = value;
    const wrongKind =
      path[0] !== "event" &&
      was !== null &&
      value !== null &&
      kindOf(was) !== kindOf(value);
    return { message, path, wrongKind };
  });

test("anything posted on the channel reads as one known message or as nothing", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        anyValue,
        nearMessage.map(({ message }) => message),
      ),
      (posted) => {
        const read = readTabMessage(posted);
        if (read !== null) expect(readTabMessage(read)).toEqual(read);
      },
    ),
    { numRuns: 2000 },
  );
});

test("a message with one field of the wrong type reads as nothing", () => {
  fc.assert(
    fc.property(
      nearMessage.filter(({ wrongKind }) => wrongKind),
      ({ message }) => {
        expect(readTabMessage(message)).toBeNull();
      },
    ),
    { numRuns: 2000 },
  );
});
