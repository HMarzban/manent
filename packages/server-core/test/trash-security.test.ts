import { expect, test } from "bun:test";
import { ORIGIN_LOAD, createDoc, jsonMap, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  indexDocId,
  isTrashControlData,
  isTrashListResponse,
  isTrashMoveResponse,
  isTrashRestoreResponse,
  projectHome,
  workspaceHome,
} from "@manent/sync-protocol";
import type { Identity, Message } from "@manent/sync-protocol";
import {
  TRASH_KEEP_MS,
  checkFolderPush,
  checkPrivateIndexPush,
  createLibraryPushHooks,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  createTrashService,
} from "../src/index.ts";
import type {
  Directory,
  ManentServer,
  Room,
  SignInProvider,
  Subscription,
  SyncService,
  TrashService,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const HOST = "localhost:4747";
const ORIGIN = `http://${HOST}`;
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };
const CALLER = { remoteAddress: "127.0.0.1", upgrade: () => false };

const PROJ_A = "11111111-1111-7111-8111-111111111111";
const PROJ_B = "22222222-2222-7222-8222-222222222222";
const PROJ_PRIV = "33333333-3333-7333-8333-333333333333";
const DOC_1 = "aaaa1111-1111-7111-8111-111111111111";
const DOC_2 = "aaaa2222-2222-7222-8222-222222222222";
const DOC_OTHER_WS = "aaaa3333-3333-7333-8333-333333333333";
const DOC_NO_ROLE = "aaaa4444-4444-7444-8444-444444444444";
const DOC_PRIV_FOLDER = "aaaa5555-5555-7555-8555-555555555555";
const DOC_PRIV_COPY = "aaaa6666-6666-7666-8666-666666666666";
const DOC_UNPLACED = "aaaa7777-7777-7777-8777-777777777777";
const DOC_TOMBSTONED = "aaaa8888-8888-7888-8888-888888888888";

const WS_MAIN = "medium";
const WS_OTHER = "heavy";
const WS_MAIN_INDEX = indexDocId("workspace", WS_MAIN);
const WS_OTHER_INDEX = indexDocId("workspace", WS_OTHER);

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "sam", name: "Sam Okafor" },
  { userId: "priya", name: "Priya Nair" },
  { userId: "leo", name: "Leo Novak" },
  { userId: "ana", name: "Ana Costa" },
  { userId: "outsider", name: "Outside User" },
];

const NO_SIGN_IN: SignInProvider = {
  describe: () => ({ choices: [] }),
  authenticate: async () => ({ ok: false, reason: "unknown_user" }),
};

const DIRECTORY: Directory = {
  user: (userId) => PEOPLE.find((p) => p.userId === userId) ?? null,
  workspacesOf: () => [],
};

interface Harness {
  fc: FakeClock;
  storage: MemoryStorage;
  server: ManentServer;
  sync: SyncService;
  trash: TrashService;
  tokens: Record<string, string>;
  post(
    path: string,
    body: unknown,
    userId: string | null,
  ): Promise<{ status: number; body: unknown }>;
  flush(): Promise<void>;
  readDoc(docId: string): CrdtDoc;
}

function createHarness(startMs = 1_700_000_000_000): Harness {
  const fc = fakeClock(startMs);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: () => fc.clock.now(),
  });
  let seq = 0;
  const ids = (): string => `id-${++seq}`;
  let server!: ManentServer;
  const trash = createTrashService({
    storage,
    sync: () => server.sync!,
    clock: fc.clock,
    names: (userId) => DIRECTORY.user(userId)?.name ?? userId,
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
      hooks: [createLibraryPushHooks({ storage })],
    },
    trash,
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

  async function post(
    path: string,
    body: unknown,
    userId: string | null,
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (userId !== null) headers.Authorization = `Bearer ${tokens[userId]}`;
    const pending = server.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      CALLER,
    );
    await flush();
    const response = await pending;
    if (response === null) throw new Error("unexpected upgrade");
    return { status: response.status, body: await response.json() };
  }

  function readDoc(docId: string): CrdtDoc {
    const place = storage.directory.placeOf(docId);
    if (place === null) throw new RangeError(`unplaced ${docId}`);
    const file = storage.open(place.home);
    const row = file.log.get(docId)!;
    const cp = file.checkpoints.newest(docId, row.generation);
    const doc = cp === null ? createDoc() : loadDoc(cp.state);
    for (const entry of file.log.tail(docId, row.generation, cp?.seq ?? 0).rows)
      doc.applyUpdate(entry.update, ORIGIN_LOAD);
    return doc;
  }

  return {
    fc,
    storage,
    server,
    sync: server.sync!,
    trash,
    tokens,
    post,
    flush,
    readDoc,
  };
}

