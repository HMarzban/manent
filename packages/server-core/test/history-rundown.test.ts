import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  moveRows,
  readRundown,
  removeRows,
  restoreCell,
  setCell,
  setRundownFields,
  writeDurations,
  writePrompterState,
} from "@manent/crdt";
import { NEWS_COLUMNS, SHOW_COLUMNS } from "@manent/schema";
import type { PrompterStateJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { VersionContentResponse, VersionSet } from "@manent/sync-protocol";
import {
  createHistoryService,
  createServer,
  createSyncService,
  liveChunkHashes,
  readSnapshot,
} from "../src/index.ts";
import type {
  HistoryService,
  ManentServer,
  SyncService,
} from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";

const T0 = 1_811_808_000_000;
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const STORY_DOC = "33333333-3333-7333-8333-333333333333";
const HOME = { kind: "project", id: PROJECT } as const;
const HOME_STR = `project:${PROJECT}`;
const R1 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c701";
const R2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c702";
const R3 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c703";
const R4 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c704";

const key = (n: number): string => n.toString(16).padStart(32, "0");

const PROMPTER_ON: PrompterStateJSON = {
  state: "on",
  versionId: "pv-1",
  sentAt: T0 + 1_000,
  sentByUserId: "sam",
};

function setupWorld() {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `ver-${String(++made).padStart(4, "0")}`;
  let sync!: SyncService;
  const history: HistoryService = createHistoryService({
    sync: () => sync,
    storage,
    clock: clock.clock,
    ids,
  });
  sync = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [history],
  });

  sync.access.create("sam", {
    docId: RUNDOWN,
    kind: "rundown",
    home: HOME_STR,
  });
  storage.directory.setRole(RUNDOWN, "sam", "owner", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "dana", "edit", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "priya", "edit", []);
  storage.directory.setRole(RUNDOWN, "leo", "view", []);

  const doc = createDoc({ clientId: 101 });
  initRundown(
    doc,
    {
      airDate: "2026-11-26",
      airAt: T0 + 3_600_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    NEWS_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: R1, kind: "item", docId: null, blockId: null },
      { id: R2, kind: "script", docId: STORY_DOC, blockId: null },
      { id: R3, kind: "item", docId: null, blockId: null },
    ],
    null,
  );
  setCell(doc, R1, "story", "Cold open", { userId: "sam", now: () => T0 + 10 });
  setCell(doc, R2, "story", "Top headline", {
    userId: "sam",
    now: () => T0 + 20,
  });
  setCell(doc, R3, "story", "Weather", { userId: "sam", now: () => T0 + 30 });
  const file = storage.open(HOME);
  file.log.append({
    docId: RUNDOWN,
    generation: 1,
    userId: "sam",
    update: doc.encodeState(),
    origin: "edit",
    clocks: [{ clientId: 101, clock: 1 }],
  });
  doc.destroy();

  const finish = <T>(promise: Promise<T>): Promise<T> => {
    clock.runDeferred();
    return promise;
  };

  async function editRundown(
    userId: string,
    mutate: (d: ReturnType<typeof createDoc>) => void,
    origin: "restore" | "system" = "system",
  ) {
    const res = await finish(
      sync.authorityWrite(RUNDOWN, {
        userId,
        origin,
        edit(d) {
          mutate(d);
          return { ok: true };
        },
        inTransaction() {},
      }),
    );
    expect(res.ok).toBe(true);
    return res;
  }

  async function currentRundown() {
    const row = file.log.get(RUNDOWN)!;
    const content = await history.content("sam", RUNDOWN, {
      position: { generation: row.generation, seq: row.headSeq },
    });
    expect(content.ok).toBe(true);
    if (!content.ok || content.value.content.rundown === undefined)
      throw new Error("expected rundown content");
    return content.value.content.rundown;
  }

  return {
    clock,
    storage,
    sync,
    history,
    file,
    finish,
    editRundown,
    currentRundown,
  };
}

