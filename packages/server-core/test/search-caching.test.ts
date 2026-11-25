import { expect, test } from "bun:test";
import { jsonMap, scriptBody } from "@manent/crdt";
import { openSqliteSearchIndex } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import { indexDocId, projectHome, workspaceHome } from "@manent/sync-protocol";
import type { Identity, WorkspaceRef } from "@manent/sync-protocol";
import {
  createSearchService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "../src/index.ts";
import type { Directory, ManentServer, SignInProvider } from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";

const HOST = "localhost:4747";
const ORIGIN = `http://${HOST}`;
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };
const WS = "medium";
const WS_INDEX = indexDocId("workspace", WS);
const USER_INDEX = indexDocId("user", "sam");
const PROJ = "11111111-1111-7111-8111-111111111111";
const DOC = "aaaa1111-1111-7111-8111-111111111111";

const PEOPLE: readonly Identity[] = [{ userId: "sam", name: "Sam Okafor" }];
const WORKSPACES: readonly WorkspaceRef[] = [
  { id: WS, name: "Writers' room", seeding: null },
];
const DIRECTORY: Directory = {
  user: (id) => PEOPLE.find((p) => p.userId === id) ?? null,
  workspacesOf: (id) => (id === "sam" ? WORKSPACES : []),
};
const NO_SIGN_IN: SignInProvider = {
  describe: () => ({ choices: [] }),
  authenticate: async () => ({ ok: false, reason: "unknown_user" }),
};

function makeHarness(catchUpDebounceMs = 0) {
  const fc = fakeClock(1_763_000_000_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const searchIndex = openSqliteSearchIndex({ path: ":memory:" });
  let seq = 0;
  let server!: ManentServer;
  const search = createSearchService({
    storage,
    sync: () => server.sync!,
    clock: fc.clock,
    searchIndex,
    scheduleCatchUp: true,
    catchUpDebounceMs,
  });
  server = createServer({
    http: { allowedHosts: [HOST], openUrl: ORIGIN, webDir: null },
    auth: {
      signIn: NO_SIGN_IN,
      directory: DIRECTORY,
      sessions: createSignedSessionStore({
        secret: new Uint8Array(32).fill(5),
        now: () => fc.clock.now(),
      }),
    },
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
      ids: () => `id-${++seq}`,
      hooks: [search.hooks],
    },
    search,
  });
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      fc.runDeferred();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return { fc, storage, searchIndex, search, sync: server.sync!, flush };
}

test("private-index continue writes skip catch-up while private_folder writes trigger it", async () => {
  const h = makeHarness(0);
  const privHome = { kind: "user", id: "sam" } as const;
  h.storage.directory.place(USER_INDEX, privHome, "index", "sam");
  h.storage.directory.setRole(USER_INDEX, "sam", "owner", []);
  h.storage.open(privHome).log.create({
    id: USER_INDEX,
    kind: "index",
    ownerUserId: "sam",
    schemaVersion: 1,
    engineVersion: null,
  });

  // Drain initial startup catch-up
  for (let i = 0; i < 4; i++) h.fc.advance(1);

  // Place a new private script without indexing it yet
  const projHome = { kind: "project", id: PROJ } as const;
  h.storage.directory.place(DOC, projHome, "script", "sam");
  h.storage.directory.setRole(DOC, "sam", "owner", []);
  h.storage.open(projHome).log.create({
    id: DOC,
    kind: "script",
    ownerUserId: "sam",
    schemaVersion: 1,
    engineVersion: 1,
  });
  const writeDoc = h.sync.authorityWrite(DOC, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-000000000001", type: "action" },
            content: [{ type: "text", text: "Lantern glow on the pier." }],
          },
        ]),
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await writeDoc;

  // Commit to `continue` on Sam's private index must NOT trigger catch-up
  const cont = h.sync.authorityWrite(USER_INDEX, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "continue").set(DOC, { openedAt: h.fc.clock.now() });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await cont;
  for (let i = 0; i < 8; i++) h.fc.advance(1);
  expect(h.searchIndex.headOf(DOC)).toBeNull();

  // Commit to `private_folder` DOES trigger catch-up
  const pf = h.sync.authorityWrite(USER_INDEX, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "private_folder").set(PROJ, {
        title: "Solo",
        kind: "film",
      });
      jsonMap(doc, "private_folder").set(DOC, {
        projectId: PROJ,
        title: "Pier Draft",
        kind: "script",
        createdAt: 100,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await pf;
  for (let i = 0; i < 8; i++) h.fc.advance(1);
  expect(h.searchIndex.headOf(DOC)).not.toBeNull();
  h.search.stop();
});

