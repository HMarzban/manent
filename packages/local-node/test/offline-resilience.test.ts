import { afterAll, beforeAll, expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { serveWithBun } from "@manent/server-core";
import type { Listener } from "@manent/server-core";
import {
  createFakeDirectory,
  createFakeSignIn,
} from "@manent/server-core/testing";
import {
  ConnectError,
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { createFakeClock } from "@manent/sync-client/testing";
import { createTempTrees, startTestServer } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import {
  bunTransport,
  bunUpstreamPorts,
  createCloudStatus,
  createDesktopNode,
} from "../src/index.ts";
import type { CloudApi, DesktopNode, NodeCore } from "../src/index.ts";
import { fetchWithTimeout } from "../src/upstream/cloud-requests.ts";

const TIMEOUT = { timeout: 30_000 };
// Matches any current server build's schema/engine/table versions in integration tests.
const CURRENT_V = { protocol: 1, schema: 99, engine: 99, table: 99 };
const MIN_V = { protocol: 1, schema: 0, engine: 0, table: 0 };
const PEOPLE = [
  { userId: "sam", name: "Sam Okafor" },
  { userId: "dana", name: "Dana Reyes" },
  { userId: "you", name: "You" },
];
const WORKSPACES = [{ id: "lamp-room", name: "Lamp Room", seeding: null }];
const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const DOC_OFFLINE = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const DOC_SYNC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";

const trees = createTempTrees("manent-offline-");
let liveCloud: TestServer;
let webDir: string;
const running: { node: DesktopNode; listener: Listener }[] = [];

beforeAll(async () => {
  liveCloud = await startTestServer({ dataDir: await trees.tree({}) });
  webDir = await trees.tree({ "index.html": "<!doctype html><html></html>" });
}, 30_000);

afterAll(async () => {
  for (const entry of running.splice(0)) {
    await entry.listener.stop();
    await entry.node.close();
  }
  await liveCloud.stop();
  await trees.removeAll();
});

function deadPort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

async function launchNode(root: string, cloudUrl: string) {
  const fake = createFakeSignIn(PEOPLE);
  const start = await createDesktopNode({
    root,
    cloudUrl,
    webDir,
    signIn: {
      describe: () => ({
        choices: fake
          .describe()
          .choices.map((c) => ({ ...c, registered: c.userId !== "you" })),
      }),
      authenticate: (body: unknown) => fake.authenticate(body),
    },
    directory: createFakeDirectory(
      PEOPLE.map((user) => ({
        user,
        workspaces: user.userId === "you" ? [] : WORKSPACES,
      })),
    ),
    versions: { current: CURRENT_V, min: MIN_V },
    build: "test",
    platform: process.platform,
    renderPdf: async () => new Uint8Array(),
    boot: null,
  });
  if (!start.ok) throw new Error(`node did not start: ${start.reason}`);
  let core: NodeCore | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => core!.server,
    () => new Response("", { status: 500 }),
  );
  const nodeUrl = `http://127.0.0.1:${listener.port}`;
  core = start.node.listening(nodeUrl);
  const entry = { node: start.node, listener };
  running.push(entry);
  return {
    nodeUrl,
    launchToken: start.node.launchToken,
    async stop() {
      const idx = running.indexOf(entry);
      if (idx !== -1) running.splice(idx, 1);
      await listener.stop();
      await start.node.close();
    },
  };
}

function windowClient(options: {
  baseUrl: string;
  userId: string;
  token: string;
  launchToken?: string;
}): SyncClient {
  const { baseUrl, userId, token, launchToken } = options;
  const extra: Record<string, string> =
    launchToken === undefined ? {} : { "X-Manent-Launch": launchToken };
  const customFetch: typeof fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      for (const [k, v] of Object.entries(extra)) headers.set(k, v);
      return fetch(input, { ...init, headers });
    },
    { preconnect: fetch.preconnect },
  );
  const ports = bunUpstreamPorts({
    now: Date.now,
    random: Math.random,
    bytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  });
  return createSyncClient({
    userId,
    deviceId: `test-window-${userId}`,
    build: "test",
    versions: CURRENT_V,
    minServer: MIN_V,
    via: launchToken === undefined ? "server" : "local_node",
    ports: {
      ...ports,
      transport: bunTransport({
        baseUrl,
        token: () => token,
        fetch: customFetch,
        socket(url, origin) {
          const made: unknown = Reflect.construct(WebSocket, [
            url,
            { headers: { Origin: origin, ...extra } },
          ]);
          if (!(made instanceof WebSocket))
            throw new TypeError(`no socket for ${url}`);
          return made;
        },
      }),
      store: createMemoryStore(userId),
      leader: soloLeader(`test-window-${userId}`),
    },
  });
}

