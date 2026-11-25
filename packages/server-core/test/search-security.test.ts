import { expect, test } from "bun:test";
import {
  ALTERNATES_MAP,
  NOTES_MAP,
  jsonMap,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import { openSqliteSearchIndex } from "@manent/storage";
import type { SearchIndex } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  SEARCH_QUERY_MAX_LEN,
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
const WS_OTHER = "heavy";
const WS_MAIN_INDEX = indexDocId("workspace", WS_MAIN);
const WS_OTHER_INDEX = indexDocId("workspace", WS_OTHER);

const PROJ_FILM = "11111111-1111-7111-8111-111111111111";
const PROJ_OTHER = "22222222-2222-7222-8222-222222222222";
const PROJ_PRIV = "33333333-3333-7333-8333-333333333333";

const DOC_PUBLIC = "aaaa1111-1111-7111-8111-111111111111";
const DOC_OUTLINE = "aaaa2222-2222-7222-8222-222222222222";
const DOC_RESTRICTED = "aaaa3333-3333-7333-8333-333333333333";
const DOC_OTHER_WS = "aaaa4444-4444-7444-8444-444444444444";
const DOC_PRIVATE = "aaaa5555-5555-7555-8555-555555555555";

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "sam", name: "Sam Okafor" },
  { userId: "ana", name: "Ana Costa" },
  { userId: "outsider", name: "Outside User" },
];

const WORKSPACES_BY_USER: Readonly<Record<string, readonly WorkspaceRef[]>> = {
  dana: [
    { id: WS_MAIN, name: "Writers' room", seeding: null },
    { id: WS_OTHER, name: "Lanternfield Studios", seeding: null },
  ],
  sam: [{ id: WS_MAIN, name: "Writers' room", seeding: null }],
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

function createHarness(startMs = 1_763_000_000_000): Harness {
  const fc = fakeClock(startMs);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(9),
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

async function writeScriptDoc(
  h: Harness,
  docId: string,
  userId: string,
  options: {
    body: string;
    note?: string;
    alternate?: string;
    settingHeader?: string;
  },
): Promise<void> {
  const pending = h.sync.authorityWrite(docId, {
    userId,
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-000000000001", type: "action" },
            content: [{ type: "text", text: options.body }],
          },
        ]),
      );
      if (options.note !== undefined)
        jsonMap(doc, NOTES_MAP).set("n1", {
          id: "n1",
          blockId: "blk-000000000001",
          text: options.note,
          authorUserId: userId,
          createdAt: 1_000,
        });
      if (options.alternate !== undefined)
        jsonMap(doc, ALTERNATES_MAP).set("a1", {
          id: "a1",
          blockId: "blk-000000000001",
          text: options.alternate,
        });
      if (options.settingHeader !== undefined)
        scriptSettings(doc).set("script.header", options.settingHeader, {
          userId,
          setAt: 1_000,
          replaced: null,
        });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  const res = await pending;
  if (!res.ok) throw new Error(`failed to seed ${docId}`);
}

