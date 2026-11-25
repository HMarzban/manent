import { expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlock } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import { PROTOCOL_VERSION, indexDocId, seedDocId } from "@manent/sync-protocol";
import type { DocKind, Identity } from "@manent/sync-protocol";
import {
  API_KEY_PREFIX,
  OWNER_CAPABILITIES,
  createPublicApiService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "../src/index.ts";
import type {
  Clock,
  Directory,
  PublicApiService,
  ServerConfig,
} from "../src/index.ts";

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "leo", name: "Leo Marsh" },
  { userId: "outsider", name: "Alex Mercer" },
];

const directory: Directory = {
  user: (id) => PEOPLE.find((p) => p.userId === id) ?? null,
  workspacesOf: () => [],
};

function seedCommittedDoc(
  storage: ReturnType<typeof createMemoryStorage>,
  home: { kind: "project" | "user"; id: string },
  docId: string,
  kind: DocKind,
  userId: string,
  populate: (doc: CrdtDoc) => void,
): void {
  storage.directory.place(docId, home, kind, userId);
  const file = storage.open(home);
  file.log.create({
    id: docId,
    kind,
    ownerUserId: home.kind === "user" ? userId : null,
    schemaVersion: 2,
    engineVersion: 1,
  });
  const doc = createDoc();
  populate(doc);
  file.log.append({
    docId,
    generation: 1,
    update: doc.encodeState(),
    userId,
    origin: "edit",
    clocks: [],
  });
  doc.destroy();
}