test("named rundown snapshot round-trips via rundownChunk and stays protected from GC", async () => {
  const { history, file, finish, editRundown } = setupWorld();
  await editRundown(
    "system",
    (d) => {
      writeDurations(d, new Map([[R2, 45_000]]));
      writePrompterState(d, R2, PROMPTER_ON);
    },
    "system",
  );

  const named = await finish(
    history.name("sam", {
      docId: RUNDOWN,
      key: key(1),
      name: "Rehearsal 1",
      fromVersionId: null,
    }),
  );
  expect(named.ok).toBe(true);
  if (!named.ok) throw new Error("expected named version");
  const versionId = named.value.version.id;
  expect(named.value.version.summary).toEqual({
    authorUserIds: ["sam"],
    changes: 7, // 3 rows + 3 changed broadcast fields + columns from empty baseline
    scenes: 0,
  });

  const snap = file.history.snapshotOf(versionId);
  expect(snap).not.toBeNull();
  const read = readSnapshot(file, snap!.ref);
  expect(read.blocks).toEqual([]);
  expect(read.rundown?.rows.map((r) => r.id)).toEqual([R1, R2, R3]);
  expect(read.rundown?.rows[1]?.durationMs).toBe(45_000);
  expect(read.rundown?.rows[1]?.prompter).toEqual(PROMPTER_ON);

  // liveChunkHashes includes manifest + rundownChunk -> maintain keeps them both
  const live = liveChunkHashes(file, RUNDOWN);
  expect(live.size).toBe(2);
  history.maintain(RUNDOWN);
  expect(readSnapshot(file, snap!.ref).rundown?.rows).toHaveLength(3);

  // Removing the version makes its manifest & rundownChunk eligible for sweep
  file.history.remove([versionId]);
  expect(liveChunkHashes(file, RUNDOWN).size).toBe(0);
  history.maintain(RUNDOWN);
  expect(file.history.chunkHashes()).toHaveLength(0);
});

test("summaries ignore server-only durationMs/prompter and attribution tracks per-row/cell writers and changedSince", async () => {
  const { clock, history, file, finish, editRundown } = setupWorld();

  const v1 = await finish(
    history.save("sam", { docId: RUNDOWN, key: key(1), kind: "saved" }),
  );
  expect(v1.ok).toBe(true);
  if (!v1.ok) throw new Error("expected v1");
  const pos1 = v1.value.version.position!;

  // Server-only write changes nothing user-editable -> since() reports 0 changes
  await editRundown(
    "system",
    (d) => {
      writeDurations(d, new Map([[R2, 90_000]]));
      writePrompterState(d, R2, PROMPTER_ON);
    },
    "system",
  );
  const afterSystem = await history.since("leo", RUNDOWN, pos1);
  expect(afterSystem).toEqual({
    ok: true,
    value: { changes: 0, authorUserIds: [] },
  });

  // Dana edits R2's story cell and reorders R3 to top
  clock.advance(5_000);
  await editRundown("dana", (d) => {
    setCell(d, R2, "story", "Breaking lead", {
      userId: "dana",
      now: () => clock.clock.now(),
    });
    moveRows(d, [R3], null);
  });

  const v2 = await finish(
    history.save("dana", { docId: RUNDOWN, key: key(2), kind: "saved" }),
  );
  expect(v2.ok).toBe(true);
  if (!v2.ok) throw new Error("expected v2");
  // R2 changed + R3 moved = 2 row changes (LIS keeps R1, R2 staying!)
  expect(v2.value.version.summary).toEqual({
    authorUserIds: ["system", "dana"],
    changes: 2,
    scenes: 0,
  });

  // whoWrote on rowId and rowId:columnId returns exact ADR 0052 previous value
  const whoCell = await history.whoWrote("leo", RUNDOWN, `${R2}:story`);
  expect(whoCell).toEqual({
    ok: true,
    value: {
      userId: "dana",
      at: clock.clock.now(),
      previous: "Top headline",
      exact: true,
    },
  });
  const whoRow = await history.whoWrote("leo", RUNDOWN, R2);
  expect(whoRow.ok).toBe(true);
  if (whoRow.ok) {
    expect(whoRow.value.userId).toBe("dana");
    expect(whoRow.value.previous).toBe("Top headline");
  }

  // authors() reports dana for R2 & R3 after v1, and nothing for untouched R1
  const authors = await history.authors("leo", {
    docId: RUNDOWN,
    since: { versionId: v1.value.version.id },
    blockIds: [R1, R2, R3],
  });
  expect(authors).toEqual({
    ok: true,
    value: { authors: { [R2]: "dana", [R3]: "dana" } },
  });

  // changedSince() for leo sees dana's 2 row changes; for dana herself it sees 0
  expect(await history.since("leo", RUNDOWN, pos1)).toEqual({
    ok: true,
    value: { changes: 2, authorUserIds: ["dana"] },
  });
  expect(await history.since("dana", RUNDOWN, pos1)).toEqual({
    ok: true,
    value: { changes: 0, authorUserIds: [] },
  });
  expect(file.history.summary(v2.value.version.id)?.blockIds).toEqual([R3, R2]);
});