async function seedCorpus(h: Harness): Promise<void> {
  const { sync, storage } = h;
  // Workspaces
  sync.access.create("dana", {
    docId: WS_MAIN_INDEX,
    kind: "index",
    home: workspaceHome(WS_MAIN),
  });
  storage.directory.setRole(WS_MAIN_INDEX, "sam", "edit", []);
  storage.directory.setRole(WS_MAIN_INDEX, "ana", "view", []);

  sync.access.create("dana", {
    docId: WS_OTHER_INDEX,
    kind: "index",
    home: workspaceHome(WS_OTHER),
  });

  // Shared script + outline in WS_MAIN
  sync.access.create("dana", {
    docId: DOC_PUBLIC,
    kind: "script",
    home: projectHome(PROJ_FILM),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_OUTLINE,
    kind: "outline",
    home: projectHome(PROJ_FILM),
    workspaceId: WS_MAIN,
  });
  // Restricted script in WS_MAIN (only dana has a role; sam and ana do NOT)
  sync.access.create("dana", {
    docId: DOC_RESTRICTED,
    kind: "script",
    home: projectHome(PROJ_FILM),
  });
  // Script in WS_OTHER (only dana has a role)
  sync.access.create("dana", {
    docId: DOC_OTHER_WS,
    kind: "script",
    home: projectHome(PROJ_OTHER),
    workspaceId: WS_OTHER,
  });
  // Private-folder script owned solely by dana
  sync.access.create("dana", {
    docId: DOC_PRIVATE,
    kind: "script",
    home: projectHome(PROJ_PRIV),
  });
  const danaPriv = indexDocId("user", "dana");
  sync.access.create("dana", {
    docId: danaPriv,
    kind: "index",
    home: "user",
  });

  const dayNov14 = Date.UTC(2026, 10, 14, 15, 0, 0);
  const dayNov20 = Date.UTC(2026, 10, 20, 15, 0, 0);

  const w1 = sync.authorityWrite(WS_MAIN_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      const folders = jsonMap(doc, "folders");
      folders.set("f-film", {
        name: "Film",
        parentId: null,
        createdAt: dayNov14,
        createdByUserId: "dana",
      });
      folders.set("f-dev", {
        name: "Development",
        parentId: "f-film",
        createdAt: dayNov14,
        createdByUserId: "dana",
      });
      jsonMap(doc, "projects").set(PROJ_FILM, {
        title: "The Founding Road",
        kind: "film",
        createdAt: dayNov14,
        createdByUserId: "dana",
        folderId: "f-dev",
      });
      const docs = jsonMap(doc, "documents");
      docs.set(DOC_PUBLIC, {
        projectId: PROJ_FILM,
        title: "Harbour Watch",
        kind: "script",
        createdAt: dayNov14,
        editedAt: dayNov14,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      docs.set(DOC_OUTLINE, {
        projectId: PROJ_FILM,
        title: "Harbour Outline",
        kind: "outline",
        createdAt: dayNov20,
        editedAt: dayNov20,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      docs.set(DOC_RESTRICTED, {
        projectId: PROJ_FILM,
        title: "Restricted Script",
        kind: "script",
        createdAt: dayNov20,
        editedAt: dayNov20,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  const w2 = sync.authorityWrite(WS_OTHER_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "projects").set(PROJ_OTHER, {
        title: "Other Studio Project",
        kind: "book",
        createdAt: dayNov20,
        createdByUserId: "dana",
        folderId: null,
      });
      jsonMap(doc, "documents").set(DOC_OTHER_WS, {
        projectId: PROJ_OTHER,
        title: "Tamsin Secret",
        kind: "script",
        createdAt: dayNov20,
        editedAt: dayNov20,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  const w3 = sync.authorityWrite(danaPriv, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      const pf = jsonMap(doc, "private_folder");
      pf.set(PROJ_PRIV, {
        title: "Dana Private Notebook",
        kind: "film",
        createdAt: dayNov20,
        createdByUserId: "dana",
        folderId: null,
      });
      pf.set(DOC_PRIVATE, {
        projectId: PROJ_PRIV,
        title: "Lantern Secret",
        kind: "script",
        createdAt: dayNov20,
        editedAt: dayNov20,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  await h.flush();
  await Promise.all([w1, w2, w3]);

  await writeScriptDoc(h, DOC_PUBLIC, "dana", {
    body: "Tamsin Hale walks along the Founding road at dusk.",
    note: "SECRETNOTE42 writers-only production note",
    alternate: "SECRETALT99 discarded alternate line",
    settingHeader: "SECRETHEADER77",
  });
  await writeScriptDoc(h, DOC_OUTLINE, "dana", {
    body: "Act One introduces Tamsin Hale and the lantern.",
  });
  await writeScriptDoc(h, DOC_RESTRICTED, "dana", {
    body: "Tamsin Hale restricted scene with ambercloak token.",
  });
  await writeScriptDoc(h, DOC_OTHER_WS, "dana", {
    body: "Tamsin Hale crosses the northern bridge in heavy workspace.",
  });
  await writeScriptDoc(h, DOC_PRIVATE, "dana", {
    body: "Private draft mentioning moonstonevault only for Dana.",
  });
}

test("unauthenticated search returns 401 and empty or overlong q returns 400", async () => {
  const h = createHarness();
  await seedCorpus(h);

  expect(await h.get("?q=Tamsin", null)).toEqual({
    status: 401,
    body: { error: "unauthenticated" },
  });
  expect(await h.get("?q=", "dana")).toEqual({
    status: 400,
    body: { error: "bad_request" },
  });
  expect(await h.get("?q=%20%20", "dana")).toEqual({
    status: 400,
    body: { error: "bad_request" },
  });
  const tooLong = "a".repeat(SEARCH_QUERY_MAX_LEN + 1);
  expect(await h.get(`?q=${tooLong}`, "dana")).toEqual({
    status: 400,
    body: { error: "bad_request" },
  });

  h.search.stop();
});

test("access isolation blocks non-member workspaces, inaccessible workspace docs, and other users' private-folder scripts", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Outsider requesting WS_MAIN -> 403 forbidden
  expect(await h.get(`?q=Tamsin&workspaceId=${WS_MAIN}`, "outsider")).toEqual({
    status: 403,
    body: { error: "forbidden" },
  });
  // Sam requesting WS_OTHER (not a member) -> 403 forbidden
  expect(await h.get(`?q=Tamsin&workspaceId=${WS_OTHER}`, "sam")).toEqual({
    status: 403,
    body: { error: "forbidden" },
  });

  // Sam searching WS_MAIN sees DOC_PUBLIC and DOC_OUTLINE, NEVER DOC_RESTRICTED or DOC_OTHER_WS
  const samMain = await h.get(`?q=Tamsin&workspaceId=${WS_MAIN}`, "sam");
  expect(samMain.status).toBe(200);
  expect(isSearchResponse(samMain.body)).toBe(true);
  const samIds = (samMain.body as SearchResponse).results.map((r) => r.docId);
  expect(samIds.toSorted()).toEqual([DOC_PUBLIC, DOC_OUTLINE].toSorted());

  // Sam palette search (no workspaceId) STILL never sees DOC_RESTRICTED, DOC_OTHER_WS, or DOC_PRIVATE
  const samPalette = await h.get("?q=moonstonevault", "sam");
  expect(samPalette).toEqual({ status: 200, body: { results: [] } });
  const samRestricted = await h.get("?q=ambercloak", "sam");
  expect(samRestricted).toEqual({ status: 200, body: { results: [] } });
  const samOtherWs = await h.get("?q=northern", "sam");
  expect(samOtherWs).toEqual({ status: 200, body: { results: [] } });

  // Dana (owner of DOC_PRIVATE) finds her Private-folder script in palette search (workspaceId: null)
  const danaPriv = await h.get("?q=moonstonevault", "dana");
  expect(danaPriv.status).toBe(200);
  expect(isSearchResponse(danaPriv.body)).toBe(true);
  expect((danaPriv.body as SearchResponse).results).toEqual([
    expect.objectContaining({
      docId: DOC_PRIVATE,
      workspaceId: null,
      title: "Lantern Secret",
      projectTitle: "Dana Private Notebook",
      kind: "script",
    }),
  ]);

  h.search.stop();
});

test("trashed documents are excluded immediately and found again once restored", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Before Trash: Sam finds DOC_PUBLIC
  const before = await h.get(
    `?q=${encodeURIComponent('"the Founding"')}&workspaceId=${WS_MAIN}`,
    "sam",
  );
  expect(before.status).toBe(200);
  expect((before.body as SearchResponse).results.map((r) => r.docId)).toEqual([
    DOC_PUBLIC,
  ]);

  // Put DOC_PUBLIC in Trash
  h.storage.trash.put({
    docId: DOC_PUBLIC,
    workspaceId: WS_MAIN_INDEX,
    home: `project:${PROJ_FILM}`,
    deletedByUserId: "dana",
    deletedAt: 1_000,
    purgeAfter: 2_000_000_000,
  });

  // Immediately excluded from both workspace and palette search
  expect(
    await h.get(
      `?q=${encodeURIComponent('"the Founding"')}&workspaceId=${WS_MAIN}`,
      "sam",
    ),
  ).toEqual({ status: 200, body: { results: [] } });
  expect(
    await h.get(`?q=${encodeURIComponent('"the Founding"')}`, "dana"),
  ).toEqual({ status: 200, body: { results: [] } });

  // Restore DOC_PUBLIC: found again immediately
  h.storage.trash.remove(DOC_PUBLIC);
  const restored = await h.get(
    `?q=${encodeURIComponent('"the Founding"')}&workspaceId=${WS_MAIN}`,
    "sam",
  );
  expect(restored.status).toBe(200);
  expect((restored.body as SearchResponse).results.map((r) => r.docId)).toEqual(
    [DOC_PUBLIC],
  );

  h.search.stop();
});

test("writers-only notes, alternates, and settings are never indexed in viewer-accessible text, and operators filter accurately", async () => {
  const h = createHarness();
  await seedCorpus(h);

  // Notes, alternates, and settings text are NEVER indexed or returned to viewers, editors, or owners
  for (const secret of ["SECRETNOTE42", "SECRETALT99", "SECRETHEADER77"]) {
    for (const userId of ["ana", "sam", "dana"]) {
      expect(
        await h.get(`?q=${secret}&workspaceId=${WS_MAIN}`, userId),
      ).toEqual({ status: 200, body: { results: [] } });
    }
  }

  // Operators: type:outline, type:film, folder:Film (nested match), date range, and unreadable operators (point 31)
  const outlineOnly = await h.get(
    `?q=${encodeURIComponent("Tamsin type:outline")}&workspaceId=${WS_MAIN}`,
    "ana",
  );
  expect(
    (outlineOnly.body as SearchResponse).results.map((r) => r.docId),
  ).toEqual([DOC_OUTLINE]);

  const byParentFolder = await h.get(
    `?q=${encodeURIComponent("Tamsin folder:Film")}&workspaceId=${WS_MAIN}`,
    "ana",
  );
  expect(
    (byParentFolder.body as SearchResponse).results
      .map((r) => r.docId)
      .toSorted(),
  ).toEqual([DOC_PUBLIC, DOC_OUTLINE].toSorted());

  const byDate = await h.get(
    `?q=${encodeURIComponent("Tamsin after:2026-11-18 before:2026-11-22")}&workspaceId=${WS_MAIN}&tz=UTC`,
    "ana",
  );
  expect((byDate.body as SearchResponse).results.map((r) => r.docId)).toEqual([
    DOC_OUTLINE,
  ]);

  // Point 31: unreadable known operators return empty results
  for (const bad of [
    "Tamsin type:poem",
    "Tamsin after:17 Nov",
    "Tamsin folder:NoSuchFolder",
  ]) {
    expect(
      await h.get(
        `?q=${encodeURIComponent(bad)}&workspaceId=${WS_MAIN}`,
        "dana",
      ),
    ).toEqual({ status: 200, body: { results: [] } });
  }

  // Editor-only text partition: viewer (ana) never matches editorText while editor (sam) does
  const existingHead = h.searchIndex.headOf(DOC_PUBLIC)!;
  h.searchIndex.put({
    docId: DOC_PUBLIC,
    workspaceId: WS_MAIN_INDEX,
    kind: "script",
    projectKind: "film",
    title: "Harbour Watch",
    folderIds: ["f-dev", "f-film"],
    changedAt: Date.UTC(2026, 10, 14, 15, 0, 0),
    generation: existingHead.generation,
    seq: existingHead.seq,
    text: "Tamsin Hale walks along the Founding road at dusk.",
    editorText: "EDITORCUTONLY777 deleted beat",
  });
  expect(
    await h.get(`?q=EDITORCUTONLY777&workspaceId=${WS_MAIN}`, "ana"),
  ).toEqual({ status: 200, body: { results: [] } });
  const editorCutHit = await h.get(
    `?q=EDITORCUTONLY777&workspaceId=${WS_MAIN}`,
    "sam",
  );
  expect(
    (editorCutHit.body as SearchResponse).results.map((r) => r.docId),
  ).toEqual([DOC_PUBLIC]);

  h.search.stop();
});