function setupFixture() {
  let now = 1_700_000_000_000;
  let idSeq = 1;
  let randSeed = 10;
  const clock: Clock = {
    now: () => now,
    schedule: () => () => {},
  };
  const storage = createMemoryStorage({ now: clock.now });

  const wsId = "studio";
  const otherWsId = "other";
  const wsIndexId = indexDocId("workspace", wsId);
  const otherWsIndexId = indexDocId("workspace", otherWsId);
  const folderId = "folder-season-1";
  const projectId = seedDocId("ap-proj-1");
  const folderProjectId = seedDocId("ap-proj-folder");
  const otherProjectId = seedDocId("ap-proj-other");
  const scriptDocId = seedDocId("ap-script-1");
  const inkDocId = seedDocId("ap-ink-1");
  const badInkDocId = seedDocId("ap-ink-bad");
  const trashedDocId = seedDocId("ap-trashed-1");
  const privateDocId = seedDocId("ap-private-1");
  const userHomeDocId = seedDocId("ap-user-home-1");
  const otherWsDocId = seedDocId("ap-other-doc-1");

  // Seed studio workspace index
  seedCommittedDoc(
    storage,
    { kind: "project", id: wsIndexId },
    wsIndexId,
    "index",
    "dana",
    (doc) => {
      jsonMap(doc, "folders").set(folderId, {
        name: "Season 1",
        parentId: null,
      });
      jsonMap(doc, "projects").set(projectId, {
        title: "The Long Night",
        folderId: null,
      });
      jsonMap(doc, "projects").set(folderProjectId, {
        title: "Branching Story",
        folderId,
      });
      jsonMap(doc, "documents").set(scriptDocId, {
        title: "Episode 1",
        projectId,
        kind: "script",
        trashedAt: null,
      });
      jsonMap(doc, "documents").set(trashedDocId, {
        title: "Cut Episode",
        projectId,
        kind: "script",
        trashedAt: null,
      });
      jsonMap(doc, "documents").set(inkDocId, {
        title: "Choice Tree",
        projectId: folderProjectId,
        kind: "ink",
        trashedAt: null,
      });
      jsonMap(doc, "documents").set(badInkDocId, {
        title: "Broken Ink",
        projectId: folderProjectId,
        kind: "ink",
        trashedAt: null,
      });
    },
  );
  storage.directory.setRole(wsIndexId, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(wsIndexId, "leo", "edit", []);

  // Seed Dana's private index holding privateDocId
  const danaPrivateIndexId = indexDocId("user", "dana");
  seedCommittedDoc(
    storage,
    { kind: "user", id: "dana" },
    danaPrivateIndexId,
    "private",
    "dana",
    (doc) => {
      jsonMap(doc, "private_folder").set(privateDocId, {
        title: "Private Notes",
      });
    },
  );

  // Seed other workspace index (including CRDT bait pointing to studio's projectId/scriptDocId AND Dana's privateDocId!)
  seedCommittedDoc(
    storage,
    { kind: "project", id: otherWsIndexId },
    otherWsIndexId,
    "index",
    "outsider",
    (doc) => {
      jsonMap(doc, "projects").set(otherProjectId, {
        title: "Rival Project",
        folderId: null,
      });
      jsonMap(doc, "projects").set(projectId, {
        title: "Baited Studio Project",
        folderId: null,
      });
      jsonMap(doc, "documents").set(otherWsDocId, {
        title: "Rival Script",
        projectId: otherProjectId,
        kind: "script",
        trashedAt: null,
      });
      jsonMap(doc, "documents").set(scriptDocId, {
        title: "Baited Episode 1",
        projectId,
        kind: "script",
        trashedAt: null,
      });
      jsonMap(doc, "projects").set(folderProjectId, {
        title: "Baited Solo Project",
        folderId: null,
      });
      jsonMap(doc, "documents").set(inkDocId, {
        title: "Baited Solo Ink",
        projectId: folderProjectId,
        kind: "ink",
        trashedAt: null,
      });
      jsonMap(doc, "documents").set(privateDocId, {
        title: "Baited Private",
        projectId,
        kind: "script",
        trashedAt: null,
      });
    },
  );
  storage.directory.setRole(
    otherWsIndexId,
    "outsider",
    "owner",
    OWNER_CAPABILITIES,
  );
  // Even if Dana holds edit in `other`, studio's docs (including solo-owned inkDocId) MUST NOT leak!
  storage.directory.setRole(otherWsIndexId, "dana", "edit", []);

  // Seed actual documents
  const projHome = { kind: "project" as const, id: projectId };
  const folderProjHome = { kind: "project" as const, id: folderProjectId };
  const otherProjHome = { kind: "project" as const, id: otherProjectId };

  seedCommittedDoc(storage, projHome, scriptDocId, "script", "dana", (doc) => {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        canonicalBlock({
          type: "block",
          attrs: { id: "b1", type: "scene_heading" },
          content: [{ type: "text", text: "INT. STUDIO - NIGHT" }],
        }),
        canonicalBlock({
          type: "block",
          attrs: { id: "b2", type: "action" },
          content: [{ type: "text", text: "The lights flicker." }],
        }),
      ]),
    );
  });
  storage.directory.setRole(scriptDocId, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(scriptDocId, "leo", "edit", []);
  storage.shareLinks.grant(scriptDocId, "leo", "edit", "workspace");

  seedCommittedDoc(storage, projHome, trashedDocId, "script", "dana", (doc) => {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        canonicalBlock({
          type: "block",
          attrs: { id: "t1", type: "action" },
          content: [{ type: "text", text: "Deleted scene." }],
        }),
      ]),
    );
  });
  storage.directory.setRole(trashedDocId, "dana", "owner", OWNER_CAPABILITIES);
  storage.trash.put({
    docId: trashedDocId,
    workspaceId: wsId,
    home: `project:${projectId}`,
    deletedByUserId: "dana",
    deletedAt: now,
    purgeAfter: now + 30 * 86_400_000,
  });

  seedCommittedDoc(storage, projHome, privateDocId, "script", "dana", (doc) => {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        canonicalBlock({
          type: "block",
          attrs: { id: "p1", type: "action" },
          content: [{ type: "text", text: "Top secret private draft." }],
        }),
      ]),
    );
  });
  storage.directory.setRole(privateDocId, "dana", "owner", OWNER_CAPABILITIES);

  seedCommittedDoc(
    storage,
    { kind: "user", id: "dana" },
    userHomeDocId,
    "script",
    "dana",
    (doc) => {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          canonicalBlock({
            type: "block",
            attrs: { id: "u1", type: "action" },
            content: [{ type: "text", text: "User-homed note." }],
          }),
        ]),
      );
    },
  );
  storage.directory.setRole(userHomeDocId, "dana", "owner", OWNER_CAPABILITIES);

  seedCommittedDoc(storage, folderProjHome, inkDocId, "ink", "dana", (doc) => {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        canonicalBlock({
          type: "block",
          attrs: { id: "k1", type: "ink_line" },
          content: [{ type: "text", text: "Hello from Manent." }],
        }),
        canonicalBlock({
          type: "block",
          attrs: { id: "k2", type: "ink_line" },
          content: [{ type: "text", text: "-> END" }],
        }),
      ]),
    );
  });
  storage.directory.setRole(inkDocId, "dana", "owner", OWNER_CAPABILITIES);

  seedCommittedDoc(
    storage,
    folderProjHome,
    badInkDocId,
    "ink",
    "dana",
    (doc) => {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          canonicalBlock({
            type: "block",
            attrs: { id: "bad1", type: "ink_line" },
            content: [{ type: "text", text: "-> nonexistent_knot_target" }],
          }),
        ]),
      );
    },
  );
  storage.directory.setRole(badInkDocId, "dana", "owner", OWNER_CAPABILITIES);

  seedCommittedDoc(
    storage,
    otherProjHome,
    otherWsDocId,
    "script",
    "outsider",
    (doc) => {
      scriptBody(doc).write((w) =>
        w.insertBlocks(null, [
          canonicalBlock({
            type: "block",
            attrs: { id: "o1", type: "action" },
            content: [{ type: "text", text: "Rival script body." }],
          }),
        ]),
      );
    },
  );
  storage.directory.setRole(
    otherWsDocId,
    "outsider",
    "owner",
    OWNER_CAPABILITIES,
  );

  const publicApi: PublicApiService = createPublicApiService({
    storage,
    clock,
    ids: () => `key-${idSeq++}`,
    randomBytes: (len) => {
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i++) out[i] = (randSeed + i) & 0xff;
      randSeed += 37;
      return out;
    },
  });

  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(5),
    now: clock.now,
  });
  const tokens: Readonly<Record<string, string>> = {
    dana: sessions.issue("dana"),
    leo: sessions.issue("leo"),
    outsider: sessions.issue("outsider"),
  };

  const config: ServerConfig = {
    http: {
      allowedHosts: ["localhost:4747"],
      openUrl: "http://localhost:4747",
      webDir: null,
    },
    auth: {
      signIn: {
        describe: () => ({ choices: [] }),
        authenticate: async () => ({ ok: false, reason: "unknown_user" }),
      },
      directory,
      sessions,
    },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: clock.now }),
      versions: {
        current: { protocol: PROTOCOL_VERSION, schema: 2, engine: 2, table: 1 },
        min: { protocol: PROTOCOL_VERSION, schema: 1, engine: 1, table: 1 },
      },
      allowedOrigins: ["http://localhost:4747"],
    },
    sync: null,
    publicApi,
  };
  const server = createServer(config);

  const requestWithBearer = async (
    bearer: string | null,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Response> => {
    const response = await server.fetch(
      new Request(`http://localhost:4747${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Host: "localhost:4747",
          ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null) throw new Error("unexpected socket upgrade");
    return response;
  };

  const fetchAs = (
    who: keyof typeof tokens | null,
    path: string,
    body?: Record<string, unknown>,
  ) => requestWithBearer(who === null ? null : tokens[who]!, path, body);

  return {
    storage,
    tokens,
    fetchAs,
    requestWithBearer,
    wsId,
    otherWsId,
    folderId,
    projectId,
    folderProjectId,
    scriptDocId,
    inkDocId,
    badInkDocId,
    trashedDocId,
    privateDocId,
    userHomeDocId,
    otherWsDocId,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("strict token separation: session tokens rejected on every /api/v1/* endpoint and API keys rejected on /api/workspace/api-keys*", async () => {
  const fx = setupFixture();

  // Owner creates a real API key for studio
  const createdRes = await fx.fetchAs(
    "dana",
    "/api/workspace/api-keys/create",
    {
      workspaceId: fx.wsId,
      name: "CI pipeline",
    },
  );
  expect(createdRes.status).toBe(200);
  const created = (await createdRes.json()) as {
    key: string;
    row: { id: string; name: string };
  };
  expect(created.key.startsWith(API_KEY_PREFIX)).toBe(true);

  // 1. Valid user session token sent as Bearer on EVERY /api/v1/* endpoint -> 401 unauthenticated
  const v1Paths = [
    "/api/v1/folder",
    `/api/v1/lines?docId=${fx.scriptDocId}`,
    `/api/v1/fdx?docId=${fx.scriptDocId}`,
    `/api/v1/ink?docId=${fx.inkDocId}`,
  ];
  for (const path of v1Paths) {
    const withSession = await fx.fetchAs("dana", path);
    expect([withSession.status, await withSession.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);

    const missing = await fx.requestWithBearer(null, path);
    expect([missing.status, await missing.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);

    const unknown = await fx.requestWithBearer("mk_not_a_real_key_1234", path);
    expect([unknown.status, await unknown.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
  }

  // 2. API key sent as Bearer on EVERY /api/workspace/api-keys* route -> 401 unauthenticated
  for (const [path, body] of [
    [`/api/workspace/api-keys?workspaceId=${fx.wsId}`, undefined],
    [
      "/api/workspace/api-keys/create",
      { workspaceId: fx.wsId, name: "Escalation" },
    ],
    [
      "/api/workspace/api-keys/revoke",
      { workspaceId: fx.wsId, id: created.row.id },
    ],
  ] as const) {
    const unauth = await fx.requestWithBearer(null, path, body);
    expect([unauth.status, await unauth.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);

    const withApiKey = await fx.requestWithBearer(created.key, path, body);
    expect([withApiKey.status, await withApiKey.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);

    const outsider = await fx.fetchAs("outsider", path, body);
    expect([outsider.status, await outsider.json()]).toEqual([
      403,
      { error: "forbidden" },
    ]);
  }

  // 3. Non-owner member (leo) can list keys (never seeing secret or hash) but cannot create or revoke
  const leoList = await fx.fetchAs(
    "leo",
    `/api/workspace/api-keys?workspaceId=${fx.wsId}`,
  );
  const leoListBody = await leoList.json();
  expect(leoList.status).toBe(200);
  const serialized = JSON.stringify(leoListBody);
  expect(serialized.includes(created.key)).toBe(false);
  expect(serialized.includes("keyHash")).toBe(false);

  const leoCreate = await fx.fetchAs("leo", "/api/workspace/api-keys/create", {
    workspaceId: fx.wsId,
    name: "Leo Key",
  });
  expect([leoCreate.status, await leoCreate.json()]).toEqual([
    403,
    { error: "forbidden" },
  ]);

  const leoRevoke = await fx.fetchAs("leo", "/api/workspace/api-keys/revoke", {
    workspaceId: fx.wsId,
    id: created.row.id,
  });
  expect([leoRevoke.status, await leoRevoke.json()]).toEqual([
    403,
    { error: "forbidden" },
  ]);

  // 4. Cross-workspace owner cannot revoke studio's key
  const crossRevoke = await fx.fetchAs(
    "outsider",
    "/api/workspace/api-keys/revoke",
    { workspaceId: fx.otherWsId, id: created.row.id },
  );
  expect([crossRevoke.status, await crossRevoke.json()]).toEqual([
    404,
    { error: "not_found" },
  ]);
});

test("workspace scoping: folder, lines, fdx, ink succeed in-scope and refuse Trash, Private, user:, other-workspace, CRDT bait, and wrong kinds", async () => {
  const fx = setupFixture();

  const studioKey = (
    (await (
      await fx.fetchAs("dana", "/api/workspace/api-keys/create", {
        workspaceId: fx.wsId,
        name: "Studio Reader",
      })
    ).json()) as { key: string }
  ).key;
  const otherKey = (
    (await (
      await fx.fetchAs("outsider", "/api/workspace/api-keys/create", {
        workspaceId: fx.otherWsId,
        name: "Other Reader",
      })
    ).json()) as { key: string }
  ).key;

  // Top-level folder omits trashedDocId and privateDocId
  const rootFolder = await fx.requestWithBearer(studioKey, "/api/v1/folder");
  expect([rootFolder.status, await rootFolder.json()]).toEqual([
    200,
    {
      folders: [{ folderId: fx.folderId, name: "Season 1" }],
      projects: [
        {
          projectId: fx.projectId,
          title: "The Long Night",
          documents: [
            { docId: fx.scriptDocId, title: "Episode 1", kind: "script" },
          ],
        },
      ],
    },
  ]);

  // Subfolder lists Branching Story and its ink docs; unknown folder -> 404
  const subFolder = await fx.requestWithBearer(
    studioKey,
    `/api/v1/folder?folderId=${fx.folderId}`,
  );
  expect([subFolder.status, await subFolder.json()]).toEqual([
    200,
    {
      folders: [],
      projects: [
        {
          projectId: fx.folderProjectId,
          title: "Branching Story",
          documents: [
            { docId: fx.badInkDocId, title: "Broken Ink", kind: "ink" },
            { docId: fx.inkDocId, title: "Choice Tree", kind: "ink" },
          ],
        },
      ],
    },
  ]);
  const badFolder = await fx.requestWithBearer(
    studioKey,
    "/api/v1/folder?folderId=missing",
  );
  expect([badFolder.status, await badFolder.json()]).toEqual([
    404,
    { error: "not_found" },
  ]);

  // Lines endpoint returns exact block lines in document order
  const linesRes = await fx.requestWithBearer(
    studioKey,
    `/api/v1/lines?docId=${fx.scriptDocId}`,
  );
  expect([linesRes.status, await linesRes.json()]).toEqual([
    200,
    {
      docId: fx.scriptDocId,
      lines: [
        { id: "b1", type: "scene_heading", text: "INT. STUDIO - NIGHT" },
        { id: "b2", type: "action", text: "The lights flicker." },
      ],
    },
  ]);

  // FDX endpoint returns Final Draft XML for script, 415 for ink
  const fdxRes = await fx.requestWithBearer(
    studioKey,
    `/api/v1/fdx?docId=${fx.scriptDocId}`,
  );
  expect(fdxRes.status).toBe(200);
  expect(fdxRes.headers.get("content-type")).toBe(
    "application/xml; charset=utf-8",
  );
  expect(fdxRes.headers.get("content-disposition")).toBe(
    'attachment; filename="Episode 1.fdx"',
  );
  const fdxXml = await fdxRes.text();
  expect(fdxXml.includes("<FinalDraft")).toBe(true);
  expect(fdxXml.includes("INT. STUDIO - NIGHT")).toBe(true);

  const fdxOnInk = await fx.requestWithBearer(
    studioKey,
    `/api/v1/fdx?docId=${fx.inkDocId}`,
  );
  expect([fdxOnInk.status, await fdxOnInk.json()]).toEqual([
    415,
    { error: "unsupported_kind" },
  ]);

  // Ink endpoint compiles valid Ink to JSON, refuses invalid Ink with 422, refuses script with 415
  const inkRes = await fx.requestWithBearer(
    studioKey,
    `/api/v1/ink?docId=${fx.inkDocId}`,
  );
  expect(inkRes.status).toBe(200);
  expect(inkRes.headers.get("content-type")).toBe(
    "application/json; charset=utf-8",
  );
  const compiled = (await inkRes.json()) as Record<string, unknown>;
  expect(compiled.inkVersion).toBeDefined();

  const badInkRes = await fx.requestWithBearer(
    studioKey,
    `/api/v1/ink?docId=${fx.badInkDocId}`,
  );
  expect([badInkRes.status, await badInkRes.json()]).toEqual([
    422,
    { error: "invalid" },
  ]);

  const inkOnScript = await fx.requestWithBearer(
    studioKey,
    `/api/v1/ink?docId=${fx.scriptDocId}`,
  );
  expect([inkOnScript.status, await inkOnScript.json()]).toEqual([
    415,
    { error: "unsupported_kind" },
  ]);

  // Trash, Private folder, user: home, and other workspace docs ALL return 404 on every doc endpoint
  for (const forbiddenId of [
    fx.trashedDocId,
    fx.privateDocId,
    fx.userHomeDocId,
    fx.otherWsDocId,
  ]) {
    for (const ep of ["lines", "fdx", "ink"] as const) {
      const res = await fx.requestWithBearer(
        studioKey,
        `/api/v1/${ep}?docId=${forbiddenId}`,
      );
      expect([res.status, await res.json()]).toEqual([
        404,
        { error: "not_found" },
      ]);
    }
  }

  // CRDT bait attack: otherWsIndexId lists studio's scriptDocId and Dana's privateDocId,
  // yet otherKey MUST NOT see them in /api/v1/folder or read them via /api/v1/lines!
  const otherFolder = await fx.requestWithBearer(otherKey, "/api/v1/folder");
  const otherFolderBody = (await otherFolder.json()) as {
    projects: { documents: { docId: string }[] }[];
  };
  const listedIds = otherFolderBody.projects.flatMap((p) =>
    p.documents.map((d) => d.docId),
  );
  expect(listedIds).toEqual([fx.otherWsDocId]);

  for (const baitedId of [fx.scriptDocId, fx.inkDocId, fx.privateDocId]) {
    const res = await fx.requestWithBearer(
      otherKey,
      `/api/v1/lines?docId=${baitedId}`,
    );
    expect([res.status, await res.json()]).toEqual([
      404,
      { error: "not_found" },
    ]);
  }
});

test("per-key rate limit (burst 30, 1/s, 429 with integer Retry-After) and immediate revocation", async () => {
  const fx = setupFixture();

  const created = (await (
    await fx.fetchAs("dana", "/api/workspace/api-keys/create", {
      workspaceId: fx.wsId,
      name: "Burst Key",
    })
  ).json()) as { key: string; row: { id: string } };

  // 30 requests in the burst succeed
  for (let i = 0; i < 30; i++) {
    const res = await fx.requestWithBearer(created.key, "/api/v1/folder");
    expect(res.status).toBe(200);
  }

  // 31st request hits 429 rate_limited with whole-second Retry-After >= 1
  const limited = await fx.requestWithBearer(created.key, "/api/v1/folder");
  expect([limited.status, await limited.json()]).toEqual([
    429,
    { error: "rate_limited" },
  ]);
  const retryAfter = limited.headers.get("retry-after");
  expect(retryAfter).toBe("1");

  // Advancing clock by 1000 ms refills 1 token -> 200 again and updates lastUsedAt
  fx.advance(1_000);
  const afterRefill = await fx.requestWithBearer(created.key, "/api/v1/folder");
  expect(afterRefill.status).toBe(200);

  // Revoking key immediately refuses further /api/v1/* calls with 401 unauthenticated
  const revoke = await fx.fetchAs("dana", "/api/workspace/api-keys/revoke", {
    workspaceId: fx.wsId,
    id: created.row.id,
  });
  expect([revoke.status, await revoke.json()]).toEqual([200, { ok: true }]);

  const afterRevoke = await fx.requestWithBearer(created.key, "/api/v1/folder");
  expect([afterRevoke.status, await afterRevoke.json()]).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
});
