import { expect, test } from "bun:test";
import { isRequestKey } from "@manent/sync-protocol";
import type {
  ControlKind,
  IssueRequest,
  IssueView,
  LockAnchorRecord,
  ProductionRefusalBody,
  ProductionState,
  RevisionSetView,
  VersionContent,
} from "@manent/sync-protocol";
import { ConnectError, createProductionClient } from "../src/index.ts";
import type {
  CachedProduction,
  DocHandle,
  ProductionCache,
  ProductionClient,
  ProductionTransport,
} from "../src/index.ts";
import { createMemoryProductionCache } from "../src/testing/index.ts";
import { B1, B2, DOC, setup, typeIn } from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

const WHITE_VERSION = "version-white";
const BLUE_VERSION = "version-blue";
const BLUE_ISSUE_AT = 10_000;

function revisionSet(
  setId: string,
  ordinal: number,
  name: string,
  baselineVersionId: string,
): RevisionSetView {
  return {
    setId,
    ordinal,
    name,
    colour: name.toLowerCase(),
    mark: "*",
    fullDraft: false,
    startedAt: 0,
    issuedAt: null,
    issuedOn: null,
    issuedByName: null,
    recalledAt: null,
    baselineVersionId,
    issuedVersionId: null,
    engineVersion: 1,
    blocks: [],
  };
}

const ANCHOR: LockAnchorRecord = {
  level: 1,
  order: 0,
  label: "1",
  blockId: B1,
  offset: 0,
  quote: "",
  fallbackIds: [],
  source: "lock",
};

/** Page numbers locked, Blue active over the White production draft. */
const BLUE_ACTIVE: ProductionState = {
  v: 1,
  docId: DOC,
  headSeq: 1,
  locked: true,
  lockLevel: 1,
  lockedOn: "2026-11-16",
  numbering: "suffix",
  colourOrder: ["white", "blue", "pink"],
  anchors: [ANCHOR],
  sceneNumbers: [],
  sets: [revisionSet("set-blue", 1, "Blue", WHITE_VERSION)],
  issues: [],
};

const BLUE_ISSUE: IssueView = {
  issueId: "issue-blue",
  setId: "set-blue",
  kind: "issue",
  versionId: BLUE_VERSION,
  issuedAt: BLUE_ISSUE_AT,
  issuedOn: "2026-11-16",
  issuedByName: "Priya",
  recipientUserIds: ["dana"],
  pages: ["1"],
  memo: "Blue revisions 16 Nov: p. 1",
  files: ["pdf_clean"],
  tint: false,
  what: "changed",
};

/** What the Send screen asks to issue Blue with. */
const ISSUE_BLUE: Omit<IssueRequest, "docId"> = {
  key: "0123456789abcdef0123456789abcdef",
  expectedOrdinal: 1,
  what: "changed",
  pages: ["1"],
  files: ["pdf_clean"],
  tint: false,
  recipientUserIds: ["dana"],
  memo: "Blue revisions 16 Nov: p. 1",
  issuedOn: "2026-11-16",
};

/** Priya issued Blue: Pink is active over Blue's issued version. */
const PINK_ACTIVE: ProductionState = {
  ...BLUE_ACTIVE,
  headSeq: 2,
  sets: [
    {
      ...revisionSet("set-blue", 1, "Blue", WHITE_VERSION),
      issuedAt: BLUE_ISSUE_AT,
      issuedOn: "2026-11-16",
      issuedByName: "Priya",
      issuedVersionId: BLUE_VERSION,
    },
    revisionSet("set-pink", 2, "Pink", BLUE_VERSION),
  ],
  issues: [BLUE_ISSUE],
};

function content(text: string): VersionContent {
  return {
    v: 1,
    blocks: [
      {
        type: "block",
        attrs: { id: B1, type: "action" },
        content: [{ type: "text", text }],
      },
    ],
    settings: {},
    schemaVersion: 1,
    engineVersion: 1,
    locks: [ANCHOR],
    authors: {},
  };
}

const CONTENTS: Readonly<Record<string, VersionContent>> = Object.freeze({
  [WHITE_VERSION]: content("White"),
  [BLUE_VERSION]: content("Blue"),
});

const contentPath = (versionId: string): string =>
  `/api/versions/content?docId=${DOC}&versionId=${versionId}`;

type Answer = { status: number; body: unknown };