async function waitFor(fn: () => boolean | Promise<boolean>, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await Bun.sleep(20);
  }
  throw new Error(`condition timed out after ${ms} ms`);
}

const linesOf = (h: DocHandle): string[] =>
  blocksOf(scriptBody(h.doc()).materialize()).map(blockText);

function sseReader(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  return {
    async next(): Promise<unknown> {
      while (true) {
        while (!buf.includes("\n\n")) {
          const { done, value } = await reader.read();
          if (done) throw new Error("SSE stream ended");
          buf += decoder.decode(value, { stream: true });
        }
        const cut = buf.indexOf("\n\n");
        const frame = buf.slice(0, cut).trim();
        buf = buf.slice(cut + 2);
        if (frame.startsWith("data: ")) return JSON.parse(frame.slice(6));
      }
    },
    cancel: () => reader.cancel(),
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test(
  "cold launch against unreachable cloud serves auth, demo, me, local status, and cloud_state SSE",
  async () => {
    const launched = await launchNode(
      await trees.tree({}),
      `http://127.0.0.1:${deadPort()}`,
    );
    const h = { "X-Manent-Launch": launched.launchToken };

    await waitFor(async () => {
      const body = (await (
        await fetch(`${launched.nodeUrl}/api/local/status`, { headers: h })
      ).json()) as {
        online: boolean;
        mode: string;
      };
      return body.online === false && body.mode === "online";
    });
    const statusRes = await fetch(`${launched.nodeUrl}/api/local/status`, {
      headers: h,
    });
    expect([statusRes.status, await statusRes.json()]).toEqual([
      200,
      { online: false, mode: "online" },
    ]);

    const sse = sseReader(
      await fetch(`${launched.nodeUrl}/api/local/shell/events`, { headers: h }),
    );
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: false });
    expect(
      (
        await postJson(`${launched.nodeUrl}/api/local/shell`, h, {
          v: 1,
          t: "first_frame",
        })
      ).status,
    ).toBe(204);
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: false });
    await sse.cancel();

    const choicesRes = await fetch(`${launched.nodeUrl}/api/sign-in`, {
      headers: h,
    });
    const choices = (
      (await choicesRes.json()) as { choices: { userId: string }[] }
    ).choices;
    expect([choicesRes.status, choices.map((c) => c.userId)]).toEqual([
      200,
      ["sam", "dana", "you"],
    ]);

    const demoRes = await fetch(`${launched.nodeUrl}/api/demo`, { headers: h });
    expect([demoRes.status, await demoRes.json()]).toEqual([
      200,
      { demo: true, seedId: null, control: null },
    ]);

    for (const [userId, expected] of [
      ["sam", { userId: "sam", name: "Sam Okafor", workspaces: WORKSPACES }],
      ["you", { userId: "you", name: "You", workspaces: [] }],
    ] as const) {
      const signed = await postJson(`${launched.nodeUrl}/api/sign-in`, h, {
        userId,
      });
      expect(signed.status).toBe(200);
      const { token } = (await signed.json()) as { token: string };
      const me = await fetch(`${launched.nodeUrl}/api/me`, {
        headers: { ...h, Authorization: `Bearer ${token}` },
      });
      expect([me.status, await me.json()]).toEqual([200, expected]);
    }
    await launched.stop();
  },
  TIMEOUT,
);

