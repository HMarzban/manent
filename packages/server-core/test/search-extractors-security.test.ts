import { expect, test } from "bun:test";
import {
  NOTES_MAP,
  initRundown,
  insertRows,
  jsonMap,
  moveToCuts,
  scriptBody,
  setCell,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { openSqliteSearchIndex } from "@manent/storage";
import type { SearchIndex } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  indexDocId,
  isSearchResponse,
  projectHome,
  workspaceHome,
} from "@manent/sync-protocol";
import type {
  Identity,
  SearchResponse,
  WorkspaceRef,
} from "@manent/sync-protocol";
import {
  createSearchService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "../src/index.ts";
import type {
  Directory,
  ManentServer,
  SearchService,
  SignInProvider,
  SyncService,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const HOST = "localhost:4747";
const ORIGIN = `http://${HOST}`;
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };
const CALLER = { remoteAddress: "127.0.0.1", upgrade: () => false };

const WS_MAIN = "medium";
const WS_MAIN_INDEX = indexDocId("workspace", WS_MAIN);
const PROJ_SHOW = "11111111-1111-7111-8111-111111111111";

const DOC_SCRIPT = "aaaa1111-1111-7111-8111-111111111111";
const DOC_ROOM_LOG = "aaaa2222-2222-7222-8222-222222222222";
const DOC_ROOM_LOG_RESTRICTED = "aaaa3333-3333-7333-8333-333333333333";
const DOC_RUNDOWN = "aaaa4444-4444-7444-8444-444444444444";
const DOC_RUNDOWN_RESTRICTED = "aaaa5555-5555-7555-8555-555555555555";

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "sam", name: "Sam Okafor" },
  { userId: "leo", name: "Leo Marsh" },
  { userId: "ana", name: "Ana Costa" },
  { userId: "outsider", name: "Outside User" },
];

const WORKSPACES_BY_USER: Readonly<Record<string, readonly WorkspaceRef[]>> = {
  dana: [{ id: WS_MAIN, name: "Writers' room", seeding: null }],
  sam: [{ id: WS_MAIN, name: "Writers' room", seeding: null }],
  leo: [{ id: WS_MAIN, name: "Writers' room", seeding: null }],
  ana: [{ id: WS_MAIN, name: "Writers' room", seeding: null }],
  outsider: [],
};

const DIRECTORY: Directory = {
  user: (userId) => PEOPLE.find((p) => p.userId === userId) ?? null,
  workspacesOf: (userId) => WORKSPACES_BY_USER[userId] ?? [],
};

const NO_SIGN_IN: SignInProvider = {
  describe: () => ({ choices: [] }),
  authenticate: async () => ({ ok: false, reason: "unknown_user" }),
};

interface Harness {
  fc: FakeClock;
  storage: MemoryStorage;
  searchIndex: SearchIndex;
  search: SearchService;
  sync: SyncService;
  server: ManentServer;
  get(
    queryString: string,
    userId: string | null,
  ): Promise<{ status: number; body: unknown }>;
  flush(): Promise<void>;
}

function createHarness(): Harness {
  const fc = fakeClock(1_763_500_000_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(11),
    now: () => fc.clock.now(),
  });
  const searchIndex = openSqliteSearchIndex({ path: ":memory:" });
  let seq = 0;
  const ids = (): string => `id-${++seq}`;
  let server!: ManentServer;
  const search = createSearchService({
    storage,
    sync: () => server.sync!,
    clock: fc.clock,
    searchIndex,
  });
  server = createServer({
    http: { allowedHosts: [HOST], openUrl: ORIGIN, webDir: null },
    auth: { signIn: NO_SIGN_IN, directory: DIRECTORY, sessions },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: () => fc.clock.now() }),
      versions: { current: V1, min: V1 },
      allowedOrigins: [ORIGIN],
    },
    sync: {
      storage,
      clock: fc.clock,
      defer: fc.defer,
      ids,
      hooks: [search.hooks],
    },
    search,
  });

  const tokens: Record<string, string> = {};
  for (const person of PEOPLE)
    tokens[person.userId] = sessions.issue(person.userId);

  async function flush(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      fc.runDeferred();
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  async function get(
    queryString: string,
    userId: string | null,
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {};
    if (userId !== null) headers.Authorization = `Bearer ${tokens[userId]}`;
    const pending = server.fetch(
      new Request(`${ORIGIN}/api/search${queryString}`, {
        method: "GET",
        headers,
      }),
      CALLER,
    );
    await flush();
    const response = await pending;
    if (response === null) throw new Error("unexpected upgrade");
    return { status: response.status, body: await response.json() };
  }

  return {
    fc,
    storage,
    searchIndex,
    search,
    sync: server.sync!,
    server,
    get,
    flush,
  };
}