interface FakeServer {
  transport: ProductionTransport;
  /** What the production routes answer from now on. */
  state: ProductionState;
  /** While false, every request rejects ConnectError, as a server out of reach. */
  reachable: boolean;
  posts: { path: string; body: Record<string, unknown> }[];
  gets: string[];
  /** Answers a POST to `path` from now on; the others answer the state. */
  on(
    path: string,
    answer: (body: Record<string, unknown>) => Promise<Answer>,
  ): void;
}

function fakeServer(state: ProductionState): FakeServer {
  const answers = new Map<
    string,
    (body: Record<string, unknown>) => Promise<Answer>
  >();
  const server: FakeServer = {
    state,
    reachable: true,
    posts: [],
    gets: [],
    on: (path, answer) => answers.set(path, answer),
    transport: {
      async post(path, body) {
        const fields =
          typeof body === "object" && body !== null
            ? Object.fromEntries(Object.entries(body))
            : {};
        server.posts.push({ path, body: fields });
        if (!server.reachable) throw new ConnectError("unreachable");
        const answer = answers.get(path);
        return answer ? answer(fields) : { status: 200, body: server.state };
      },
      async get(path) {
        server.gets.push(path);
        if (!server.reachable) throw new ConnectError("unreachable");
        const versionId = new URL(path, "http://manent.test").searchParams.get(
          "versionId",
        );
        const held = versionId === null ? undefined : CONTENTS[versionId];
        return held === undefined
          ? { status: 404, body: { error: "not_found" } }
          : { status: 200, body: { content: held, position: null } };
      },
    },
  };
  return server;
}

/** Distinct bytes on every call, so that every key made differs. */
function countingRandom(): { bytes(n: number): Uint8Array } {
  let next = 0;
  return {
    bytes: (n) => Uint8Array.from({ length: n }, () => (next += 1) % 256),
  };
}

interface Setting {
  w: World;
  h: DocHandle;
  server: FakeServer;
  cache: ProductionCache;
  client: ProductionClient;
}

/** Dana online on DOC, the production client created and settled. */
async function production(
  state: ProductionState,
  cache: ProductionCache = createMemoryProductionCache(),
): Promise<Setting> {
  const w = await setup();
  const h = await w.makeClient().open(DOC);
  await w.online();
  const server = fakeServer(state);
  const client = createProductionClient({
    docId: DOC,
    handle: h,
    transport: server.transport,
    cache,
    random: countingRandom(),
    clock: w.fake.clock,
  });
  await w.settle();
  return { w, h, server, cache, client };
}

const cached = (
  state: ProductionState,
  versionId: string,
): CachedProduction => ({
  state,
  baseline: { versionId, content: CONTENTS[versionId]! },
});

async function cut(w: World): Promise<void> {
  w.network.partition(true);
  await w.settle();
}

/** Back online, the server telling the subscriber the revision and anchors given. */
async function reconnect(
  w: World,
  told: { revision: string; anchors: LockAnchorRecord[] },
): Promise<void> {
  w.server.answer.subscribe = false;
  w.network.partition(false);
  w.fake.advance(30_000);
  await w.settle();
  w.server.send({
    type: "SUBSCRIBED",
    docId: DOC,
    generation: 1,
    role: "edit",
    capabilities: [],
    headSeq: w.server.head,
    minSchemaVersion: 1,
    engineVersion: 0,
    lockLevel: 1,
    lockAnchors: { table: told.anchors },
    revision: { setId: told.revision, baselineVersionId: BLUE_VERSION },
    airWindow: null,
  });
  w.server.answer.subscribe = true;
  await w.settle();
}

const LOCK = {
  numbering: "suffix",
  colourOrder: "standard",
  lockedOn: "2026-11-16",
} as const;

test("the cached state is shown before the server answers", async () => {
  const cache = createMemoryProductionCache();
  await cache.write(DOC, cached(BLUE_ACTIVE, WHITE_VERSION));
  const w = await setup();
  const h = await w.makeClient().open(DOC);
  await w.online();
  const server = fakeServer(PINK_ACTIVE);
  const answer = Promise.withResolvers<Answer>();
  server.on("/api/production/state", () => answer.promise);
  const client = createProductionClient({
    docId: DOC,
    handle: h,
    transport: server.transport,
    cache,
    random: countingRandom(),
    clock: w.fake.clock,
  });
  const atFirst = client.current().get();
  await w.turn();
  const shown = client.current().get();
  answer.resolve({ status: 200, body: PINK_ACTIVE });
  await w.settle();
  expect([
    atFirst,
    shown,
    client.current().get(),
    await cache.read(DOC),
  ]).toEqual([
    null,
    cached(BLUE_ACTIVE, WHITE_VERSION),
    cached(PINK_ACTIVE, BLUE_VERSION),
    cached(PINK_ACTIVE, BLUE_VERSION),
  ]);
});

