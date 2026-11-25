import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  initRundown,
  jsonMap,
  loadDoc,
  writeGroup,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { indexDocId, projectHome, workspaceHome } from "@manent/sync-protocol";
import type { Identity, Message } from "@manent/sync-protocol";
import {
  OWNER_CAPABILITIES,
  PRODUCT_SETTING_RULES,
  createAirWindows,
  createCanAlsoHooks,
  createHistoryService,
  createProductionService,
  createPrompterService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  readCanAlso,
  readProjectCanAlso,
} from "../src/index.ts";
import type {
  Directory,
  ManentServer,
  SignInProvider,
  SyncService,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const HOST = "localhost:4747";
const ORIGIN = `http://${HOST}`;
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };
const CALLER = { remoteAddress: "127.0.0.1", upgrade: () => false };

const WS_MAIN = "medium";
const WS_MAIN_INDEX = indexDocId("workspace", WS_MAIN);
const PROJ_A = "11111111-1111-7111-8111-111111111111";
const PROJ_B = "22222222-2222-7222-8222-222222222222";
const PROJ_A_INDEX = indexDocId("project", PROJ_A);
const PROJ_B_INDEX = indexDocId("project", PROJ_B);
const DOC_A_SCRIPT = "aaaa1111-1111-7111-8111-111111111111";
const DOC_A_RUNDOWN = "aaaa2222-2222-7222-8222-222222222222";
const DOC_B_SCRIPT = "bbbb1111-1111-7111-8111-111111111111";
const DOC_PRIVATE = "cccc1111-1111-7111-8111-111111111111";

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "priya", name: "Priya Nair" },
  { userId: "sam", name: "Sam Okafor" },
  { userId: "leo", name: "Leo Marsh" },
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
  post(
    path: string,
    body: unknown,
    userId: string,
  ): Promise<{ status: number; body: unknown }>;
  flush(): Promise<void>;
  readDoc(docId: string): CrdtDoc;
}

