import { expect, test } from "bun:test";
import { createDoc, jsonMap } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import { PROTOCOL_VERSION, indexDocId, seedDocId } from "@manent/sync-protocol";
import type { DocRole, Identity } from "@manent/sync-protocol";
import {
  OWNER_CAPABILITIES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  createWorkspaceService,
} from "../src/index.ts";
import type {
  Directory,
  ServerConfig,
  SyncService,
  WorkspaceService,
} from "../src/index.ts";

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Okafor" },
  { userId: "priya", name: "Priya Nair" },
  { userId: "sam", name: "Sam Kovacs" },
  { userId: "outsider", name: "Alex Mercer" },
];

const directory: Directory = {
  user: (id) => PEOPLE.find((p) => p.userId === id) ?? null,
  workspacesOf: () => [],
};

function setupFixture() {
  let now = 1_000;
  const storage = createMemoryStorage({ now: () => now });
  const broadcasts: {
    docId: string;
    userId: string;
    role: DocRole | null;
    byUserId: string;
  }[] = [];
  const fakeSync = {
    membershipChanged(
      docId: string,
      userId: string,
      role: DocRole | null,
      byUserId: string,
    ) {
      broadcasts.push({ docId, userId, role, byUserId });
    },
  } as unknown as SyncService;

  const wsId = "studio";
  const otherWsId = "other";
  const wsIndexId = indexDocId("workspace", wsId);
  const otherWsIndexId = indexDocId("workspace", otherWsId);
  const projectId = seedDocId("ws-proj-1");
  const otherProjectId = seedDocId("ws-proj-2");
  const wsDocId = seedDocId("ws-doc-1");
  const ownDocId = seedDocId("ws-doc-own");
  const groupDocId = seedDocId("ws-doc-group");
  const otherWsDocId = seedDocId("other-ws-doc");

  // Place workspace index & seed its projects/documents maps in storage log
  const wsHome = { kind: "project" as const, id: wsIndexId };
  storage.directory.place(wsIndexId, wsHome, "index", "dana");
  const wsFile = storage.open(wsHome);
  wsFile.log.create({
    id: wsIndexId,
    kind: "index",
    ownerUserId: null,
    schemaVersion: 2,
    engineVersion: 1,
  });
  const wsCrdt = createDoc();
  jsonMap(wsCrdt, "projects").set(projectId, { title: "Main Project" });
  jsonMap(wsCrdt, "documents").set(wsDocId, { title: "Episode 1", projectId });
  jsonMap(wsCrdt, "documents").set(ownDocId, { title: "Episode 2", projectId });
  jsonMap(wsCrdt, "documents").set(groupDocId, {
    title: "Episode 3",
    projectId,
  });
  wsFile.log.append({
    docId: wsIndexId,
    generation: 1,
    update: wsCrdt.encodeState(),
    userId: "dana",
    origin: "edit",
    clocks: [],
  });
  wsCrdt.destroy();

  // Workspace memberships: dana & priya owners, sam editor; outsider is only in otherWs
  storage.directory.setRole(wsIndexId, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(wsIndexId, "priya", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(wsIndexId, "sam", "edit", []);

  storage.directory.place(
    otherWsIndexId,
    { kind: "project", id: otherWsIndexId },
    "index",
    "outsider",
  );
  storage.directory.setRole(
    otherWsIndexId,
    "outsider",
    "owner",
    OWNER_CAPABILITIES,
  );
  storage.directory.setRole(otherWsIndexId, "priya", "edit", []);

  // Place documents with distinct grant sources
  const projHome = { kind: "project" as const, id: projectId };
  const otherHome = { kind: "project" as const, id: otherProjectId };
  for (const id of [wsDocId, ownDocId, groupDocId]) {
    storage.directory.place(id, projHome, "script", "dana");
    storage.directory.setRole(id, "dana", "owner", OWNER_CAPABILITIES);
  }
  storage.directory.place(otherWsDocId, otherHome, "script", "outsider");
  storage.directory.setRole(
    otherWsDocId,
    "outsider",
    "owner",
    OWNER_CAPABILITIES,
  );

  // wsDocId: priya has source="workspace" with OWNER_CAPABILITIES (as access.ts:grant writes)
  storage.directory.setRole(wsDocId, "priya", "edit", OWNER_CAPABILITIES);
  storage.shareLinks.grant(wsDocId, "priya", "edit", "workspace");
  // ownDocId: priya has source="own" (must NOT be touched by workspace role change)
  storage.shareLinks.grant(ownDocId, "priya", "comment", "own");
  // groupDocId: priya has source="group:writers" (must NOT be touched)
  storage.shareLinks.grant(groupDocId, "priya", "edit", "group:writers");
  // otherWsDocId: priya has source="workspace" in ANOTHER workspace (must NOT be touched)
  storage.shareLinks.grant(otherWsDocId, "priya", "edit", "workspace");

  // Store sensitive settings in workspace_settings
  storage.workspace.set(
    wsId,
    "notifications.slack",
    "https://hooks.slack.com/services/T0001/B0002/secretToken9a8b",
    "dana",
  );
  storage.workspace.set(
    wsId,
    "notifications.webhook",
    '{"url":"https://user:pass@ops.example.com/hook/abcd1234","secret":"topsecret"}',
    "dana",
  );
  storage.workspace.set(wsId, "notifications.disabled", "", "dana");

  const workspace: WorkspaceService = createWorkspaceService({
    storage,
    users: directory,
    sync: () => fakeSync,
  });

  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: () => now,
  });
  const tokens: Readonly<Record<string, string>> = {
    dana: sessions.issue("dana"),
    priya: sessions.issue("priya"),
    sam: sessions.issue("sam"),
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
      tickets: createTicketStore({ now: () => now }),
      versions: {
        current: { protocol: PROTOCOL_VERSION, schema: 2, engine: 2, table: 1 },
        min: { protocol: PROTOCOL_VERSION, schema: 1, engine: 1, table: 1 },
      },
      allowedOrigins: ["http://localhost:4747"],
    },
    sync: null,
    workspace,
  };
  const server = createServer(config);
  const fetchAs = async (
    who: keyof typeof tokens | null,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Response> => {
    const token = who === null ? null : tokens[who]!;
    const response = await server.fetch(
      new Request(`http://localhost:4747${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Host: "localhost:4747",
          ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null) throw new Error("unexpected socket upgrade");
    return response;
  };

  return {
    storage,
    broadcasts,
    fetchAs,
    wsId,
    wsIndexId,
    wsDocId,
    ownDocId,
    groupDocId,
    otherWsDocId,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("unauthenticated requests are refused with 401 and non-members with 403 on every workspace endpoint", async () => {
  const fx = setupFixture();

  for (const [path, body] of [
    [`/api/workspace/people?workspaceId=${fx.wsId}`, undefined],
    [`/api/workspace/settings?workspaceId=${fx.wsId}`, undefined],
    [
      "/api/workspace/people/role",
      { workspaceId: fx.wsId, userId: "sam", role: "view" },
    ],
  ] as const) {
    const unauth = await fx.fetchAs(null, path, body);
    expect([unauth.status, await unauth.json()]).toEqual([
      401,
      { error: "unauthenticated" },
    ]);

    const outsider = await fx.fetchAs("outsider", path, body);
    expect([outsider.status, await outsider.json()]).toEqual([
      403,
      { error: "forbidden" },
    ]);
  }
});

test("non-owners cannot change roles and never receive setting values, while owners receive masked values", async () => {
  const fx = setupFixture();

  // Sam (edit member) can list people sorted by name
  const peopleRes = await fx.fetchAs(
    "sam",
    `/api/workspace/people?workspaceId=${fx.wsId}`,
  );
  expect([peopleRes.status, await peopleRes.json()]).toEqual([
    200,
    {
      people: [
        { userId: "dana", name: "Dana Okafor", role: "owner" },
        { userId: "priya", name: "Priya Nair", role: "owner" },
        { userId: "sam", name: "Sam Kovacs", role: "edit" },
      ],
    },
  ]);

  // Sam (non-owner) is refused 403 on role change
  const roleRes = await fx.fetchAs("sam", "/api/workspace/people/role", {
    workspaceId: fx.wsId,
    userId: "priya",
    role: "view",
  });
  expect([roleRes.status, await roleRes.json()]).toEqual([
    403,
    { error: "forbidden" },
  ]);

  // Sam (non-owner) sees on/off only, value is ALWAYS null
  const memberSettings = await fx.fetchAs(
    "sam",
    `/api/workspace/settings?workspaceId=${fx.wsId}`,
  );
  expect([memberSettings.status, await memberSettings.json()]).toEqual([
    200,
    {
      settings: [
        { key: "notifications.disabled", on: false, value: null },
        { key: "notifications.slack", on: true, value: null },
        { key: "notifications.webhook", on: true, value: null },
      ],
    },
  ]);

  // Dana (owner) receives host + last 4 chars only, never raw tokens/passwords
  const ownerSettings = await fx.fetchAs(
    "dana",
    `/api/workspace/settings?workspaceId=${fx.wsId}`,
  );
  const ownerBody = await ownerSettings.json();
  expect([ownerSettings.status, ownerBody]).toEqual([
    200,
    {
      settings: [
        { key: "notifications.disabled", on: false, value: null },
        {
          key: "notifications.slack",
          on: true,
          value: "hooks.slack.com/…9a8b",
        },
        {
          key: "notifications.webhook",
          on: true,
          value: "ops.example.com/…1234",
        },
      ],
    },
  ]);
  const serialized = JSON.stringify(ownerBody);
  expect(serialized.includes("secretToken")).toBe(false);
  expect(serialized.includes("user:pass")).toBe(false);
  expect(serialized.includes("topsecret")).toBe(false);
});

test("owner role change propagates only to workspace-sourced docs in that workspace, clears owner capabilities on demotion, and refuses demoting the last owner", async () => {
  const fx = setupFixture();

  // Demote Priya from owner to view
  const demote = await fx.fetchAs("dana", "/api/workspace/people/role", {
    workspaceId: fx.wsId,
    userId: "priya",
    role: "view",
  });
  expect([demote.status, await demote.json()]).toEqual([200, { ok: true }]);

  // Workspace index updated and owner capabilities cleared
  expect(fx.storage.directory.roleOf(fx.wsIndexId, "priya")).toEqual({
    role: "view",
    capabilities: [],
  });
  // Workspace-sourced doc in this workspace updated to view with capabilities cleared and source kept
  expect(fx.storage.directory.roleOf(fx.wsDocId, "priya")).toEqual({
    role: "view",
    capabilities: [],
  });
  expect(
    fx.storage.shareLinks
      .grantsOf(fx.wsDocId)
      .find((g) => g.userId === "priya"),
  ).toEqual({ userId: "priya", role: "view", source: "workspace" });

  // Non-workspace sources (own, group:writers) and other workspace docs are untouched
  expect(
    fx.storage.shareLinks
      .grantsOf(fx.ownDocId)
      .find((g) => g.userId === "priya"),
  ).toEqual({ userId: "priya", role: "comment", source: "own" });
  expect(
    fx.storage.shareLinks
      .grantsOf(fx.groupDocId)
      .find((g) => g.userId === "priya"),
  ).toEqual({ userId: "priya", role: "edit", source: "group:writers" });
  expect(
    fx.storage.shareLinks
      .grantsOf(fx.otherWsDocId)
      .find((g) => g.userId === "priya"),
  ).toEqual({ userId: "priya", role: "edit", source: "workspace" });

  // Broadcasts emitted for workspace index and wsDocId only
  expect(fx.broadcasts).toEqual([
    { docId: fx.wsIndexId, userId: "priya", role: "view", byUserId: "dana" },
    { docId: fx.wsDocId, userId: "priya", role: "view", byUserId: "dana" },
  ]);

  // Demoting Dana (now the last owner) is refused with 400 invalid
  const lastOwner = await fx.fetchAs("dana", "/api/workspace/people/role", {
    workspaceId: fx.wsId,
    userId: "dana",
    role: "edit",
  });
  expect([lastOwner.status, await lastOwner.json()]).toEqual([
    400,
    { error: "invalid" },
  ]);
  expect(fx.storage.directory.roleOf(fx.wsIndexId, "dana")?.role).toBe("owner");

  // Promoting Sam to owner upgrades workspace index to owner and downgrades doc role to edit (source = "workspace")
  fx.storage.shareLinks.grant(fx.wsDocId, "sam", "comment", "workspace");
  const promote = await fx.fetchAs("dana", "/api/workspace/people/role", {
    workspaceId: fx.wsId,
    userId: "sam",
    role: "owner",
  });
  expect([promote.status, await promote.json()]).toEqual([200, { ok: true }]);
  expect(fx.storage.directory.roleOf(fx.wsIndexId, "sam")?.role).toBe("owner");
  expect(
    fx.storage.shareLinks.grantsOf(fx.wsDocId).find((g) => g.userId === "sam"),
  ).toEqual({ userId: "sam", role: "edit", source: "workspace" });
});