test(
  "creating and editing a script offline persists in SQLite across node close and offline reopen",
  async () => {
    const root = await trees.tree({});
    const closedUrl = `http://127.0.0.1:${deadPort()}`;

    const first = await launchNode(root, closedUrl);
    const h1 = { "X-Manent-Launch": first.launchToken };
    const { token: t1 } = (await (
      await postJson(`${first.nodeUrl}/api/sign-in`, h1, { userId: "dana" })
    ).json()) as {
      token: string;
    };
    expect(
      (
        await postJson(
          `${first.nodeUrl}/api/docs`,
          { ...h1, Authorization: `Bearer ${t1}` },
          {
            docId: DOC_OFFLINE,
            kind: "script",
            home: `project:${PROJECT}`,
          },
        )
      ).status,
    ).toBe(200);

    const c1 = windowClient({
      baseUrl: first.nodeUrl,
      userId: "dana",
      token: t1,
      launchToken: first.launchToken,
    });
    const handle1 = await c1.open(DOC_OFFLINE);
    scriptBody(handle1.doc()).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: "b000000000000001", type: "scene_heading" },
          content: [{ type: "text", text: "INT. LIGHTHOUSE - NIGHT" }],
        },
        {
          type: "block",
          attrs: { id: "b000000000000002", type: "action" },
          content: [{ type: "text", text: "Written entirely offline." }],
        },
      ]),
    );
    await waitFor(
      () =>
        handle1.status.get().saved === true &&
        handle1.status.get().waiting === 0,
    );
    expect(handle1.status.get()).toMatchObject({
      saved: true,
      synced: false,
      waiting: 0,
    });
    await c1.close();
    await first.stop();

    const second = await launchNode(root, closedUrl);
    const h2 = { "X-Manent-Launch": second.launchToken };
    const { token: t2 } = (await (
      await postJson(`${second.nodeUrl}/api/sign-in`, h2, { userId: "dana" })
    ).json()) as {
      token: string;
    };
    const c2 = windowClient({
      baseUrl: second.nodeUrl,
      userId: "dana",
      token: t2,
      launchToken: second.launchToken,
    });
    const handle2 = await c2.open(DOC_OFFLINE);
    await waitFor(() => linesOf(handle2).length === 2);
    expect(linesOf(handle2)).toEqual([
      "INT. LIGHTHOUSE - NIGHT",
      "Written entirely offline.",
    ]);
    await c2.close();
    await second.stop();
  },
  TIMEOUT,
);

