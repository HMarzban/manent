import { expect, test } from "bun:test";
import fc from "fast-check";
import { scriptDocFromJSON } from "@manent/crdt";
import { canonicalBlocksOf } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type { VersionListResponse } from "@manent/sync-protocol";
import { createHistoryService, createServer } from "../src/index.ts";
import type {
  HistoryService,
  ManentServer,
  ServerConfig,
  SyncSettings,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { DOC, PROJECT, appendAll } from "./seed.ts";

const T0 = 1_811_808_000_000;
const HEADING = "scene-heading-1";
const ACTION = "scene-action-1";
const K1 = "00112233445566778899aabbccddeeff";
const K2 = "ffeeddccbbaa99887766554433221100";
const K3 = "0123456789abcdef0123456789abcdef";
const NAMED_ID = "version-1";
const SAVED_ID = "version-3";

const SCRIPT_BLOCKS: BlockJSON[] = [
  {
    type: "block",
    attrs: { id: HEADING, type: "scene_heading" },
    content: [{ type: "text", text: "INT. FERRY - NIGHT" }],
  },
  {
    type: "block",
    attrs: { id: ACTION, type: "action" },
    content: [{ type: "text", text: "Gulls." }],
  },
];
const SCRIPT: DocJSON = {
  type: "doc",
  content: [{ type: "section", content: SCRIPT_BLOCKS }],
};

/** Ana owns DOC, a script of one scene; Leo may read it. History is built as the server's entry builds it. */
function historyServer(
  options: {
    sync?: Partial<SyncSettings>;
    off?: "sync" | "history";
  } = {},
) {
  const clock = fakeClock(T0);
  const storage: MemoryStorage = createMemoryStorage({
    now: () => clock.clock.now(),
  });
  let made = 0;
  const ids = (): string => `version-${++made}`;
  const built: { server: ManentServer | null } = { server: null };
  const history: HistoryService = createHistoryService({
    sync: () => built.server!.sync!,
    storage,
    clock: clock.clock,
    ids,
  });
  const base = makeConfig({
    sync:
      options.off === "sync"
        ? null
        : {
            storage,
            clock: clock.clock,
            defer: (fn) => fn(),
            ids,
            hooks: [history],
            ...options.sync,
          },
  });
  const config: ServerConfig =
    options.off === "history" ? base : { ...base, history };
  const server = createServer(config);
  built.server = server;
  if (server.sync !== null) {
    server.sync.access.create("ana", {
      docId: DOC,
      kind: "script",
      home: `project:${PROJECT}`,
    });
    const seed = scriptDocFromJSON(SCRIPT, { clientId: 9001 });
    appendAll(storage, [seed.encodeState()], { userId: "ana" });
    storage.directory.setRole(DOC, "leo", "view", []);
  }
  const ana = config.auth.sessions.issue("ana");
  const leo = config.auth.sessions.issue("leo");

  /** The status and the JSON body of one request. */
  async function call(
    method: "GET" | "POST",
    path: string,
    body: string | null = null,
    token: string | null = ana,
  ): Promise<[number, unknown]> {
    const headers: Record<string, string> =
      token === null ? {} : { Authorization: `Bearer ${token}` };
    const init = method === "GET" ? { headers } : { method, headers, body };
    const response = await server.fetch(
      new Request(`http://127.0.0.1:4747${path}`, init),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null) throw new TypeError("the request was upgraded");
    return [response.status, await response.json()];
  }
  const post = (path: string, body: unknown, token: string | null = ana) =>
    call("POST", path, JSON.stringify(body), token);
  const get = (path: string, token: string | null = ana) =>
    call("GET", path, null, token);
  return { storage, leo, call, post, get };
}

const notFound: [number, unknown] = [404, { error: "not_found" }];

test("each history route answers as its table says", async () => {
  const { storage, leo, call, post, get } = historyServer();
  const named = await post("/api/versions/name", {
    docId: DOC,
    key: K1,
    name: "Table read draft",
    fromVersionId: null,
  });
  const authors = {
    [HEADING]: { userId: "ana", at: T0 },
    [ACTION]: { userId: "ana", at: T0 },
  };
  const namedItem = {
    id: NAMED_ID,
    kind: "named",
    name: "Table read draft",
    createdByUserId: "ana",
    createdAt: T0,
    onDevice: false,
    position: { generation: 1, seq: 1 },
    engineVersion: 0,
    summary: { authorUserIds: ["ana"], changes: 2, scenes: 1 },
  };
  expect(named).toEqual([200, { version: namedItem }]);
  const saved = await post("/api/versions/save", {
    docId: DOC,
    key: K2,
    kind: "saved",
  });
  const savedItem = {
    ...namedItem,
    id: SAVED_ID,
    kind: "saved",
    name: null,
    summary: { authorUserIds: [], changes: 0, scenes: 0 },
  };
  expect(saved).toEqual([200, { version: savedItem }]);
  const head = { generation: 1, seq: 1 };
  expect(await get(`/api/versions?docId=${DOC}`)).toEqual([
    200,
    { versions: [savedItem, namedItem], next: null, head, othersCanOpen: true },
  ]);
  const cursor = `${T0}:${SAVED_ID}`;
  expect(await get(`/api/versions?docId=${DOC}&limit=1`)).toEqual([
    200,
    { versions: [savedItem], next: cursor, head, othersCanOpen: true },
  ]);
  expect(await get(`/api/versions?docId=${DOC}&cursor=${cursor}`)).toEqual([
    200,
    { versions: [namedItem], next: null, head, othersCanOpen: true },
  ]);
  const content = {
    v: 1,
    blocks: canonicalBlocksOf(SCRIPT),
    settings: {},
    schemaVersion: 1,
    engineVersion: 0,
    locks: null,
    authors,
  };
  expect(
    await get(`/api/versions/content?docId=${DOC}&versionId=${NAMED_ID}`),
  ).toEqual([200, { content, position: head }]);
  expect(
    await get(`/api/versions/content?docId=${DOC}&generation=1&seq=1`),
  ).toEqual([200, { content, position: head }]);
  expect(
    await get(`/api/versions/content?docId=${DOC}&generation=1&seq=9`),
  ).toEqual(notFound);
  const upload = {
    docId: DOC,
    version: {
      id: "device-version-1",
      kind: "device",
      name: null,
      deviceId: "device-9",
      content: SCRIPT,
      schemaVersion: 1,
    },
  };
  expect(await post("/api/versions/upload", upload)).toEqual([
    200,
    {
      version: {
        ...namedItem,
        id: "device-version-1",
        kind: "device",
        name: null,
        onDevice: true,
        position: null,
        summary: { authorUserIds: ["ana"], changes: 0, scenes: 0 },
      },
    },
  ]);
  const restore = {
    docId: DOC,
    key: K3,
    versionId: NAMED_ID,
    scope: { kind: "script" },
  };
  expect(await post("/api/versions/restore", restore)).toEqual([
    200,
    {
      beforeVersionId: "version-4",
      serverSeq: 1,
      applied: 0,
    },
  ]);
  expect(
    await get(`/api/versions/who?docId=${DOC}&blockId=${ACTION}`, leo),
  ).toEqual([200, { userId: "ana", at: T0, previous: null, exact: true }]);
  expect(
    await get(`/api/versions/since?docId=${DOC}&generation=1&seq=1`),
  ).toEqual([200, { changes: 0, authorUserIds: [] }]);
  expect(
    await post("/api/versions/authors", {
      docId: DOC,
      since: { versionId: NAMED_ID },
      blockIds: [ACTION],
    }),
  ).toEqual([200, { authors: {} }]);

  // the statuses every route shares, and each route's own
  expect(await get(`/api/versions?docId=${DOC}`, null)).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  expect(await call("POST", "/api/versions/name", "{not json")).toEqual([
    400,
    { error: "bad_request" },
  ]);
  expect(await get(`/api/versions?docId=${DOC}&limit=501`)).toEqual([
    400,
    { error: "bad_request" },
  ]);
  const naming = {
    docId: DOC,
    key: K1,
    name: "x".repeat(121),
    fromVersionId: null,
  };
  expect(
    await post("/api/versions/name", { ...naming, key: "a".repeat(32) }),
  ).toEqual([400, { error: "bad_request" }]);
  expect(
    await get(`/api/versions/content?docId=${DOC}&versionId=gone-1`),
  ).toEqual(notFound);
  expect(
    await post("/api/versions/name", { ...naming, name: "Mine" }, leo),
  ).toEqual([403, { error: "forbidden" }]);
  expect(
    await call("POST", "/api/versions/upload", "x".repeat(67_108_865)),
  ).toEqual([413, { error: "too_large" }]);
  expect(
    await post("/api/versions/restore", {
      ...restore,
      key: "b".repeat(32),
      scope: { kind: "scene", headingId: "scene-heading-9" },
    }),
  ).toEqual([409, { error: "not_restorable" }]);
  const image = {
    type: "block",
    attrs: { id: "image-block-1", type: "action" },
    content: [{ type: "img" }],
  };
  expect(
    await post("/api/versions/upload", {
      docId: DOC,
      version: {
        ...upload.version,
        id: "device-version-2",
        content: {
          type: "doc",
          content: [{ type: "section", content: [image] }],
        },
      },
    }),
  ).toEqual([422, { error: "invalid" }]);
  storage.directory.setRole(DOC, "leo", "edit", []);
  expect(
    await post("/api/versions/name", { ...naming, name: "Mine" }, leo),
  ).toEqual([400, { error: "bad_request" }]);
  storage.failNextCommit();
  expect(
    await post("/api/versions/upload", {
      ...upload,
      version: { ...upload.version, id: "device-version-3" },
    }),
  ).toEqual([429, { error: "busy" }]);
  storage.directory.tombstone(DOC, "ana");
  expect(await get(`/api/versions?docId=${DOC}`)).toEqual([
    410,
    { error: "deleted" },
  ]);
});

/** One request to each route, as Ana. */
const EVERY_ROUTE: ["GET" | "POST", string, unknown][] = [
  ["GET", `/api/versions?docId=${DOC}`, null],
  ["GET", `/api/versions/content?docId=${DOC}&generation=1&seq=1`, null],
  [
    "POST",
    "/api/versions/name",
    { docId: DOC, key: K1, name: "Mine", fromVersionId: null },
  ],
  ["POST", "/api/versions/save", { docId: DOC, key: K1, kind: "saved" }],
  [
    "POST",
    "/api/versions/upload",
    {
      docId: DOC,
      version: {
        id: "device-version-1",
        kind: "device",
        name: null,
        deviceId: "device-9",
        content: SCRIPT,
        schemaVersion: 1,
      },
    },
  ],
  [
    "POST",
    "/api/versions/restore",
    { docId: DOC, key: K1, versionId: "version-1", scope: { kind: "script" } },
  ],
  ["GET", `/api/versions/who?docId=${DOC}&blockId=${ACTION}`, null],
  ["GET", `/api/versions/since?docId=${DOC}&generation=1&seq=1`, null],
  [
    "POST",
    "/api/versions/authors",
    { docId: DOC, since: { versionId: "version-1" }, blockIds: [ACTION] },
  ],
];

test("every history route is not found while sync or history is off, or in relay mode", async () => {
  const servers = [
    historyServer({ off: "sync" }),
    historyServer({ off: "history" }),
    historyServer({ sync: { mode: "relay" } }),
    historyServer({ sync: { mode: () => "relay" } }),
  ];
  for (const { call } of servers)
    for (const [method, path, body] of EVERY_ROUTE)
      expect(
        await call(method, path, body === null ? null : JSON.stringify(body)),
      ).toEqual(notFound);
});

test("a version list is the same shape both sides compile against", async () => {
  const { post, get } = historyServer();
  await post("/api/versions/name", {
    docId: DOC,
    key: K1,
    name: "Table read draft",
    fromVersionId: null,
  });
  const [, body] = await get(`/api/versions?docId=${DOC}`);
  const list = body as VersionListResponse;
  expect(Object.keys(list)).toEqual([
    "versions",
    "next",
    "head",
    "othersCanOpen",
  ]);
  expect(Object.keys(list.versions[0]!)).toEqual([
    "id",
    "kind",
    "name",
    "createdByUserId",
    "createdAt",
    "onDevice",
    "position",
    "engineVersion",
    "summary",
  ]);
});

/** Each field mostly good, else one of its bad values or left out. */
const field = (good: fc.Arbitrary<unknown>, ...bad: unknown[]) =>
  fc.oneof(
    { weight: 6, arbitrary: good },
    { weight: 1, arbitrary: fc.constantFrom(...bad, undefined) },
  );

const DEVICE_VERSION = {
  id: "device-version-9",
  kind: "device",
  name: null,
  deviceId: "device-9",
  content: SCRIPT,
  schemaVersion: 1,
};

/** Near-valid bodies for each route that reads one, and any JSON at all. */
const FIELDS: Readonly<Record<string, Record<string, fc.Arbitrary<unknown>>>> =
  {
    name: {
      docId: field(fc.constant(DOC), "not-a-doc", 7),
      key: field(fc.stringMatching(/^[0-9a-f]{32}$/), "short", null),
      name: field(fc.constantFrom("Mine", "x".repeat(121), "  "), 3),
      fromVersionId: field(fc.constantFrom(null, NAMED_ID), 9, "gone-1"),
    },
    save: {
      docId: field(fc.constant(DOC), "not-a-doc"),
      key: field(fc.stringMatching(/^[0-9a-f]{32}$/), "short"),
      kind: field(fc.constantFrom("saved", "export"), "device", "draft"),
    },
    upload: {
      docId: field(fc.constant(DOC), "not-a-doc"),
      version: field(
        fc.constant(DEVICE_VERSION),
        {
          ...DEVICE_VERSION,
          id: "device-version-8",
          content: { type: "doc", content: "x" },
        },
        {
          ...DEVICE_VERSION,
          id: "device-version-7",
          content: {
            type: "doc",
            content: [
              {
                type: "section",
                content: [{ type: "block", content: [{ type: "img" }] }],
              },
            ],
          },
        },
        { id: 4, kind: "device" },
      ),
    },
    restore: {
      docId: field(fc.constant(DOC), "not-a-doc"),
      key: field(fc.stringMatching(/^[0-9a-f]{32}$/), "short"),
      versionId: field(fc.constant(NAMED_ID), "gone-1", 5),
      scope: field(
        fc.constantFrom(
          { kind: "script" },
          { kind: "scene", headingId: HEADING },
          { kind: "scene", headingId: "scene-heading-9" },
        ),
        { kind: "scene" },
        "script",
      ),
    },
    authors: {
      docId: field(fc.constant(DOC), "not-a-doc"),
      since: field(
        fc.constantFrom(
          { versionId: NAMED_ID },
          { versionId: "gone-1" },
          { position: { generation: 1, seq: 1 } },
        ),
        { position: { generation: 1, seq: 0 } },
        {},
      ),
      blockIds: field(fc.constant([ACTION]), [3], "x"),
    },
  };
const routeBodies = fc.constantFrom(...Object.keys(FIELDS)).chain((route) =>
  fc.tuple(
    fc.constant(route),
    fc.oneof(
      { weight: 4, arbitrary: fc.record(FIELDS[route] ?? {}) },
      {
        weight: 1,
        arbitrary: fc.json().map((text): unknown => JSON.parse(text)),
      },
    ),
  ),
);

/** The codes a history route may refuse a body with, by status. */
const REFUSALS: Readonly<Record<number, readonly string[]>> = {
  400: ["bad_request"],
  403: ["forbidden"],
  404: ["not_found"],
  409: ["not_restorable"],
  422: ["invalid"],
  429: ["busy"],
};

const isRefusal = (status: number, body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  "error" in body &&
  (REFUSALS[status] ?? []).some((code) => code === body.error);

test("any body a history route is sent ends in one of its answers", async () => {
  const { post } = historyServer();
  await post("/api/versions/name", {
    docId: DOC,
    key: K1,
    name: "Table read draft",
    fromVersionId: null,
  });
  await fc.assert(
    fc.asyncProperty(routeBodies, async ([route, body]) => {
      const [status, answer] = await post(`/api/versions/${route}`, body);
      expect(status === 200 || isRefusal(status, answer)).toBe(true);
    }),
    { numRuns: 300 },
  );
});