function createHarness(): Harness {
  const fc = fakeClock(1_800_000_000_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(5),
    now: () => fc.clock.now(),
  });
  let seq = 0;
  const ids = (): string => `id-${++seq}`;
  let server!: ManentServer;
  const sync = (): SyncService => server.sync!;

  const airWindows = createAirWindows({ clock: fc.clock, storage });
  const history = createHistoryService({
    sync,
    storage,
    clock: fc.clock,
    ids,
  });
  const production = createProductionService({
    storage,
    sync,
    history,
    now: fc.clock.now,
    ids,
    names: (userId) => DIRECTORY.user(userId)?.name ?? userId,
    renderPdf: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
    rules: PRODUCT_SETTING_RULES,
  });
  const prompter = createPrompterService({
    storage,
    sync,
    history,
    clock: fc.clock,
    ids,
    airWindows,
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
      registry: PRODUCT_SETTING_RULES,
      hooks: [
        history,
        production.hooks,
        airWindows.hooks,
        prompter.hooks,
        createCanAlsoHooks(),
      ],
      airWindow: airWindows.isInside,
      airWindowOf: airWindows.windowOf,
    },
    production,
    prompter,
  });

  const tokens: Record<string, string> = {};
  for (const person of PEOPLE)
    tokens[person.userId] = sessions.issue(person.userId);

  async function flush(): Promise<void> {
    for (let i = 0; i < 12; i++) {
      fc.runDeferred();
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  async function post(
    path: string,
    body: unknown,
    userId: string,
  ): Promise<{ status: number; body: unknown }> {
    const pending = server.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens[userId]}`,
        },
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

  return { fc, storage, server, sync: server.sync!, post, flush, readDoc };
}

async function seedProjects(h: Harness): Promise<void> {
  const { sync, storage } = h;
  sync.access.create("dana", {
    docId: WS_MAIN_INDEX,
    kind: "index",
    home: workspaceHome(WS_MAIN),
  });
  storage.directory.setRole(WS_MAIN_INDEX, "priya", "edit", [
    "issue_revisions",
    "lock_page_numbers",
    "send_to_prompter",
    "edit_rundowns",
    "delete",
  ]);
  storage.directory.setRole(WS_MAIN_INDEX, "sam", "edit", []);
  storage.directory.setRole(WS_MAIN_INDEX, "leo", "view", []);

  // Project A: index, script, and rundown
  sync.access.create("dana", {
    docId: PROJ_A_INDEX,
    kind: "index",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_A_SCRIPT,
    kind: "script",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_A_RUNDOWN,
    kind: "rundown",
    home: projectHome(PROJ_A),
    workspaceId: WS_MAIN,
  });

  // Project B: index and script
  sync.access.create("dana", {
    docId: PROJ_B_INDEX,
    kind: "index",
    home: projectHome(PROJ_B),
    workspaceId: WS_MAIN,
  });
  sync.access.create("dana", {
    docId: DOC_B_SCRIPT,
    kind: "script",
    home: projectHome(PROJ_B),
    workspaceId: WS_MAIN,
  });

  // Dana's private copy (outside any project)
  sync.access.create("dana", {
    docId: DOC_PRIVATE,
    kind: "private",
    home: "user",
  });

  // Seed Project A's groups and rundown structure
  const wA = sync.authorityWrite(PROJ_A_INDEX, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      writeGroup(doc, {
        id: "g-room",
        name: "Room",
        role: "edit",
        memberUserIds: ["sam"],
        watermark: false,
      });
      writeGroup(doc, {
        id: "g-producers",
        name: "Producers",
        role: "comment",
        memberUserIds: ["leo"],
        watermark: false,
      });
      return { ok: true };
    },
    inTransaction() {},
  });
  const wRundown = sync.authorityWrite(DOC_A_RUNDOWN, {
    userId: "dana",
    origin: "system",
    edit(doc) {
      initRundown(
        doc,
        {
          airDate: "2026-11-25",
          airAt: h.fc.clock.now() + 60_000,
          windowLeadMs: 65_000,
          targetMs: 60_000,
        },
        SHOW_COLUMNS,
      );
      return { ok: true };
    },
    inTransaction() {},
  });
  await h.flush();
  await Promise.all([wA, wRundown]);
}

async function pushAs(
  h: Harness,
  userId: string,
  docId: string,
  clientId: number,
  mutate: (doc: CrdtDoc) => void,
): Promise<Message[]> {
  const peer = fakePeer({ userId, name: userId, versions: V1 });
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

test("only project owners and holders of issue_revisions may push can_also; stale revoked subscriptions are also refused", async () => {
  const h = createHarness();
  await seedProjects(h);

  // Sam (editor WITHOUT issue_revisions) pushing can_also is rejected 4422
  const samAttempt = await pushAs(h, "sam", PROJ_A_INDEX, 101, (doc) => {
    jsonMap(doc, "can_also").set("delete", { userIds: ["sam"], groupIds: [] });
  });
  expect(samAttempt).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);

  // Priya (editor WITH issue_revisions) succeeds
  const priyaOk = await pushAs(h, "priya", PROJ_A_INDEX, 102, (doc) => {
    jsonMap(doc, "can_also").set("delete", {
      userIds: ["priya"],
      groupIds: [],
    });
  });
  expect(priyaOk.some((m) => m.type === "ACK")).toBe(true);

  // Open a live subscription for Priya BEFORE Dana revokes her issue_revisions in can_also
  const stalePriya = fakePeer({ userId: "priya", name: "Priya", versions: V1 });
  h.sync.attach(stalePriya);
  h.sync.receive(stalePriya, {
    type: "SUBSCRIBE",
    docId: PROJ_A_INDEX,
    generation: 0,
    mode: "edit",
    clientIds: [103],
    lastServerSeq: 0,
  });
  await h.flush();
  stalePriya.take();

  // Owner Dana unticks Priya from issue_revisions in can_also
  const danaRevoke = await pushAs(h, "dana", PROJ_A_INDEX, 104, (doc) => {
    jsonMap(doc, "can_also").set("issue_revisions", {
      userIds: [],
      groupIds: [],
    });
  });
  expect(danaRevoke.some((m) => m.type === "ACK")).toBe(true);
  stalePriya.take();

  // Stale Priya subscription attempting to re-grant herself issue_revisions is refused 4422
  const committed = h.readDoc(PROJ_A_INDEX);
  const local = loadDoc(committed.encodeState(), { clientId: 103 });
  committed.destroy();
  const before = local.encodeStateVector();
  jsonMap(local, "can_also").set("issue_revisions", {
    userIds: ["priya"],
    groupIds: [],
  });
  const forged = local.diff(before);
  local.destroy();
  h.sync.receive(stalePriya, {
    type: "PUSH",
    docId: PROJ_A_INDEX,
    generation: 1,
    clientSeq: 1,
    update: forged,
    heal: false,
  });
  await h.flush();
  expect(stalePriya.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);
  h.sync.detach(stalePriya);
});

test("malformed can_also pushes (unknown key, unsorted/duplicate arrays, extra fields, unknown groupId) are rejected", async () => {
  const h = createHarness();
  await seedProjects(h);

  const badPushes: Array<(doc: CrdtDoc) => void> = [
    // Unknown capability key
    (doc) =>
      jsonMap(doc, "can_also").set("admin_all", {
        userIds: ["sam"],
        groupIds: [],
      }),
    // Non-object value
    (doc) => jsonMap(doc, "can_also").set("delete", "sam"),
    // Missing groupIds field
    (doc) => jsonMap(doc, "can_also").set("delete", { userIds: ["sam"] }),
    // Unexpected extra field
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: ["sam"],
        groupIds: [],
        extra: true,
      }),
    // Unsorted userIds
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: ["sam", "priya"],
        groupIds: [],
      }),
    // Duplicate userIds
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: ["sam", "sam"],
        groupIds: [],
      }),
    // Empty userId string
    (doc) =>
      jsonMap(doc, "can_also").set("delete", { userIds: [""], groupIds: [] }),
    // Unsorted groupIds
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: [],
        groupIds: ["g-room", "g-producers"],
      }),
    // Duplicate groupIds
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: [],
        groupIds: ["g-room", "g-room"],
      }),
    // Unknown groupId not present in groups map
    (doc) =>
      jsonMap(doc, "can_also").set("delete", {
        userIds: [],
        groupIds: ["g-nonexistent"],
      }),
  ];

  let clientId = 200;
  for (const mutate of badPushes) {
    const replies = await pushAs(h, "dana", PROJ_A_INDEX, ++clientId, mutate);
    expect(replies).toEqual([
      expect.objectContaining({ type: "ERROR", code: 4422 }),
    ]);
  }

  // Valid sorted, deduplicated entry creating and referencing a new group in one push succeeds
  const okPush = await pushAs(h, "dana", PROJ_A_INDEX, 250, (doc) => {
    writeGroup(doc, {
      id: "g-showrunners",
      name: "Showrunners",
      role: "edit",
      memberUserIds: ["priya", "sam"],
      watermark: false,
    });
    jsonMap(doc, "can_also").set("delete", {
      userIds: ["priya", "sam"],
      groupIds: ["g-room", "g-showrunners"],
    });
  });
  expect(okPush.some((m) => m.type === "ACK")).toBe(true);

  const indexDoc = h.readDoc(PROJ_A_INDEX);
  expect(readCanAlso(indexDoc).get("delete")).toEqual({
    userIds: ["priya", "sam"],
    groupIds: ["g-room", "g-showrunners"],
  });
  indexDoc.destroy();
});

test("person ticks and group ticks grant capabilities, removing a group member revokes them, and non-members remain forbidden", async () => {
  const h = createHarness();
  await seedProjects(h);

  // Initially Sam has no capabilities on DOC_A_SCRIPT
  expect(h.sync.access.capabilitiesOf("sam", DOC_A_SCRIPT)).toEqual([]);

  // Tick group g-room (which contains Sam) for send_to_prompter, and person Sam + outsider for delete
  const granted = await pushAs(h, "dana", PROJ_A_INDEX, 301, (doc) => {
    jsonMap(doc, "can_also").set("send_to_prompter", {
      userIds: [],
      groupIds: ["g-room"],
    });
    jsonMap(doc, "can_also").set("delete", {
      userIds: ["outsider", "sam"],
      groupIds: [],
    });
  });
  expect(granted.some((m) => m.type === "ACK")).toBe(true);

  expect(h.sync.access.capabilitiesOf("sam", DOC_A_SCRIPT)?.toSorted()).toEqual(
    ["delete", "send_to_prompter"],
  );
  // Outsider has no role on DOC_A_SCRIPT: remains null (forbidden) even when listed in can_also
  expect(h.sync.access.capabilitiesOf("outsider", DOC_A_SCRIPT)).toBeNull();

  // Remove Sam from g-room: send_to_prompter is immediately revoked while direct delete tick remains
  const removedFromGroup = await pushAs(h, "dana", PROJ_A_INDEX, 302, (doc) => {
    writeGroup(doc, {
      id: "g-room",
      name: "Room",
      role: "edit",
      memberUserIds: [],
      watermark: false,
    });
  });
  expect(removedFromGroup.some((m) => m.type === "ACK")).toBe(true);
  expect(h.sync.access.capabilitiesOf("sam", DOC_A_SCRIPT)).toEqual(["delete"]);
});

test("unticking a capability in can_also overrides doc_roles.capabilities and causes immediate 403 on issue, lock, prompter, and delete", async () => {
  const h = createHarness();
  await seedProjects(h);

  // Before unticking: Priya holds all 5 capabilities from doc_roles.capabilities
  expect(
    h.sync.access.capabilitiesOf("priya", DOC_A_SCRIPT)?.toSorted(),
  ).toEqual([...OWNER_CAPABILITIES].toSorted());

  // Dana unticks Priya from issue_revisions, lock_page_numbers, send_to_prompter, and delete
  // (leaving edit_rundowns untouched in can_also so it falls back to doc_roles)
  const untick = await pushAs(h, "dana", PROJ_A_INDEX, 401, (doc) => {
    const canAlso = jsonMap(doc, "can_also");
    canAlso.set("issue_revisions", { userIds: [], groupIds: [] });
    canAlso.set("lock_page_numbers", { userIds: [], groupIds: [] });
    canAlso.set("send_to_prompter", { userIds: [], groupIds: [] });
    canAlso.set("delete", { userIds: ["sam"], groupIds: [] });
  });
  expect(untick.some((m) => m.type === "ACK")).toBe(true);

  // Priya retains ONLY edit_rundowns (uncovered by can_also); all 4 covered capabilities are revoked
  expect(h.sync.access.capabilitiesOf("priya", DOC_A_SCRIPT)).toEqual([
    "edit_rundowns",
  ]);
  // Owner Dana STILL retains all owner capabilities even though not listed in can_also
  expect(
    h.sync.access.capabilitiesOf("dana", DOC_A_SCRIPT)?.toSorted(),
  ).toEqual([...OWNER_CAPABILITIES].toSorted());

  // Forged production lock request by Priya -> 403 forbidden
  expect(
    await h.post(
      "/api/production/lock",
      {
        docId: DOC_A_SCRIPT,
        key: keyOf(1),
        numbering: "suffix",
        colourOrder: "standard",
        lockedOn: "2026-11-25",
      },
      "priya",
    ),
  ).toEqual({ status: 403, body: { error: "forbidden", issued: null } });

  // Forged production issue request by Priya -> 403 forbidden
  expect(
    await h.post(
      "/api/production/issue",
      {
        docId: DOC_A_SCRIPT,
        key: keyOf(2),
        expectedOrdinal: 1,
        what: "changed",
        pages: ["1"],
        files: ["pdf_marked"],
        tint: false,
        recipientUserIds: ["leo"],
        memo: "Blue revisions",
        issuedOn: "2026-11-25",
      },
      "priya",
    ),
  ).toEqual({ status: 403, body: { error: "forbidden", issued: null } });

  // Forged prompter send request by Priya -> 403 forbidden
  expect(
    await h.post(
      "/api/prompter/send",
      { docId: DOC_A_RUNDOWN, rowId: "row-1", key: keyOf(3) },
      "priya",
    ),
  ).toEqual({ status: 403, body: { error: "forbidden" } });

  // Forged document delete by Priya -> forbidden; ticked Sam succeeds
  expect(h.sync.access.remove("priya", { docId: DOC_A_SCRIPT })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(h.sync.access.remove("sam", { docId: DOC_A_SCRIPT })).toEqual({
    ok: true,
  });
});

test("cross-project isolation: ticks and unticks in Project A never affect Project B, workspace indexes, or private copies", async () => {
  const h = createHarness();
  await seedProjects(h);

  // Grant Sam everything and revoke Priya from everything in Project A
  const updateA = await pushAs(h, "dana", PROJ_A_INDEX, 501, (doc) => {
    const canAlso = jsonMap(doc, "can_also");
    for (const cap of OWNER_CAPABILITIES)
      canAlso.set(cap, { userIds: ["sam"], groupIds: [] });
  });
  expect(updateA.some((m) => m.type === "ACK")).toBe(true);

  // Project A reflects the table
  expect(h.sync.access.capabilitiesOf("sam", DOC_A_SCRIPT)?.toSorted()).toEqual(
    [...OWNER_CAPABILITIES].toSorted(),
  );
  expect(h.sync.access.capabilitiesOf("priya", DOC_A_SCRIPT)).toEqual([]);

  // Project B is completely unaffected: Sam still has [], Priya still has all 5 from doc_roles
  expect(readProjectCanAlso(h.storage, DOC_B_SCRIPT).size).toBe(0);
  expect(h.sync.access.capabilitiesOf("sam", DOC_B_SCRIPT)).toEqual([]);
  expect(
    h.sync.access.capabilitiesOf("priya", DOC_B_SCRIPT)?.toSorted(),
  ).toEqual([...OWNER_CAPABILITIES].toSorted());

  // Workspace index and private copies never read any project's can_also table
  expect(readProjectCanAlso(h.storage, WS_MAIN_INDEX).size).toBe(0);
  expect(readProjectCanAlso(h.storage, DOC_PRIVATE).size).toBe(0);
  expect(h.sync.access.capabilitiesOf("sam", WS_MAIN_INDEX)).toEqual([]);
});

test("revoked subscriber on an open socket cannot self-reinstate via groups, owner-only maps, or tombstone re-insert", async () => {
  const h = createHarness();
  await seedProjects(h);

  // Open a live subscription for Priya while she still holds issue_revisions
  const stalePriya = fakePeer({ userId: "priya", name: "Priya", versions: V1 });
  h.sync.attach(stalePriya);
  h.sync.receive(stalePriya, {
    type: "SUBSCRIBE",
    docId: PROJ_A_INDEX,
    generation: 0,
    mode: "edit",
    clientIds: [601],
    lastServerSeq: 0,
  });
  await h.flush();
  stalePriya.take();

  // Owner Dana revokes Priya on all capabilities, granting issue_revisions and delete only to g-producers (Dana only),
  // and creates then deletes g-temp (leaving a Yjs tombstone on g-temp).
  expect(
    (
      await pushAs(h, "dana", PROJ_A_INDEX, 602, (doc) => {
        writeGroup(doc, {
          id: "g-producers",
          name: "Producers",
          role: "comment",
          memberUserIds: ["dana"],
          watermark: false,
        });
        writeGroup(doc, {
          id: "g-temp",
          name: "Temp",
          role: "edit",
          memberUserIds: ["priya"],
          watermark: false,
        });
        const canAlso = jsonMap(doc, "can_also");
        for (const cap of OWNER_CAPABILITIES)
          canAlso.set(cap, { userIds: [], groupIds: ["g-producers"] });
      })
    ).some((m) => m.type === "ACK"),
  ).toBe(true);

  expect(
    (
      await pushAs(h, "dana", PROJ_A_INDEX, 603, (doc) => {
        jsonMap(doc, "groups").delete("g-temp");
      })
    ).some((m) => m.type === "ACK"),
  ).toBe(true);
  stalePriya.take();

  expect(h.sync.access.capabilitiesOf("priya", DOC_A_SCRIPT)).toEqual([]);

  // Exploit A: stale Priya pushes a groups-only update adding herself to g-producers -> MUST be refused 4422!
  const committed1 = h.readDoc(PROJ_A_INDEX);
  const local1 = loadDoc(committed1.encodeState(), { clientId: 601 });
  committed1.destroy();
  const v1 = local1.encodeStateVector();
  writeGroup(local1, {
    id: "g-producers",
    name: "Producers",
    role: "comment",
    memberUserIds: ["dana", "priya"],
    watermark: false,
  });
  const groupEscalation = local1.diff(v1);
  local1.destroy();

  h.sync.receive(stalePriya, {
    type: "PUSH",
    docId: PROJ_A_INDEX,
    generation: 1,
    clientSeq: 1,
    update: groupEscalation,
    heal: false,
  });
  await h.flush();
  expect(stalePriya.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);
  expect(h.sync.access.capabilitiesOf("priya", DOC_A_SCRIPT)).toEqual([]);
  h.sync.detach(stalePriya);

  // Exploit B: stale subscriber (opened before revoke) tries tombstone re-insert of g-temp + template write -> refused 4422!
  const h2 = createHarness();
  await seedProjects(h2);
  const stalePriya2 = fakePeer({
    userId: "priya",
    name: "Priya",
    versions: V1,
  });
  h2.sync.attach(stalePriya2);
  h2.sync.receive(stalePriya2, {
    type: "SUBSCRIBE",
    docId: PROJ_A_INDEX,
    generation: 0,
    mode: "edit",
    clientIds: [611],
    lastServerSeq: 0,
  });
  await h2.flush();
  stalePriya2.take();

  expect(
    (
      await pushAs(h2, "dana", PROJ_A_INDEX, 612, (doc) => {
        writeGroup(doc, {
          id: "g-temp",
          name: "Temp",
          role: "edit",
          memberUserIds: ["priya"],
          watermark: false,
        });
        jsonMap(doc, "can_also").set("issue_revisions", {
          userIds: [],
          groupIds: ["g-temp"],
        });
      })
    ).some((m) => m.type === "ACK"),
  ).toBe(true);
  // Dana removes g-temp (leaving tombstone in groups)
  expect(
    (
      await pushAs(h2, "dana", PROJ_A_INDEX, 613, (doc) => {
        jsonMap(doc, "groups").delete("g-temp");
      })
    ).some((m) => m.type === "ACK"),
  ).toBe(true);
  stalePriya2.take();

  // Stale Priya tries to tombstone-reinsert g-temp AND write can_also in the same push -> refused 4422!
  const committed2 = h2.readDoc(PROJ_A_INDEX);
  const local2 = loadDoc(committed2.encodeState(), { clientId: 611 });
  committed2.destroy();
  const v2 = local2.encodeStateVector();
  writeGroup(local2, {
    id: "g-temp",
    name: "Temp",
    role: "edit",
    memberUserIds: ["priya"],
    watermark: false,
  });
  jsonMap(local2, "can_also").set("delete", {
    userIds: ["priya"],
    groupIds: [],
  });
  const tombstoneEscalation = local2.diff(v2);
  local2.destroy();

  h2.sync.receive(stalePriya2, {
    type: "PUSH",
    docId: PROJ_A_INDEX,
    generation: 1,
    clientSeq: 1,
    update: tombstoneEscalation,
    heal: false,
  });
  await h2.flush();
  expect(stalePriya2.take()).toEqual([
    expect.objectContaining({ type: "ERROR", code: 4422 }),
  ]);
  expect(
    h2.sync.access
      .capabilitiesOf("priya", DOC_A_SCRIPT)
      ?.includes("issue_revisions"),
  ).toBe(false);
  h2.sync.detach(stalePriya2);
});