test("debounced catch-up waits for the debounce window and caches workspace metadata by headSeq", async () => {
  const h = makeHarness(2_000);
  h.sync.access.create("sam", {
    docId: WS_INDEX,
    kind: "index",
    home: workspaceHome(WS),
  });
  h.sync.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: projectHome(PROJ),
  });
  // Drain startup catch-up
  for (let i = 0; i < 4; i++) h.fc.advance(1);

  const editScript = h.sync.authorityWrite(DOC, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-000000000002", type: "action" },
            content: [{ type: "text", text: "Seagulls wheel overhead." }],
          },
        ]),
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await editScript;

  // Write to workspace index: debounced for 2000 ms
  const wsWrite = h.sync.authorityWrite(WS_INDEX, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "projects").set(PROJ, {
        title: "Harbour",
        kind: "film",
        folderId: null,
      });
      jsonMap(doc, "documents").set(DOC, {
        projectId: PROJ,
        title: "First Draft",
        kind: "script",
        createdAt: 100,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await wsWrite;

  // Before 2000 ms, catch-up has not yet refreshed the doc past its initial seq 0
  h.fc.advance(1_500);
  expect(h.searchIndex.headOf(DOC)).toEqual({ generation: 1, seq: 0 });

  // After 2000 ms + step ticks, catch-up indexes the new content at seq 1
  h.fc.advance(500);
  for (let i = 0; i < 4; i++) h.fc.advance(1);
  expect(h.searchIndex.headOf(DOC)).toEqual({ generation: 1, seq: 1 });

  // Count workspace index log.tail reads across repeated searches at the same headSeq
  const wsFile = h.storage.open({ kind: "project", id: WS_INDEX });
  const originalTail = wsFile.log.tail.bind(wsFile.log);
  let tailReads = 0;
  wsFile.log.tail = (...args) => {
    tailReads += 1;
    return originalTail(...args);
  };

  const first = h.search.search("sam", {
    q: "Seagulls",
    workspaceId: WS,
    knownWorkspaces: [WS],
  });
  const second = h.search.search("sam", {
    q: "Seagulls",
    workspaceId: WS,
    knownWorkspaces: [WS],
  });
  expect(first.ok && first.value.results.map((r) => r.title)).toEqual([
    "First Draft",
  ]);
  expect(second.ok && second.value.results.map((r) => r.title)).toEqual([
    "First Draft",
  ]);
  // Already cached from catch-up above: zero extra Yjs decodes
  expect(tailReads).toBe(0);

  // Advance headSeq via rename: cache invalidates and returns new title
  const rename = h.sync.authorityWrite(WS_INDEX, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "documents").set(DOC, {
        projectId: PROJ,
        title: "Second Draft",
        kind: "script",
        createdAt: 100,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await rename;

  const afterRename = h.search.search("sam", {
    q: "Seagulls",
    workspaceId: WS,
    knownWorkspaces: [WS],
  });
  expect(
    afterRename.ok && afterRename.value.results.map((r) => r.title),
  ).toEqual(["Second Draft"]);
  expect(tailReads).toBe(1);
  h.search.stop();
});

test("steady workspace index writes never starve search catch-up past the maximum wait", async () => {
  const h = makeHarness(2_000);
  h.sync.access.create("sam", {
    docId: WS_INDEX,
    kind: "index",
    home: workspaceHome(WS),
  });
  h.sync.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: projectHome(PROJ),
  });
  for (let i = 0; i < 4; i++) h.fc.advance(1);

  const editScript = h.sync.authorityWrite(DOC, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: "blk-000000000003", type: "action" },
            content: [{ type: "text", text: "Foghorn echoes across the bay." }],
          },
        ]),
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await editScript;

  // Write to the workspace index every 1000 ms (faster than the 2000 ms debounce)
  for (let i = 0; i <= 10; i++) {
    const wsWrite = h.sync.authorityWrite(WS_INDEX, {
      userId: "sam",
      origin: "system",
      edit(doc) {
        jsonMap(doc, "projects").set(PROJ, {
          title: "Harbour",
          kind: "film",
          folderId: null,
        });
        jsonMap(doc, "documents").set(DOC, {
          projectId: PROJ,
          title: `Draft ${i}`,
          kind: "script",
          createdAt: 100,
        });
        return { ok: true };
      },
      inTransaction() {},
    });
    await h.flush();
    await wsWrite;
    h.fc.advance(1_000);
  }
  for (let i = 0; i < 4; i++) h.fc.advance(1);
  expect(h.searchIndex.headOf(DOC)).toEqual({ generation: 1, seq: 1 });
  h.search.stop();
});