test("whole-rundown and single-row restore run atomically with pre_restore, preserving durationMs, prompter and cell.previous", async () => {
  const { clock, history, finish, editRundown, currentRundown } = setupWorld();

  // Save baseline v1: [R1 "Cold open", R2 "Top headline", R3 "Weather"]
  const v1 = await finish(
    history.name("sam", {
      docId: RUNDOWN,
      key: key(1),
      name: "Lock 1",
      fromVersionId: null,
    }),
  );
  expect(v1.ok).toBe(true);
  if (!v1.ok) throw new Error("expected v1");
  const v1Id = v1.value.version.id;

  // Mutate rundown: edit R1 & R2, remove R3, add R4, reorder, change targetMs, and write live server durationMs/prompter
  clock.advance(10_000);
  await editRundown("dana", (d) => {
    setRundownFields(d, { targetMs: 2_400_000 });
    setCell(d, R1, "story", "Cold open v2", {
      userId: "dana",
      now: () => clock.clock.now(),
    });
    setCell(d, R2, "story", "Top headline v2", {
      userId: "dana",
      now: () => clock.clock.now(),
    });
    removeRows(d, [R3]);
    insertRows(d, [{ id: R4, kind: "item", docId: null, blockId: null }], R2);
    moveRows(d, [R2], null);
  });
  await editRundown(
    "system",
    (d) => {
      writeDurations(
        d,
        new Map([
          [R1, 22_000],
          [R2, 77_000],
        ]),
      );
      writePrompterState(d, R2, PROMPTER_ON);
    },
    "system",
  );

  // 1) Single-row restore of R2 from v1: touches ONLY R2, keeps R1/R4/order/targetMs and live durationMs/prompter!
  clock.advance(5_000);
  const rowRestore = await finish(
    history.restore("sam", {
      docId: RUNDOWN,
      key: key(2),
      versionId: v1Id,
      scope: { kind: "row", rowId: R2 },
      clientId: null,
    }),
  );
  expect(rowRestore.ok).toBe(true);
  if (!rowRestore.ok) throw new Error("expected rowRestore");
  expect(rowRestore.value.applied).toBe(1);

  const afterRow = await currentRundown();
  expect(afterRow.rundown.targetMs).toBe(2_400_000);
  expect(afterRow.rows.map((r) => r.id)).toEqual([R2, R1, R4]);
  expect(afterRow.rows[1]!.cells.story?.value).toBe("Cold open v2");
  expect(afterRow.rows[0]!.durationMs).toBe(77_000);
  expect(afterRow.rows[0]!.prompter).toEqual(PROMPTER_ON);
  expect(afterRow.rows[0]!.cells.story).toEqual({
    value: "Top headline",
    userId: "sam",
    setAt: clock.clock.now(),
    previous: {
      value: "Top headline v2",
      userId: "dana",
      setAt: T0 + 10_000,
    },
  });

  // 2) Single-row restore of deleted R3 re-inserts it at its historical anchor
  clock.advance(1_000);
  const deletedRowRestore = await finish(
    history.restore("sam", {
      docId: RUNDOWN,
      key: key(3),
      versionId: v1Id,
      scope: { kind: "row", rowId: R3 },
      clientId: null,
    }),
  );
  expect(deletedRowRestore.ok).toBe(true);
  const afterReinsert = await currentRundown();
  expect(afterReinsert.rows.map((r) => r.id)).toEqual([R2, R3, R1, R4]);
  expect(afterReinsert.rows[1]!.cells.story?.value).toBe("Weather");
  expect(afterReinsert.rows[1]!.durationMs).toBeNull();
  expect(afterReinsert.rows[1]!.prompter).toBeNull();

  // 3) Whole-rundown restore from v1 restores order, cells, targetMs, removes R4, and keeps live durationMs/prompter on R1 & R2!
  clock.advance(5_000);
  const fullRestore = await finish(
    history.restore("sam", {
      docId: RUNDOWN,
      key: key(4),
      versionId: v1Id,
      scope: { kind: "script" },
      clientId: null,
    }),
  );
  expect(fullRestore.ok).toBe(true);
  if (!fullRestore.ok) throw new Error("expected fullRestore");

  const afterFull = await currentRundown();
  expect(afterFull.rundown.targetMs).toBe(1_800_000);
  expect(afterFull.rows.map((r) => r.id)).toEqual([R1, R2, R3]);
  expect(afterFull.rows[0]!.durationMs).toBe(22_000);
  expect(afterFull.rows[1]!.durationMs).toBe(77_000);
  expect(afterFull.rows[1]!.prompter).toEqual(PROMPTER_ON);
  // ADR 0052 cell.previous preserved on R1 (was "Cold open v2") and immediately undoable via restoreCell
  expect(afterFull.rows[0]!.cells.story).toEqual({
    value: "Cold open",
    userId: "sam",
    setAt: clock.clock.now(),
    previous: {
      value: "Cold open v2",
      userId: "dana",
      setAt: T0 + 10_000,
    },
  });
  await editRundown("sam", (d) => {
    restoreCell(d, R1, "story", {
      userId: "sam",
      now: () => clock.clock.now(),
    });
  });
  expect((await currentRundown()).rows[0]!.cells.story?.value).toBe(
    "Cold open v2",
  );

  // pre_restore version holds the rundown right before fullRestore
  const beforeContent = await history.content("sam", RUNDOWN, {
    versionId: fullRestore.value.beforeVersionId,
  });
  expect(beforeContent.ok).toBe(true);
  if (beforeContent.ok) {
    expect(beforeContent.value.content.rundown?.rows.map((r) => r.id)).toEqual([
      R2,
      R3,
      R1,
      R4,
    ]);
  }

  // Invalid scopes are rejected cleanly
  expect(
    await history.restore("sam", {
      docId: RUNDOWN,
      key: key(5),
      versionId: v1Id,
      scope: { kind: "scene", headingId: "h1" },
      clientId: null,
    }),
  ).toEqual({ ok: false, code: "bad_request" });
  expect(
    await history.restore("sam", {
      docId: RUNDOWN,
      key: key(6),
      versionId: v1Id,
      scope: { kind: "row", rowId: R4 },
      clientId: null,
    }),
  ).toEqual({ ok: false, code: "not_restorable" });
});