test(
  "POST /api/local/connection offline/online toggles cloud_state SSE, gates HTTP, and syncs queued edits cleanly",
  async () => {
    const launched = await launchNode(await trees.tree({}), liveCloud.url);
    const h = { "X-Manent-Launch": launched.launchToken };
    const sse = sseReader(
      await fetch(`${launched.nodeUrl}/api/local/shell/events`, { headers: h }),
    );
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: true });

    expect(
      (
        await postJson(`${launched.nodeUrl}/api/local/connection`, h, {
          mode: "offline",
          delayMs: 0,
        })
      ).status,
    ).toBe(204);
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: false });
    expect(
      await (
        await fetch(`${launched.nodeUrl}/api/local/status`, { headers: h })
      ).json(),
    ).toEqual({ online: false, mode: "offline" });

    const { token } = (await (
      await postJson(`${launched.nodeUrl}/api/sign-in`, h, { userId: "sam" })
    ).json()) as { token: string };
    const auth = { ...h, Authorization: `Bearer ${token}` };
    const blocked = await postJson(
      `${launched.nodeUrl}/api/local/sign-in-to-sync`,
      auth,
    );
    expect([blocked.status, await blocked.json()]).toEqual([
      503,
      { error: "unreachable" },
    ]);

    expect(
      (
        await postJson(`${launched.nodeUrl}/api/docs`, auth, {
          docId: DOC_SYNC,
          kind: "script",
          home: `project:${PROJECT}`,
        })
      ).status,
    ).toBe(200);
    const win = windowClient({
      baseUrl: launched.nodeUrl,
      userId: "sam",
      token,
      launchToken: launched.launchToken,
    });
    const handle = await win.open(DOC_SYNC);
    scriptBody(handle.doc()).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: "b000000000000010", type: "scene_heading" },
          content: [{ type: "text", text: "EXT. HARBOUR - DAWN" }],
        },
      ]),
    );
    await waitFor(
      () =>
        handle.status.get().saved === true && handle.status.get().waiting === 0,
    );
    expect(handle.status.get().synced).toBe(false);

    expect(
      (
        await postJson(`${launched.nodeUrl}/api/local/connection`, h, {
          mode: "online",
          delayMs: 0,
        })
      ).status,
    ).toBe(204);
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: true });
    expect(
      await (
        await fetch(`${launched.nodeUrl}/api/local/status`, { headers: h })
      ).json(),
    ).toEqual({ online: true, mode: "online" });
    await waitFor(() => handle.status.get().synced === true);

    await postJson(`${launched.nodeUrl}/api/local/connection`, h, {
      mode: "offline",
      delayMs: 0,
    });
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: false });
    scriptBody(handle.doc()).write((w) =>
      w.insertBlocks("b000000000000010", [
        {
          type: "block",
          attrs: { id: "b000000000000011", type: "action" },
          content: [{ type: "text", text: "The ferry horn echoes." }],
        },
      ]),
    );
    await waitFor(
      () =>
        handle.status.get().saved === true &&
        handle.status.get().synced === false,
    );

    await postJson(`${launched.nodeUrl}/api/local/connection`, h, {
      mode: "online",
      delayMs: 0,
    });
    expect(await sse.next()).toEqual({ v: 1, t: "cloud_state", online: true });
    await waitFor(() => handle.status.get().synced === true);

    const cloudClient = windowClient({
      baseUrl: liveCloud.url,
      userId: "sam",
      token: await liveCloud.token("sam"),
    });
    const cloudHandle = await cloudClient.open(DOC_SYNC);
    await waitFor(() => linesOf(cloudHandle).length === 2);
    expect(linesOf(cloudHandle)).toEqual([
      "EXT. HARBOUR - DAWN",
      "The ferry horn echoes.",
    ]);
    await sse.cancel();
    await cloudClient.close();
    await win.close();
    await launched.stop();
  },
  TIMEOUT,
);

const rejectUnreachable = () => Promise.reject(new ConnectError("unreachable"));

test("fetchWithTimeout aborts blackholed requests and createCloudStatus recovers automatically", async () => {
  const hanging: typeof fetch = Object.assign(
    (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_res, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    { preconnect: () => {} },
  );
  await expect(
    fetchWithTimeout(hanging, "http://198.51.100.1/api/demo", {}, 30),
  ).rejects.toMatchObject({ code: "unreachable" });

  const fake = createFakeClock(0);
  let up = false;
  const changes: boolean[] = [];
  let recovered = 0;
  const tracker = createCloudStatus({
    cloud: {
      signIn: () =>
        up ? Promise.resolve({ ok: true, token: "t" }) : rejectUnreachable(),
      demo: () =>
        up ? Promise.resolve({ seedId: "s1" }) : rejectUnreachable(),
      describe: rejectUnreachable,
      adopt: rejectUnreachable,
      forward: rejectUnreachable,
    } satisfies CloudApi,
    clock: fake.clock,
    onOnlineChange: (online) => void changes.push(online),
    onRecovered: () => void (recovered += 1),
  });
  expect(await tracker.probe()).toBe(false);
  expect([tracker.status(), changes]).toEqual([
    { online: false, mode: "online" },
    [false],
  ]);

  up = true;
  fake.advance(5_000);
  await Promise.resolve();
  await Promise.resolve();
  expect([tracker.status(), changes, recovered]).toEqual([
    { online: true, mode: "online" },
    [false, true],
    1,
  ]);

  tracker.setMode("offline");
  expect(tracker.status()).toEqual({ online: false, mode: "offline" });
  await expect(tracker.cloud.demo()).rejects.toMatchObject({
    code: "unreachable",
  });
  tracker.stop();
  expect(fake.pending()).toBe(0);
});