test("an issue seen while offline is picked up on return, with its new baseline", async () => {
  const { w, server, cache, client } = await production(BLUE_ACTIVE);
  const before = client.current().get();
  await cut(w);
  server.state = PINK_ACTIVE;
  await reconnect(w, { revision: "set-pink", anchors: [ANCHOR] });
  expect([
    before,
    client.current().get(),
    await cache.read(DOC),
    server.gets,
  ]).toEqual([
    cached(BLUE_ACTIVE, WHITE_VERSION),
    cached(PINK_ACTIVE, BLUE_VERSION),
    cached(PINK_ACTIVE, BLUE_VERSION),
    [contentPath(WHITE_VERSION), contentPath(BLUE_VERSION)],
  ]);
});

test("a production change asks for the state again, and changes told while asking ask once more", async () => {
  const { w, server, client } = await production(BLUE_ACTIVE);
  const asked = () =>
    server.posts.filter((p) => p.path === "/api/production/state").length;
  const control = (kind: ControlKind) =>
    w.server.send({
      type: "CONTROL",
      docId: DOC,
      generation: 1,
      seq: 2,
      kind,
      data: new Uint8Array(),
    });
  const answer = Promise.withResolvers<Answer>();
  server.on("/api/production/state", () => answer.promise);
  const before = asked();
  control("revision_issued");
  control("layout_changed");
  control("lock_anchors_changed");
  control("revision_recalled");
  await w.settle();
  const whileAsking = asked() - before;
  server.on("/api/production/state", async () => ({
    status: 200,
    body: PINK_ACTIVE,
  }));
  answer.resolve({ status: 200, body: BLUE_ACTIVE });
  await w.settle();
  const afterAnswer = asked() - before;
  control("version_created");
  await w.settle();
  expect([
    whileAsking,
    afterAnswer,
    asked() - before,
    client.current().get(),
  ]).toEqual([1, 2, 2, cached(PINK_ACTIVE, BLUE_VERSION)]);
});

test("a lost answer is asked again under the same key", async () => {
  const { w, server, client } = await production(BLUE_ACTIVE);
  const locked = { ...BLUE_ACTIVE, headSeq: 5 };
  let lost = 1;
  server.on("/api/production/lock", async () => {
    if (lost > 0) {
      lost -= 1;
      throw new ConnectError("unreachable");
    }
    return { status: 200, body: locked };
  });
  const outcome = client.lock(LOCK);
  await w.settle();
  w.fake.advance(1_000);
  await w.settle();
  const keys = server.posts
    .filter((post) => post.path === "/api/production/lock")
    .map((post) => post.body.key);
  expect([
    await outcome,
    keys.length,
    new Set(keys).size,
    isRequestKey(keys[0]),
  ]).toEqual([{ ok: true, value: locked }, 2, 1, true]);
});

test("a request the server cannot be reached for within 30 seconds answers offline", async () => {
  const { w, server, client } = await production(BLUE_ACTIVE);
  server.reachable = false;
  let answered: unknown = null;
  void client.unlock().then((outcome) => {
    answered = outcome;
  });
  await w.settle();
  w.fake.advance(29_000);
  await w.settle();
  const at29 = answered;
  w.fake.advance(1_000);
  await w.settle();
  expect([at29, answered]).toEqual([
    null,
    { ok: false, code: "offline", body: null },
  ]);
});

test("a request waits for this device's changes to be synced", async () => {
  const { w, h, server, client } = await production(BLUE_ACTIVE);
  const seen: number[] = [];
  client.waiting().subscribe((n) => seen.push(n));
  typeIn(h, B1, "a");
  typeIn(h, B2, "b");
  await w.settle();
  const outcome = client.lock(LOCK);
  await w.settle();
  const before = server.posts.filter((p) => p.path === "/api/production/lock");
  w.server.ackAll(DOC);
  await w.settle();
  const after = server.posts.filter((p) => p.path === "/api/production/lock");
  expect([seen, before.length, after.length, await outcome]).toEqual([
    [1, 2, 0],
    0,
    1,
    { ok: true, value: BLUE_ACTIVE },
  ]);
});