async function seedCorpus(h: Harness): Promise<void> {
  const { sync, storage, fc } = h;
  sync.access.create("dana", {
    docId: WS_MAIN_INDEX,
    kind: "index",
    home: workspaceHome(WS_MAIN),
  });
  storage.directory.setRole(WS_MAIN_INDEX, "sam", "edit", []);
  storage.directory.setRole(WS_MAIN_INDEX, "leo", "comment", []);
  storage.directory.setRole(WS_MAIN_INDEX, "ana", "view", []);

  // Shared script, room_log, and rundown in WS_MAIN
  sync.access.create("dana", {
    docId: DOC_SCRIPT,
    kind: "script",
    home: projectHome(PROJ_SHOW),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_ROOM_LOG,
    kind: "room_log",
    home: projectHome(PROJ_SHOW),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_RUNDOWN,
    kind: "rundown",
    home: projectHome(PROJ_SHOW),
    workspaceId: WS_MAIN,
  });

  // Restricted room_log and rundown (only dana has a role; sam/leo/ana/outsider do NOT)
  sync.access.create("dana", {
    docId: DOC_ROOM_LOG_RESTRICTED,
    kind: "room_log",
    home: projectHome(PROJ_SHOW),
  });
  sync.access.create("dana", {
    docId: DOC_RUNDOWN_RESTRICTED,
    kind: "rundown",
    home: projectHome(PROJ_SHOW),
  });

  const day = Date.UTC(2026, 10, 21, 14, 0, 0);
  const metaEntry = (title: string, kind: string) => ({
    projectId: PROJ_SHOW,
    title,
    kind,
    createdAt: day,
    editedAt: day,
    editedByUserId: "dana",
    airDate: null,
    rundownId: null,
    trashedAt: null,
    trashedByUserId: null,
  });

  const writeIndex = sync.authorityWrite(WS_MAIN_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "projects").set(PROJ_SHOW, {
        title: "Late Harbour Live",
        kind: "show",
        createdAt: day,
        createdByUserId: "dana",
        folderId: null,
      });
      const docs = jsonMap(doc, "documents");
      docs.set(DOC_SCRIPT, metaEntry("Pilot Script", "script"));
      docs.set(DOC_ROOM_LOG, metaEntry("Tuesday Room Log", "room_log"));
      docs.set(
        DOC_ROOM_LOG_RESTRICTED,
        metaEntry("Private Pitch Log", "room_log"),
      );
      docs.set(DOC_RUNDOWN, metaEntry("Thursday Show Rundown", "rundown"));
      docs.set(
        DOC_RUNDOWN_RESTRICTED,
        metaEntry("Locked Special Rundown", "rundown"),
      );
      return { ok: true };
    },
    inTransaction() {},
  });

  // Script with live body block AND a block moved to cuts via moveToCuts
  let cutSeq = 0;
  const writeScript = sync.authorityWrite(DOC_SCRIPT, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) => {
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-live-000001", type: "action" },
            content: [
              { type: "text", text: "Live harbour scene with lighthouse." },
            ],
          },
          {
            type: "block",
            attrs: { id: "blk-cut-0000001", type: "dialogue" },
            content: [
              {
                type: "text",
                text: "Cut monologue mentioning velvetcompass hidden key.",
              },
            ],
          },
        ]);
      });
      const moved = moveToCuts(doc, {
        blockIds: ["blk-cut-0000001"],
        authorUserId: "dana",
        now: () => fc.clock.now(),
        ids: () => `cut-${++cutSeq}`,
      });
      if (!moved.ok) throw new Error("expected moveToCuts to succeed");
      return { ok: true };
    },
    inTransaction() {},
  });

  // Shared room log (body + writers-only note that must NEVER be indexed)
  const writeRoomLog = sync.authorityWrite(DOC_ROOM_LOG, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) => {
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-rl-00000001", type: "action" },
            content: [
              {
                type: "text",
                text: "Brainstorm beat: silverlantern opens act two.",
              },
            ],
          },
        ]);
      });
      jsonMap(doc, NOTES_MAP).set("n-rl-1", {
        text: "ROOMLOGSECRETNOTE88 never index",
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  // Restricted room log (only dana has access)
  const writeRestrictedRoomLog = sync.authorityWrite(DOC_ROOM_LOG_RESTRICTED, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) => {
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-rlr-0000001", type: "action" },
            content: [
              { type: "text", text: "Confidential cobaltvault season finale." },
            ],
          },
        ]);
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  // Shared rundown with row cells (including an overwritten cell whose previous value must NOT be indexed)
  const writeRundown = sync.authorityWrite(DOC_RUNDOWN, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      initRundown(
        doc,
        {
          airDate: "2026-11-26",
          airAt: fc.clock.now() + 3_600_000,
          windowLeadMs: 3_600_000,
          targetMs: 1_800_000,
        },
        SHOW_COLUMNS,
      );
      insertRows(
        doc,
        [
          {
            id: "row-open-000001",
            kind: "script",
            docId: DOC_SCRIPT,
            blockId: null,
          },
        ],
        null,
      );
      const by = { userId: "dana", now: () => fc.clock.now() };
      setCell(doc, "row-open-000001", "segment", "A-Block", by);
      setCell(doc, "row-open-000001", "story", "OLDSECRETCELL99", by);
      setCell(
        doc,
        "row-open-000001",
        "story",
        "Monologue brassclock segment",
        by,
      );
      setCell(doc, "row-open-000001", "writer", "Sam Okafor", by);
      setCell(doc, "row-open-000001", "presenter", "Elena Vance", by);
      setCell(doc, "row-open-000001", "type", "Desk Piece", by);
      return { ok: true };
    },
    inTransaction() {},
  });

  // Restricted rundown (only dana has access)
  const writeRestrictedRundown = sync.authorityWrite(DOC_RUNDOWN_RESTRICTED, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      initRundown(
        doc,
        {
          airDate: "2026-12-01",
          airAt: fc.clock.now() + 7_200_000,
          windowLeadMs: 3_600_000,
          targetMs: 1_800_000,
        },
        SHOW_COLUMNS,
      );
      insertRows(
        doc,
        [{ id: "row-sec-0000001", kind: "item", docId: null, blockId: null }],
        null,
      );
      setCell(doc, "row-sec-0000001", "story", "Special crimsonkey segment", {
        userId: "dana",
        now: () => fc.clock.now(),
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  await h.flush();
  await Promise.all([
    writeIndex,
    writeScript,
    writeRoomLog,
    writeRestrictedRoomLog,
    writeRundown,
    writeRestrictedRundown,
  ]);
}

test("cut text is found only by owners and editors; viewers and commenters get zero matches and zero excerpt leaks", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Owners (dana) and editors (sam) find the exact cut phrase in DOC_SCRIPT
  for (const userId of ["dana", "sam"]) {
    const res = await h.get(
      `?q=${encodeURIComponent('"velvetcompass hidden key"')}&workspaceId=${WS_MAIN}`,
      userId,
    );
    expect(res.status).toBe(200);
    expect(isSearchResponse(res.body)).toBe(true);
    const body = res.body as SearchResponse;
    expect(body.results.map((r) => r.docId)).toEqual([DOC_SCRIPT]);
    expect((body.results[0]!.excerpt ?? "").toLowerCase()).toContain(
      "velvetcompass",
    );
  }

  // Commenters (leo) and viewers (ana) NEVER match cut text (both bare word and phrase)
  for (const userId of ["leo", "ana"]) {
    for (const q of ["velvetcompass", '"velvetcompass hidden key"']) {
      const res = await h.get(
        `?q=${encodeURIComponent(q)}&workspaceId=${WS_MAIN}`,
        userId,
      );
      expect(res).toEqual({ status: 200, body: { results: [] } });
    }
    // Same viewer/commenter DOES match live script body text, and excerpt contains no cut text
    const live = await h.get(`?q=lighthouse&workspaceId=${WS_MAIN}`, userId);
    expect(live.status).toBe(200);
    const body = live.body as SearchResponse;
    expect(body.results.map((r) => r.docId)).toEqual([DOC_SCRIPT]);
    expect((body.results[0]!.excerpt ?? "").toLowerCase()).not.toContain(
      "velvetcompass",
    );
  }

  h.search.stop();
});

test("room_log documents match type:room_log and body text only for authorized readers, excluding notes, outsiders, and Trash", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Authorized readers (dana, sam, leo, ana) find DOC_ROOM_LOG via type:room_log
  for (const userId of ["dana", "sam", "leo", "ana"]) {
    const res = await h.get(
      `?q=${encodeURIComponent("silverlantern type:room_log")}&workspaceId=${WS_MAIN}`,
      userId,
    );
    expect(res.status).toBe(200);
    const body = res.body as SearchResponse;
    expect(body.results).toEqual([
      expect.objectContaining({
        docId: DOC_ROOM_LOG,
        kind: "room_log",
        title: "Tuesday Room Log",
      }),
    ]);
  }

  // Writers-only notes on a room log are NEVER indexed
  for (const userId of ["dana", "sam", "ana"]) {
    expect(
      await h.get(`?q=ROOMLOGSECRETNOTE88&workspaceId=${WS_MAIN}`, userId),
    ).toEqual({ status: 200, body: { results: [] } });
  }

  // Restricted room log is visible to dana ONLY, never to sam/ana/outsider
  expect(
    (
      (await h.get(`?q=cobaltvault&workspaceId=${WS_MAIN}`, "dana"))
        .body as SearchResponse
    ).results.map((r) => r.docId),
  ).toEqual([DOC_ROOM_LOG_RESTRICTED]);
  for (const userId of ["sam", "ana"]) {
    expect(
      await h.get(`?q=cobaltvault&workspaceId=${WS_MAIN}`, userId),
    ).toEqual({ status: 200, body: { results: [] } });
  }
  expect(
    await h.get(`?q=silverlantern&workspaceId=${WS_MAIN}`, "outsider"),
  ).toEqual({ status: 403, body: { error: "forbidden" } });
  expect(await h.get("?q=silverlantern", "outsider")).toEqual({
    status: 200,
    body: { results: [] },
  });

  // Trashing DOC_ROOM_LOG hides it immediately; restoring re-includes it
  h.storage.trash.put({
    docId: DOC_ROOM_LOG,
    workspaceId: WS_MAIN_INDEX,
    home: `project:${PROJ_SHOW}`,
    deletedByUserId: "dana",
    deletedAt: 1_000,
    purgeAfter: 2_000_000_000,
  });
  expect(
    await h.get(
      `?q=${encodeURIComponent("silverlantern type:room_log")}&workspaceId=${WS_MAIN}`,
      "sam",
    ),
  ).toEqual({ status: 200, body: { results: [] } });

  h.storage.trash.remove(DOC_ROOM_LOG);
  expect(
    (
      (
        await h.get(
          `?q=${encodeURIComponent("silverlantern type:room_log")}&workspaceId=${WS_MAIN}`,
          "sam",
        )
      ).body as SearchResponse
    ).results.map((r) => r.docId),
  ).toEqual([DOC_ROOM_LOG]);

  h.search.stop();
});