test("HTTP routes accept { kind: 'row', rowId } on /api/versions/restore and enforce edit_rundowns", async () => {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `hv-${++made}`;
  const built: { server: ManentServer | null } = { server: null };
  const history = createHistoryService({
    sync: () => built.server!.sync!,
    storage,
    clock: clock.clock,
    ids,
  });
  const config = makeConfig({
    sync: {
      storage,
      clock: clock.clock,
      defer: (fn) => fn(),
      ids,
      hooks: [history],
    },
    history,
  });
  const server = createServer(config);
  built.server = server;
  const sync = server.sync!;

  sync.access.create("ana", {
    docId: RUNDOWN,
    kind: "rundown",
    home: HOME_STR,
  });
  storage.directory.setRole(RUNDOWN, "ana", "owner", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "leo", "edit", []);

  const seed = createDoc({ clientId: 201 });
  initRundown(
    seed,
    {
      airDate: "2026-11-26",
      airAt: null,
      windowLeadMs: 3_600_000,
      targetMs: null,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    seed,
    [{ id: R1, kind: "item", docId: null, blockId: null }],
    null,
  );
  setCell(seed, R1, "segment", "Original seg", {
    userId: "ana",
    now: () => T0,
  });
  storage.open(HOME).log.append({
    docId: RUNDOWN,
    generation: 1,
    userId: "ana",
    update: seed.encodeState(),
    origin: "edit",
    clocks: [{ clientId: 201, clock: 1 }],
  });
  seed.destroy();

  const ana = config.auth.sessions.issue("ana");
  const leo = config.auth.sessions.issue("leo");

  async function req(
    method: "GET" | "POST",
    path: string,
    token: string,
    body?: unknown,
  ): Promise<[number, unknown]> {
    const headers = { Authorization: `Bearer ${token}` };
    const init =
      method === "GET"
        ? { headers }
        : { method, headers, body: JSON.stringify(body) };
    const response = await server.fetch(
      new Request(`http://127.0.0.1:4747${path}`, init),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    return [response!.status, await response!.json()];
  }

  // Name baseline version via HTTP
  const [nameStatus, nameBody] = await req("POST", "/api/versions/name", ana, {
    docId: RUNDOWN,
    key: key(1),
    name: "Air lock",
    fromVersionId: null,
  });
  expect(nameStatus).toBe(200);
  const versionId = (nameBody as { version: { id: string } }).version.id;

  // Edit cell via authorityWrite
  await sync.authorityWrite(RUNDOWN, {
    userId: "ana",
    origin: "system",
    edit(d) {
      setCell(d, R1, "segment", "Changed seg", {
        userId: "ana",
        now: () => T0 + 100,
      });
      return { ok: true };
    },
    inTransaction() {},
  });

  // Leo (edit without edit_rundowns) is refused 403 on row restore
  expect(
    await req("POST", "/api/versions/restore", leo, {
      docId: RUNDOWN,
      key: key(2),
      versionId,
      scope: { kind: "row", rowId: R1 },
      clientId: null,
    }),
  ).toEqual([403, { error: "forbidden" }]);

  // Empty rowId is refused 400
  expect(
    await req("POST", "/api/versions/restore", ana, {
      docId: RUNDOWN,
      key: key(3),
      versionId,
      scope: { kind: "row", rowId: "" },
      clientId: null,
    }),
  ).toEqual([400, { error: "bad_request" }]);

  // Ana restores row R1 via HTTP
  const [restoreStatus, restoreBody] = await req(
    "POST",
    "/api/versions/restore",
    ana,
    {
      docId: RUNDOWN,
      key: key(4),
      versionId,
      scope: { kind: "row", rowId: R1 },
      clientId: null,
    },
  );
  expect(restoreStatus).toBe(200);
  expect((restoreBody as { applied: number }).applied).toBe(1);

  // Leo (switched to Can view) reads snapshot content via HTTP
  storage.directory.setRole(RUNDOWN, "leo", "view", []);
  const [contentStatus, contentBody] = await req(
    "GET",
    `/api/versions/content?docId=${RUNDOWN}&versionId=${versionId}`,
    leo,
  );
  expect(contentStatus).toBe(200);
  const parsed = contentBody as VersionContentResponse;
  expect(parsed.content.rundown?.rows[0]?.cells.segment?.value).toBe(
    "Original seg",
  );
  const live = await sync.authorityWrite(RUNDOWN, {
    userId: "ana",
    origin: "system",
    edit(d) {
      expect(readRundown(d).rows[0]?.cells.segment?.value).toBe("Original seg");
      expect(readRundown(d).rows[0]?.cells.segment?.previous?.value).toBe(
        "Changed seg",
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  expect(live.ok).toBe(true);
});