test("a disposed client gives up a request still waiting for this device's changes", async () => {
  const { w, h, server, client } = await production(BLUE_ACTIVE);
  typeIn(h, B1, "a");
  await w.settle();
  let answered: unknown = null;
  void client.end().then((outcome) => {
    answered = outcome;
  });
  await w.settle();
  client.dispose();
  await w.settle();
  expect([
    answered,
    server.posts.filter((p) => p.path === "/api/production/end"),
  ]).toEqual([{ ok: false, code: "offline", body: null }, []]);
});

test("an issue made while this device was offline is told once, on return", async () => {
  const { w, h, server, client } = await production(BLUE_ACTIVE);
  await cut(w);
  for (const letter of ["a", "b", "c"]) typeIn(h, B1, letter);
  server.state = PINK_ACTIVE;
  await reconnect(w, { revision: "set-pink", anchors: [ANCHOR] });
  const told = client.issuedWhileOffline().get();
  client.dismiss();
  const dismissed = client.issuedWhileOffline().get();
  await cut(w);
  typeIn(h, B1, "d");
  const moved = { ...ANCHOR, offset: 1 };
  server.state = { ...PINK_ACTIVE, anchors: [moved] };
  const asked = server.posts.length;
  await reconnect(w, { revision: "set-pink", anchors: [moved] });
  expect([
    told,
    dismissed,
    client.issuedWhileOffline().get(),
    server.posts.length - asked,
  ]).toEqual([
    { byName: "Priya", name: "Blue", active: "Pink" },
    null,
    null,
    1,
  ]);
});

test("an issue this device already held is not told on its return", async () => {
  const { w, h, server, client } = await production(PINK_ACTIVE);
  await cut(w);
  typeIn(h, B1, "a");
  const moved = { ...ANCHOR, offset: 1 };
  server.state = { ...PINK_ACTIVE, anchors: [moved] };
  await reconnect(w, { revision: "set-pink", anchors: [moved] });
  expect([client.current().get(), client.issuedWhileOffline().get()]).toEqual([
    cached({ ...PINK_ACTIVE, anchors: [moved] }, BLUE_VERSION),
    null,
  ]);
});

test("a device with nothing waiting is not told of an issue made while it was offline", async () => {
  const { w, server, client } = await production(BLUE_ACTIVE);
  await cut(w);
  server.state = PINK_ACTIVE;
  await reconnect(w, { revision: "set-pink", anchors: [ANCHOR] });
  expect([client.current().get(), client.issuedWhileOffline().get()]).toEqual([
    cached(PINK_ACTIVE, BLUE_VERSION),
    null,
  ]);
});

test("an issue made before this device last synced is not told as made while it was offline", async () => {
  const { w, h, server, client } = await production(BLUE_ACTIVE);
  server.state = PINK_ACTIVE;
  w.fake.advance(BLUE_ISSUE_AT * 2);
  typeIn(h, B1, "a");
  await w.settle();
  w.server.ackAll(DOC);
  await w.settle();
  await cut(w);
  typeIn(h, B1, "b");
  await reconnect(w, { revision: "set-pink", anchors: [ANCHOR] });
  expect([client.current().get(), client.issuedWhileOffline().get()]).toEqual([
    cached(PINK_ACTIVE, BLUE_VERSION),
    null,
  ]);
});

test("an issue is sent under the screen's key, and the state after it is shown", async () => {
  const { w, server, client } = await production(BLUE_ACTIVE);
  server.on("/api/production/issue", async () => ({
    status: 200,
    body: { state: PINK_ACTIVE, issue: BLUE_ISSUE },
  }));
  const outcome = await client.issue(ISSUE_BLUE);
  await w.settle();
  const sent = server.posts.filter((p) => p.path === "/api/production/issue");
  expect([
    outcome,
    sent.map((p) => p.body.key),
    client.current().get(),
  ]).toEqual([
    { ok: true, value: { state: PINK_ACTIVE, issue: BLUE_ISSUE } },
    [ISSUE_BLUE.key],
    cached(PINK_ACTIVE, BLUE_VERSION),
  ]);
});

test("a refusal is reported with its body", async () => {
  const { server, client } = await production(BLUE_ACTIVE);
  const body: ProductionRefusalBody = {
    error: "already_issued",
    issued: {
      name: "Blue",
      byName: "Priya",
      issuedAt: BLUE_ISSUE_AT,
      nextName: "Pink",
    },
  };
  server.on("/api/production/issue", async () => ({ status: 409, body }));
  const outcome = await client.issue(ISSUE_BLUE);
  expect(outcome).toEqual({ ok: false, code: "already_issued", body });
});