test("rundown documents match type:rundown and row cells only for authorized readers, excluding previous values, outsiders, and Trash", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Row cell values (story, presenter, segment, type) match with type:rundown for authorized readers
  for (const query of [
    "brassclock type:rundown",
    '"Elena Vance" type:rundown',
    '"Desk Piece" type:rundown',
  ]) {
    for (const userId of ["dana", "sam", "ana"]) {
      const res = await h.get(
        `?q=${encodeURIComponent(query)}&workspaceId=${WS_MAIN}`,
        userId,
      );
      expect(res.status).toBe(200);
      const body = res.body as SearchResponse;
      expect(body.results).toEqual([
        expect.objectContaining({
          docId: DOC_RUNDOWN,
          kind: "rundown",
          title: "Thursday Show Rundown",
        }),
      ]);
    }
  }

  // Overwritten previous cell value is NEVER indexed
  expect(
    await h.get(`?q=OLDSECRETCELL99&workspaceId=${WS_MAIN}`, "dana"),
  ).toEqual({ status: 200, body: { results: [] } });

  // Restricted rundown is visible to dana ONLY, never to sam/ana/outsider
  expect(
    (
      (
        await h.get(
          `?q=${encodeURIComponent("crimsonkey type:rundown")}&workspaceId=${WS_MAIN}`,
          "dana",
        )
      ).body as SearchResponse
    ).results.map((r) => r.docId),
  ).toEqual([DOC_RUNDOWN_RESTRICTED]);
  for (const userId of ["sam", "ana"]) {
    expect(
      await h.get(
        `?q=${encodeURIComponent("crimsonkey type:rundown")}&workspaceId=${WS_MAIN}`,
        userId,
      ),
    ).toEqual({ status: 200, body: { results: [] } });
  }
  expect(await h.get("?q=brassclock", "outsider")).toEqual({
    status: 200,
    body: { results: [] },
  });

  // Trashing DOC_RUNDOWN hides it immediately; restoring re-includes it
  h.storage.trash.put({
    docId: DOC_RUNDOWN,
    workspaceId: WS_MAIN_INDEX,
    home: `project:${PROJ_SHOW}`,
    deletedByUserId: "dana",
    deletedAt: 1_000,
    purgeAfter: 2_000_000_000,
  });
  expect(
    await h.get(
      `?q=${encodeURIComponent("brassclock type:rundown")}&workspaceId=${WS_MAIN}`,
      "sam",
    ),
  ).toEqual({ status: 200, body: { results: [] } });

  h.storage.trash.remove(DOC_RUNDOWN);
  expect(
    (
      (
        await h.get(
          `?q=${encodeURIComponent("brassclock type:rundown")}&workspaceId=${WS_MAIN}`,
          "sam",
        )
      ).body as SearchResponse
    ).results.map((r) => r.docId),
  ).toEqual([DOC_RUNDOWN]);

  h.search.stop();
});