const makeEntry = (projectId: string, title: string) => ({
  projectId,
  title,
  kind: "script",
  createdAt: 1_000,
  editedAt: null,
  editedByUserId: null,
  airDate: null,
  rundownId: null,
  trashedAt: null,
  trashedByUserId: null,
});

async function seedWorkspaceAndDocs(h: Harness): Promise<void> {
  const { sync, storage } = h;
  sync.access.create("dana", {
    docId: WS_MAIN_INDEX,
    kind: "index",
    home: workspaceHome(WS_MAIN),
  });
  storage.directory.setRole(WS_MAIN_INDEX, "sam", "edit", ["delete"]);
  storage.directory.setRole(WS_MAIN_INDEX, "priya", "edit", []);
  storage.directory.setRole(WS_MAIN_INDEX, "leo", "comment", []);
  storage.directory.setRole(WS_MAIN_INDEX, "ana", "view", []);

  sync.access.create("dana", {
    docId: WS_OTHER_INDEX,
    kind: "index",
    home: workspaceHome(WS_OTHER),
  });

  // Main workspace scripts
  sync.access.create("dana", {
    docId: DOC_1,
    kind: "script",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_2,
    kind: "script",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });
  // Script in WS_MAIN where priya/sam/leo/ana have NO role (only dana)
  sync.access.create("dana", {
    docId: DOC_NO_ROLE,
    kind: "script",
    home: projectHome(PROJ_A),
  });
  // Script in WS_OTHER
  sync.access.create("dana", {
    docId: DOC_OTHER_WS,
    kind: "script",
    home: projectHome(PROJ_B),
    workspaceId: WS_OTHER,
  });
  // Tombstoned script
  sync.access.create("dana", {
    docId: DOC_TOMBSTONED,
    kind: "script",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });
  storage.directory.tombstone(DOC_TOMBSTONED, "dana");
  // Dana's private copy (owned by dana only)
  sync.access.create("dana", {
    docId: DOC_PRIV_COPY,
    kind: "private",
    home: "user",
  });
  // Dana's private-folder script (listed only in dana's private index)
  sync.access.create("dana", {
    docId: DOC_PRIV_FOLDER,
    kind: "script",
    home: projectHome(PROJ_PRIV),
  });
  const danaPrivateIndex = indexDocId("user", "dana");
  sync.access.create("dana", {
    docId: danaPrivateIndex,
    kind: "index",
    home: "user",
  });
  const samPrivateIndex = indexDocId("user", "sam");
  sync.access.create("sam", {
    docId: samPrivateIndex,
    kind: "index",
    home: "user",
  });

  const writeWsMain = sync.authorityWrite(WS_MAIN_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "projects").set(PROJ_A, {
        title: "Alpha",
        kind: "film",
        createdAt: 1_000,
        createdByUserId: "dana",
        folderId: null,
      });
      const docs = jsonMap(doc, "documents");
      docs.set(DOC_1, makeEntry(PROJ_A, "First Script"));
      docs.set(DOC_2, makeEntry(PROJ_A, "Second Script"));
      docs.set(DOC_NO_ROLE, makeEntry(PROJ_A, "Restricted Script"));
      return { ok: true };
    },
    inTransaction() {},
  });
  const writeWsOther = sync.authorityWrite(WS_OTHER_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "projects").set(PROJ_B, {
        title: "Beta",
        kind: "film",
        createdAt: 1_000,
        createdByUserId: "dana",
        folderId: null,
      });
      jsonMap(doc, "documents").set(
        DOC_OTHER_WS,
        makeEntry(PROJ_B, "Other Workspace Script"),
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  const writeDanaPriv = sync.authorityWrite(danaPrivateIndex, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "private_folder").set(
        DOC_PRIV_FOLDER,
        makeEntry(PROJ_PRIV, "Dana Private Script"),
      );
      jsonMap(doc, "continue").set(DOC_1, {
        workspaceId: WS_MAIN,
        openedAt: 5_000,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  const writeSamPriv = sync.authorityWrite(samPrivateIndex, {
    userId: "sam",
    origin: "system",
    edit(doc) {
      jsonMap(doc, "continue").set(DOC_1, {
        workspaceId: WS_MAIN,
        openedAt: 6_000,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await Promise.all([writeWsMain, writeWsOther, writeDanaPriv, writeSamPriv]);
}

async function pushAs(
  h: Harness,
  userId: string,
  docId: string,
  clientId: number,
  mutate: (doc: CrdtDoc) => void,
): Promise<Message[]> {
  const peer = fakePeer({ userId, name: userId });
  h.sync.attach(peer);
  h.sync.receive(peer, {
    type: "SUBSCRIBE",
    docId,
    generation: 0,
    mode: "edit",
    clientIds: [clientId],
    lastServerSeq: 0,
  });
  await h.flush();
  peer.take();
  const committed = h.readDoc(docId);
  const local = loadDoc(committed.encodeState(), { clientId });
  committed.destroy();
  const before = local.encodeStateVector();
  mutate(local);
  const update = local.diff(before);
  local.destroy();
  h.sync.receive(peer, {
    type: "PUSH",
    docId,
    generation: 1,
    clientSeq: 1,
    update,
    heal: false,
  });
  await h.flush();
  const replies = peer.take();
  h.sync.detach(peer);
  return replies;
}

test("unauthenticated callers receive 401 on all three Trash routes", async () => {
  const h = createHarness();
  await seedWorkspaceAndDocs(h);
  for (const [path, body] of [
    ["/api/trash/move", { docId: DOC_1 }],
    ["/api/trash/restore", { docId: DOC_1 }],
    ["/api/trash/list", { workspaceId: WS_MAIN }],
  ] as const) {
    expect(await h.post(path, body, null)).toEqual({
      status: 401,
      body: { error: "unauthenticated" },
    });
  }
  h.trash.stop();
});

test("only owners and editors with delete capability can move and restore; others get 403 and invalid targets are refused", async () => {
  const h = createHarness(100_000);
  await seedWorkspaceAndDocs(h);

  // Refusals for unauthorised roles on move
  for (const userId of ["priya", "leo", "ana", "outsider"]) {
    expect(await h.post("/api/trash/move", { docId: DOC_1 }, userId)).toEqual({
      status: 403,
      body: { error: "forbidden" },
    });
  }
  // Index document, unplaced document, tombstoned document, another user's private copy
  expect(
    await h.post("/api/trash/move", { docId: WS_MAIN_INDEX }, "dana"),
  ).toEqual({
    status: 400,
    body: { error: "bad_request" },
  });
  expect(
    await h.post("/api/trash/move", { docId: DOC_UNPLACED }, "dana"),
  ).toEqual({
    status: 404,
    body: { error: "not_found" },
  });
  expect(
    await h.post("/api/trash/move", { docId: DOC_TOMBSTONED }, "dana"),
  ).toEqual({
    status: 410,
    body: { error: "deleted" },
  });
  expect(
    await h.post("/api/trash/move", { docId: DOC_PRIV_COPY }, "sam"),
  ).toEqual({
    status: 403,
    body: { error: "forbidden" },
  });

  // Subscribe a peer on DOC_1 to verify CONTROL trashed / untrashed broadcasts
  const watcher = fakePeer({ userId: "priya", name: "Priya" });
  h.sync.attach(watcher);
  h.sync.receive(watcher, {
    type: "SUBSCRIBE",
    docId: DOC_1,
    generation: 0,
    mode: "edit",
    clientIds: [901],
    lastServerSeq: 0,
  });
  await h.flush();
  watcher.take();

  // Editor WITH delete capability (sam) succeeds
  const moved = await h.post("/api/trash/move", { docId: DOC_1 }, "sam");
  expect(moved.status).toBe(200);
  expect(isTrashMoveResponse(moved.body)).toBe(true);
  expect(moved.body).toEqual({
    docId: DOC_1,
    purgeAfterAt: 100_000 + TRASH_KEEP_MS,
  });

  // CONTROL "trashed" delivered to subscriber
  const trashedMsgs = watcher.take();
  const trashedCtrl = trashedMsgs.find(
    (m): m is Extract<Message, { type: "CONTROL" }> =>
      m.type === "CONTROL" && m.kind === "trashed",
  );
  expect(trashedCtrl).toBeDefined();
  const trashedPayload: unknown = JSON.parse(
    new TextDecoder().decode(trashedCtrl!.data),
  );
  expect(isTrashControlData(trashedPayload)).toBe(true);
  expect(trashedPayload).toEqual({
    userId: "sam",
    at: 100_000,
    purgeAfterAt: 100_000 + TRASH_KEEP_MS,
  });

  // Workspace index holds server-set trashedAt and trashedByUserId
  const wsAfterMove = h.readDoc(WS_MAIN_INDEX);
  expect(jsonMap(wsAfterMove, "documents").get(DOC_1)).toMatchObject({
    trashedAt: 100_000,
    trashedByUserId: "sam",
  });
  wsAfterMove.destroy();

  // Repeat move is idempotent and preserves original purgeAfterAt
  h.fc.advance(60_000);
  const repeatMove = await h.post("/api/trash/move", { docId: DOC_1 }, "dana");
  expect(repeatMove).toEqual({
    status: 200,
    body: { docId: DOC_1, purgeAfterAt: 100_000 + TRASH_KEEP_MS },
  });

  // Unauthorised roles refused on restore
  for (const userId of ["priya", "leo", "ana", "outsider"]) {
    expect(
      await h.post("/api/trash/restore", { docId: DOC_1 }, userId),
    ).toEqual({
      status: 403,
      body: { error: "forbidden" },
    });
  }

  // Owner (dana) restores successfully and broadcasts CONTROL "untrashed"
  const restored = await h.post("/api/trash/restore", { docId: DOC_1 }, "dana");
  expect(restored.status).toBe(200);
  expect(isTrashRestoreResponse(restored.body)).toBe(true);
  expect(restored.body).toEqual({ docId: DOC_1 });

  const untrashedMsgs = watcher.take();
  const untrashedCtrl = untrashedMsgs.find(
    (m): m is Extract<Message, { type: "CONTROL" }> =>
      m.type === "CONTROL" && m.kind === "untrashed",
  );
  expect(untrashedCtrl).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(untrashedCtrl!.data))).toEqual({
    userId: "dana",
    at: 160_000,
    purgeAfterAt: null,
  });
  expect(h.storage.trash.get(DOC_1)).toBeNull();
  const wsAfterRestore = h.readDoc(WS_MAIN_INDEX);
  expect(jsonMap(wsAfterRestore, "documents").get(DOC_1)).toMatchObject({
    trashedAt: null,
    trashedByUserId: null,
  });
  wsAfterRestore.destroy();

  h.sync.detach(watcher);
  h.trash.stop();
});

test("POST /api/trash/list enforces workspace membership and never leaks other workspaces, private folders, or inaccessible docs", async () => {
  const h = createHarness(500_000);
  await seedWorkspaceAndDocs(h);

  // Non-member of workspace gets 403
  expect(
    await h.post("/api/trash/list", { workspaceId: WS_MAIN }, "outsider"),
  ).toEqual({ status: 403, body: { error: "forbidden" } });
  expect(
    await h.post("/api/trash/list", { workspaceId: WS_OTHER }, "sam"),
  ).toEqual({ status: 403, body: { error: "forbidden" } });

  // Trash documents in WS_MAIN (accessible to all), WS_MAIN (only dana has a role), WS_OTHER, and Dana's Private folder
  await h.post("/api/trash/move", { docId: DOC_1 }, "dana");
  h.fc.advance(1_000);
  await h.post("/api/trash/move", { docId: DOC_2 }, "sam");
  h.fc.advance(1_000);
  await h.post("/api/trash/move", { docId: DOC_NO_ROLE }, "dana");
  h.fc.advance(1_000);
  await h.post("/api/trash/move", { docId: DOC_OTHER_WS }, "dana");
  h.fc.advance(1_000);
  await h.post("/api/trash/move", { docId: DOC_PRIV_FOLDER }, "dana");

  // Sam lists WS_MAIN: sees DOC_2 then DOC_1 (newest first), NEVER DOC_NO_ROLE, DOC_OTHER_WS, or DOC_PRIV_FOLDER
  const samList = await h.post(
    "/api/trash/list",
    { workspaceId: WS_MAIN },
    "sam",
  );
  expect(samList.status).toBe(200);
  expect(isTrashListResponse(samList.body)).toBe(true);
  expect(samList.body).toEqual({
    items: [
      {
        docId: DOC_2,
        workspaceId: WS_MAIN,
        title: "Second Script",
        deletedByUserId: "sam",
        deletedByName: "Sam Okafor",
        deletedAt: 501_000,
        purgeAfterAt: 501_000 + TRASH_KEEP_MS,
      },
      {
        docId: DOC_1,
        workspaceId: WS_MAIN,
        title: "First Script",
        deletedByUserId: "dana",
        deletedByName: "Dana Reyes",
        deletedAt: 500_000,
        purgeAfterAt: 500_000 + TRASH_KEEP_MS,
      },
    ],
  });

  // Dana lists WS_MAIN: sees DOC_NO_ROLE, DOC_2, DOC_1 — still NEVER DOC_OTHER_WS or DOC_PRIV_FOLDER
  const danaList = await h.post(
    "/api/trash/list",
    { workspaceId: WS_MAIN },
    "dana",
  );
  expect(danaList.status).toBe(200);
  const danaItems = (danaList.body as { items: { docId: string }[] }).items;
  expect(danaItems.map((item) => item.docId)).toEqual([
    DOC_NO_ROLE,
    DOC_2,
    DOC_1,
  ]);
  h.trash.stop();
});

test("workspace and private index push rules refuse trash forgery, folder parentId mutation, invalid folder refs, non-writer folder writes and bad private shapes", async () => {
  const h = createHarness(200_000);
  await seedWorkspaceAndDocs(h);

  // Move DOC_1 to Trash via authority so WS_MAIN_INDEX holds a real trashed document
  expect(
    (await h.post("/api/trash/move", { docId: DOC_1 }, "dana")).status,
  ).toBe(200);

  // 1. Valid client push modifying an unrelated non-trashed document succeeds (zero false positives)
  const okDocPush = await pushAs(h, "dana", WS_MAIN_INDEX, 301, (doc) => {
    const docs = jsonMap(doc, "documents");
    const entry = docs.get(DOC_2) as Record<string, unknown>;
    docs.set(DOC_2, { ...entry, title: "Renamed Script" });
  });
  expect(okDocPush.some((m) => m.type === "ACK")).toBe(true);

  // 2. Client push attempting to forge trashedAt on a new document entry is refused 4422
  const forgeNew = await pushAs(h, "dana", WS_MAIN_INDEX, 302, (doc) => {
    jsonMap(doc, "documents").set(DOC_UNPLACED, {
      projectId: PROJ_A,
      title: "Forged",
      kind: "script",
      createdAt: 1_000,
      editedAt: null,
      editedByUserId: null,
      airDate: null,
      rundownId: null,
      trashedAt: 123_456,
      trashedByUserId: "dana",
    });
  });
  expect(forgeNew).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // 3. Client push attempting to clear trashedAt on DOC_1 is refused 4422
  const clearTrash = await pushAs(h, "dana", WS_MAIN_INDEX, 303, (doc) => {
    const docs = jsonMap(doc, "documents");
    const entry = docs.get(DOC_1) as Record<string, unknown>;
    docs.set(DOC_1, { ...entry, trashedAt: null, trashedByUserId: null });
  });
  expect(clearTrash).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // 4. Client push attempting to delete trashed DOC_1 from documents map is refused 4422
  const deleteTrashed = await pushAs(h, "dana", WS_MAIN_INDEX, 304, (doc) => {
    jsonMap(doc, "documents").delete(DOC_1);
  });
  expect(deleteTrashed).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // 5. Valid folder creation (root + nested child) and project move into valid folder succeed
  const createFolders = await pushAs(h, "dana", WS_MAIN_INDEX, 305, (doc) => {
    const folders = jsonMap(doc, "folders");
    folders.set("f-root", {
      name: "Film",
      parentId: null,
      createdAt: 200_000,
      createdByUserId: "dana",
    });
    folders.set("f-child", {
      name: "Development",
      parentId: "f-root",
      createdAt: 200_001,
      createdByUserId: "dana",
    });
    jsonMap(doc, "projects").set(PROJ_A, {
      title: "Alpha",
      kind: "film",
      createdAt: 1_000,
      createdByUserId: "dana",
      folderId: "f-child",
    });
  });
  expect(createFolders.some((m) => m.type === "ACK")).toBe(true);

  // 6. Mutating an existing folder's parentId is refused 4422
  const reparent = await pushAs(h, "dana", WS_MAIN_INDEX, 306, (doc) => {
    const folders = jsonMap(doc, "folders");
    folders.set("f-child", {
      name: "Development",
      parentId: null,
      createdAt: 200_001,
      createdByUserId: "dana",
    });
  });
  expect(reparent).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // 7. Assigning a project to a nonexistent folderId is refused 4422
  const badFolderRef = await pushAs(h, "dana", WS_MAIN_INDEX, 307, (doc) => {
    jsonMap(doc, "projects").set(PROJ_A, {
      title: "Alpha",
      kind: "film",
      createdAt: 1_000,
      createdByUserId: "dana",
      folderId: "f-missing",
    });
  });
  expect(badFolderRef).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // 8. Viewer or commenter writing folders is refused with code "not_index"
  const wsDoc = h.readDoc(WS_MAIN_INDEX);
  const fakeRoom = {
    docId: WS_MAIN_INDEX,
    home: { kind: "project", id: WS_MAIN_INDEX },
    kind: "index",
    doc: wsDoc,
  } as unknown as Room;
  const fakeReport = {
    maps: ["folders"],
    before: () => undefined,
    update: new Uint8Array(),
  } as unknown as Parameters<typeof checkFolderPush>[1];
  for (const role of ["view", "comment"] as const) {
    const sub = {
      access: { role, capabilities: [] },
    } as unknown as Subscription;
    const issues = checkFolderPush(fakeRoom, fakeReport, sub, h.storage);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.code === "not_index")).toBe(true);
  }
  wsDoc.destroy();

  // 9. Private index rejects malformed favourites and private_folder entries, accepts valid ones
  const danaPriv = indexDocId("user", "dana");
  const badFav = await pushAs(h, "dana", danaPriv, 308, (doc) => {
    jsonMap(doc, "favourites").set(PROJ_A, {
      kind: "folder",
      workspaceId: "",
      favouritedAt: "soon",
    });
  });
  expect(badFav).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  const goodPriv = await pushAs(h, "dana", danaPriv, 309, (doc) => {
    jsonMap(doc, "favourites").set(PROJ_A, {
      kind: "project",
      workspaceId: WS_MAIN,
      favouritedAt: 200_100,
    });
    jsonMap(doc, "private_folder").set(PROJ_PRIV, {
      title: "My Ideas",
      kind: "film",
      createdAt: 200_100,
      createdByUserId: "dana",
      folderId: null,
    });
  });
  expect(goodPriv.some((m) => m.type === "ACK")).toBe(true);

  h.trash.stop();
});

test("sweep tombstones due documents, cleans up workspace and continue indexes, and leaves non-due documents untouched", async () => {
  const h = createHarness(1_000_000);
  await seedWorkspaceAndDocs(h);

  // Move DOC_1 at t = 1_000_000, and DOC_2 one day later
  await h.post("/api/trash/move", { docId: DOC_1 }, "dana");
  h.fc.advance(86_400_000);
  await h.post("/api/trash/move", { docId: DOC_2 }, "sam");

  // Sweep right when DOC_1 is due (30 days after t = 1_000_000), while DOC_2 still has 1 day left
  const dueAt = 1_000_000 + TRASH_KEEP_MS;
  const sweepRun = h.trash.sweep(dueAt);
  await h.flush();
  expect(await sweepRun).toBe(1);

  // DOC_1 is tombstoned and removed from Trash, WS_MAIN_INDEX documents, and holders' continue maps
  expect(h.storage.directory.tombstoneOf(DOC_1)).toMatchObject({
    deletedByUserId: "dana",
  });
  expect(h.storage.trash.get(DOC_1)).toBeNull();

  const wsDoc = h.readDoc(WS_MAIN_INDEX);
  expect(jsonMap(wsDoc, "documents").get(DOC_1)).toBeNull();
  expect(jsonMap(wsDoc, "documents").get(DOC_2)).not.toBeNull();
  wsDoc.destroy();

  const danaPriv = h.readDoc(indexDocId("user", "dana"));
  expect(jsonMap(danaPriv, "continue").get(DOC_1)).toBeNull();
  danaPriv.destroy();

  const samPriv = h.readDoc(indexDocId("user", "sam"));
  expect(jsonMap(samPriv, "continue").get(DOC_1)).toBeNull();
  samPriv.destroy();

  // DOC_2 is untouched: still in Trash, not tombstoned
  expect(h.storage.directory.tombstoneOf(DOC_2)).toBeNull();
  expect(h.storage.trash.get(DOC_2)).not.toBeNull();

  h.trash.stop();
});

test("cross-workspace bait in another workspace never hijacks Trash workspace resolution or leaks Private-folder docs", async () => {
  const h = createHarness(300_000);
  await seedWorkspaceAndDocs(h);

  // Outsider owns a separate workspace where Dana has no access at all, and also acts as editor in WS_OTHER
  const WS_BAIT = "bait";
  const WS_BAIT_INDEX = indexDocId("workspace", WS_BAIT);
  h.sync.access.create("outsider", {
    docId: WS_BAIT_INDEX,
    kind: "index",
    home: workspaceHome(WS_BAIT),
  });
  h.storage.directory.setRole(WS_OTHER_INDEX, "outsider", "edit", []);

  // Attacker plants forged entries for Dana's Private-folder doc AND WS_MAIN's DOC_1 in both WS_BAIT and WS_OTHER
  for (const [indexId, clientId] of [
    [WS_BAIT_INDEX, 401],
    [WS_OTHER_INDEX, 402],
  ] as const) {
    const planted = await pushAs(h, "outsider", indexId, clientId, (doc) => {
      jsonMap(doc, "projects").set(PROJ_PRIV, {
        title: "Forged Priv",
        kind: "film",
        createdAt: 1_000,
        createdByUserId: "outsider",
        folderId: null,
      });
      jsonMap(doc, "projects").set(PROJ_A, {
        title: "Forged Alpha",
        kind: "film",
        createdAt: 1_000,
        createdByUserId: "outsider",
        folderId: null,
      });
      const docs = jsonMap(doc, "documents");
      docs.set(DOC_PRIV_FOLDER, makeEntry(PROJ_PRIV, "Bait Private"));
      docs.set(DOC_1, makeEntry(PROJ_A, "Bait Doc 1"));
    });
    expect(planted.some((m) => m.type === "ACK")).toBe(true);
  }

  // Dana trashes her Private-folder doc: must stay private (workspaceId === ""), update Dana's private_folder, never touch WS_BAIT or WS_OTHER
  const privMoved = await h.post(
    "/api/trash/move",
    { docId: DOC_PRIV_FOLDER },
    "dana",
  );
  expect(privMoved.status).toBe(200);
  expect(h.storage.trash.get(DOC_PRIV_FOLDER)?.workspaceId).toBe("");

  const danaPriv = h.readDoc(indexDocId("user", "dana"));
  expect(
    jsonMap(danaPriv, "private_folder").get(DOC_PRIV_FOLDER),
  ).toMatchObject({ trashedAt: 300_000, trashedByUserId: "dana" });
  danaPriv.destroy();

  // Dana trashes DOC_1: must resolve to WS_MAIN_INDEX, never WS_BAIT_INDEX or WS_OTHER_INDEX
  const doc1Moved = await h.post("/api/trash/move", { docId: DOC_1 }, "dana");
  expect(doc1Moved.status).toBe(200);
  expect(h.storage.trash.get(DOC_1)?.workspaceId).toBe(WS_MAIN_INDEX);

  const wsMain = h.readDoc(WS_MAIN_INDEX);
  expect(jsonMap(wsMain, "documents").get(DOC_1)).toMatchObject({
    trashedAt: 300_000,
    trashedByUserId: "dana",
  });
  wsMain.destroy();

  for (const baitIndex of [WS_BAIT_INDEX, WS_OTHER_INDEX]) {
    const baitDoc = h.readDoc(baitIndex);
    const docs = jsonMap(baitDoc, "documents");
    expect(docs.get(DOC_PRIV_FOLDER)).toMatchObject({
      trashedAt: null,
      trashedByUserId: null,
    });
    expect(docs.get(DOC_1)).toMatchObject({
      trashedAt: null,
      trashedByUserId: null,
    });
    baitDoc.destroy();
  }

  // Outsider listing WS_BAIT or WS_OTHER Trash sees nothing from Dana
  expect(
    await h.post("/api/trash/list", { workspaceId: WS_BAIT }, "outsider"),
  ).toEqual({ status: 200, body: { items: [] } });
  expect(
    await h.post("/api/trash/list", { workspaceId: WS_OTHER }, "outsider"),
  ).toEqual({ status: 200, body: { items: [] } });

  h.trash.stop();
});

test("insert-delete-reinsert trash-field forgery is refused on both private and workspace indexes and fails closed without storage", async () => {
  const h = createHarness(400_000);
  await seedWorkspaceAndDocs(h);

  const danaPriv = indexDocId("user", "dana");
  const REINSERT_PRIV = "bbbb1111-1111-7111-8111-111111111111";
  const REINSERT_WS = "bbbb2222-2222-7222-8222-222222222222";

  // 1. Private folder: insert -> delete -> re-insert with forged trashedAt/trashedByUserId
  const p1 = await pushAs(h, "dana", danaPriv, 501, (doc) => {
    jsonMap(doc, "private_folder").set(
      REINSERT_PRIV,
      makeEntry(PROJ_PRIV, "Transient Private"),
    );
  });
  expect(p1.some((m) => m.type === "ACK")).toBe(true);

  const p2 = await pushAs(h, "dana", danaPriv, 502, (doc) => {
    jsonMap(doc, "private_folder").delete(REINSERT_PRIV);
  });
  expect(p2.some((m) => m.type === "ACK")).toBe(true);

  const p3 = await pushAs(h, "dana", danaPriv, 503, (doc) => {
    jsonMap(doc, "private_folder").set(REINSERT_PRIV, {
      ...makeEntry(PROJ_PRIV, "Forged Private"),
      trashedAt: 999_999,
      trashedByUserId: "forged",
    });
  });
  expect(p3).toEqual([expect.objectContaining({ type: "ERROR", code: 4422 })]);

  // 2. Workspace index: insert -> delete -> re-insert with forged trashedAt/trashedByUserId
  const w1 = await pushAs(h, "dana", WS_MAIN_INDEX, 504, (doc) => {
    jsonMap(doc, "documents").set(
      REINSERT_WS,
      makeEntry(PROJ_A, "Transient Workspace"),
    );
  });
  expect(w1.some((m) => m.type === "ACK")).toBe(true);

  const w2 = await pushAs(h, "dana", WS_MAIN_INDEX, 505, (doc) => {
    jsonMap(doc, "documents").delete(REINSERT_WS);
  });
  expect(w2.some((m) => m.type === "ACK")).toBe(true);

  const w3 = await pushAs(h, "dana", WS_MAIN_INDEX, 506, (doc) => {
    jsonMap(doc, "documents").set(REINSERT_WS, {
      ...makeEntry(PROJ_A, "Forged Workspace"),
      trashedAt: 999_999,
      trashedByUserId: "forged",
    });
  });
  expect(w3).toEqual([expect.objectContaining({ type: "ERROR", code: 4422 })]);

  // 3. Direct push-rule calls fail closed when storage is omitted and trashed fields are non-null with prev === undefined
  const wsDoc = createDoc();
  jsonMap(wsDoc, "documents").set(REINSERT_WS, {
    ...makeEntry(PROJ_A, "Forged Workspace"),
    trashedAt: 999_999,
    trashedByUserId: "forged",
  });
  const wsIssues = checkFolderPush(
    {
      docId: WS_MAIN_INDEX,
      home: { kind: "project", id: WS_MAIN_INDEX },
      kind: "index",
      doc: wsDoc,
    } as unknown as Room,
    {
      maps: ["documents"],
      before: () => undefined,
      update: new Uint8Array(),
    } as unknown as Parameters<typeof checkFolderPush>[1],
    undefined,
    undefined,
  );
  expect(wsIssues.length).toBeGreaterThan(0);
  wsDoc.destroy();

  const privDoc = createDoc();
  jsonMap(privDoc, "private_folder").set(REINSERT_PRIV, {
    ...makeEntry(PROJ_PRIV, "Forged Private"),
    trashedAt: 999_999,
    trashedByUserId: "forged",
  });
  const privIssues = checkPrivateIndexPush(
    {
      docId: danaPriv,
      home: { kind: "user", id: "dana" },
      kind: "index",
      doc: privDoc,
    } as unknown as Room,
    {
      maps: ["private_folder"],
      before: () => undefined,
      update: new Uint8Array(),
    } as unknown as Parameters<typeof checkPrivateIndexPush>[1],
    undefined,
    undefined,
  );
  expect(privIssues.length).toBeGreaterThan(0);
  privDoc.destroy();

  h.trash.stop();
});
