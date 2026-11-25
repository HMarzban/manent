// Verifies that authority-only HTTP routes return 404 when sync runs in relay mode.
import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import { PROTOCOL_VERSION, indexDocId } from "@manent/sync-protocol";
import {
  createNotificationsService,
  createPublicApiService,
  createSearchService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
  createTrashService,
  createWorkspaceService,
} from "../src/index.ts";
import type { ServerConfig } from "../src/index.ts";
import { createFakeDirectory, fakeClock } from "../src/testing/index.ts";

function buildRelayServer(
  mode: "relay" | ((docId: string) => "authority" | "relay"),
) {
  const fc = fakeClock(1_000);
  const { clock } = fc;
  const storage = createMemoryStorage({ now: clock.now });
  const directory = createFakeDirectory([
    {
      user: { userId: "dana", name: "Dana" },
      workspaces: [{ id: "studio", name: "Studio", seeding: null }],
    },
  ]);
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: clock.now,
  });
  let idSeq = 1;
  let server: ReturnType<typeof createServer> | null = null;
  const syncRef = () => server!.sync!;
  const trash = createTrashService({
    storage,
    sync: syncRef,
    clock,
    names: (id) => id,
  });
  const search = createSearchService({
    storage,
    sync: syncRef,
    clock,
    searchIndex: {
      put() {},
      remove() {},
      headOf: () => null,
      indexedDocIds: () => [],
      query: () => [],
      close() {},
    },
  });
  const workspace = createWorkspaceService({
    storage,
    sync: syncRef,
    users: directory,
  });
  const notify = createNotificationsService({
    storage,
    users: directory,
    clock,
    openUrl: "http://localhost:4747",
    resendApiKey: null,
    resendFrom: null,
    fetch: globalThis.fetch,
  });
  const publicApi = createPublicApiService({
    storage,
    clock,
    ids: () => `k-${idSeq++}`,
    randomBytes: (len) => new Uint8Array(len).fill(1),
  });

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
        current: { protocol: PROTOCOL_VERSION, schema: 1, engine: 2, table: 1 },
        min: { protocol: PROTOCOL_VERSION, schema: 1, engine: 1, table: 1 },
      },
      allowedOrigins: ["http://localhost:4747"],
    },
    sync: {
      storage,
      clock,
      defer: fc.defer,
      ids: () => `s-${idSeq++}`,
      mode,
    },
    trash,
    search,
    workspace,
    notify,
    publicApi,
  };
  server = createServer(config);
  const token = sessions.issue("dana");
  const request = async (
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<[number, unknown]> => {
    const res = await server!.fetch(
      new Request(`http://localhost:4747${path}`, {
        method,
        headers: {
          Host: "localhost:4747",
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (res === null) throw new Error("unexpected upgrade");
    return [res.status, await res.json()];
  };
  return {
    request,
    stop() {
      trash.stop();
      search.stop();
      notify.stop();
    },
  };
}

test("relay mode returns 404 for trash, search, workspace, notifications, public-api, and api-keys routes", async () => {
  const relay = buildRelayServer("relay");
  try {
    const checks: [
      method: "GET" | "POST",
      path: string,
      body?: Record<string, unknown>,
    ][] = [
      ["POST", "/api/trash/list", { workspaceId: "studio" }],
      ["GET", "/api/search?q=hello&workspaceId=studio"],
      ["GET", "/api/workspace/people?workspaceId=studio"],
      ["GET", "/api/workspace/settings?workspaceId=studio"],
      [
        "POST",
        "/api/workspace/people/role",
        { workspaceId: "studio", userId: "dana", role: "edit" },
      ],
      ["GET", "/api/workspace/notifications?workspaceId=studio"],
      [
        "POST",
        "/api/workspace/notifications/set",
        { workspaceId: "studio", adapter: "webhook", address: null },
      ],
      ["GET", "/api/v1/folder"],
      ["GET", "/api/v1/lines?docId=019a0000-0000-7000-8000-000000000001"],
      ["GET", "/api/v1/fdx?docId=019a0000-0000-7000-8000-000000000001"],
      ["GET", "/api/v1/ink?docId=019a0000-0000-7000-8000-000000000001"],
      ["GET", "/api/workspace/api-keys?workspaceId=studio"],
      [
        "POST",
        "/api/workspace/api-keys/create",
        { workspaceId: "studio", name: "Bot" },
      ],
      [
        "POST",
        "/api/workspace/api-keys/revoke",
        { workspaceId: "studio", id: "k-1" },
      ],
    ];
    for (const [method, path, body] of checks) {
      expect(await relay.request(method, path, body)).toEqual([
        404,
        { error: "not_found" },
      ]);
    }
  } finally {
    relay.stop();
  }

  // Function-mode relay for one specific workspace also returns 404 on workspace-scoped routes
  const studioIndex = indexDocId("workspace", "studio");
  const partial = buildRelayServer((docId) =>
    docId === studioIndex ? "relay" : "authority",
  );
  try {
    expect(
      await partial.request("POST", "/api/trash/list", {
        workspaceId: "studio",
      }),
    ).toEqual([404, { error: "not_found" }]);
    // Function-mode relay (local-node) still serves /api/search offline from its own search index (not 404)
    expect(
      (
        await partial.request("GET", "/api/search?q=hello&workspaceId=studio")
      )[0],
    ).not.toBe(404);
    expect(
      await partial.request("GET", "/api/workspace/people?workspaceId=studio"),
    ).toEqual([404, { error: "not_found" }]);
    expect(
      await partial.request(
        "GET",
        "/api/workspace/notifications?workspaceId=studio",
      ),
    ).toEqual([404, { error: "not_found" }]);
    expect(
      await partial.request(
        "GET",
        "/api/workspace/api-keys?workspaceId=studio",
      ),
    ).toEqual([404, { error: "not_found" }]);
  } finally {
    partial.stop();
  }
});
