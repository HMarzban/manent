import { afterEach, expect, test } from "bun:test";
import type { BlockJSON } from "@manent/schema";
import { createSignedSessionStore } from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type {
  PrompterHandle,
  PrompterStatus,
  SyncClient,
} from "@manent/sync-client";
import type { PrompterRow } from "@manent/sync-protocol";
import { createMockMosPrompter } from "@manent/testkit";
import type { MockMosPrompter } from "@manent/testkit";
import {
  createMosLanRelay,
  createShellChannel,
  localRoutes,
} from "../src/index.ts";
import type { PrompterFeedSnapshot } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const RUNDOWN_A = "44444444-4444-7444-8444-444444444444";
const RUNDOWN_B = "55555555-5555-7555-8555-555555555555";

const block = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

function createSubscribable<T>(initial: T) {
  let current = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    view: {
      get: () => current,
      subscribe(fn: (v: T) => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    set(next: T) {
      current = next;
      for (const fn of listeners) fn(next);
    },
  };
}

let mockPrompter: MockMosPrompter | null = null;
afterEach(async () => {
  if (mockPrompter !== null) {
    await mockPrompter.close();
    mockPrompter = null;
  }
});

test("createMosLanRelay streams ADR 0050 spoken text, incremental updates and roDelete to mock MOS prompter", async () => {
  mockPrompter = await createMockMosPrompter();
  let snapshot: PrompterFeedSnapshot | null = {
    runOrder: [
      {
        rowId: "r-h1",
        kind: "header",
        number: null,
        title: "ACT ONE",
        storyId: null,
        durationMs: null,
      },
      {
        rowId: "r-1",
        kind: "story",
        number: 1,
        title: "Monologue",
        storyId: "s-1",
        durationMs: 45_000,
      },
    ],
    stories: new Map([
      [
        "s-1",
        [
          block("b1", "action", "Camera pushes in slowly."),
          block("b2", "character", "Host"),
          block("b3", "dialogue", "Good evening everyone."),
        ],
      ],
    ]),
  };
  const listeners = new Set<() => void>();
  const feed = {
    current: () => snapshot,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  const started = await createMosLanRelay({
    config: {
      rundownId: RUNDOWN_A,
      roSlug: "Late Desk",
      host: mockPrompter.host,
      upperPort: mockPrompter.port,
      mosId: "autoscript.studio",
      ncsId: "manent.ncs",
      dialect: "autoscript_winplus_ip",
      allowedCidrs: [],
    },
    feed,
  });
  expect(started.ok).toBe(true);
  if (!started.ok) return;

  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roStorySend" && m.storyId === "r-1"),
  );
  const ro = mockPrompter.runningOrders.get(RUNDOWN_A);
  expect(ro?.roSlug).toBe("Late Desk");
  expect(ro?.stories).toHaveLength(1);
  // ADR 0050: action block excluded; character uppercased + dialogue included
  expect(ro?.stories[0]?.paragraphs).toEqual([
    "HOST",
    "Good evening everyone.",
  ]);
  expect(ro?.stories[0]?.presenter).toBe("HOST");
  expect(started.status()).toBe("live");

  // Incremental story addition + spoken text update
  snapshot = {
    runOrder: [
      ...snapshot.runOrder,
      {
        rowId: "r-2",
        kind: "story",
        number: 2,
        title: "Weather",
        storyId: "s-2",
        durationMs: 30_000,
      },
    ],
    stories: new Map([
      ...snapshot.stories,
      ["s-2", [block("b4", "dialogue", "Clear skies tonight.")]],
    ]),
  };
  for (const fn of listeners) fn();

  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roStorySend" && m.storyId === "r-2"),
  );
  expect(
    mockPrompter.runningOrders.get(RUNDOWN_A)?.stories.map((s) => s.storyId),
  ).toEqual(["r-1", "r-2"]);

  // Stopping sends roDelete and transitions status to off
  await started.stop();
  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roDelete" && m.roId === RUNDOWN_A),
  );
  expect(mockPrompter.runningOrders.has(RUNDOWN_A)).toBe(false);
  expect(started.status()).toBe("off");
});

test("createMosLanRelay denies SSRF metadata, public IPs and IPv4-mapped IPv6 bypasses", async () => {
  const emptyFeed = { current: () => null, subscribe: () => () => {} };
  for (const host of ["169.254.169.254", "8.8.8.8", "::ffff:169.254.169.254"]) {
    const res = await createMosLanRelay({
      config: {
        rundownId: RUNDOWN_A,
        roSlug: "Show",
        host,
        upperPort: 10541,
        mosId: "autoscript.studio",
        ncsId: "manent.ncs",
        dialect: "mos_2_8_5",
        allowedCidrs: [],
      },
      feed: emptyFeed,
    });
    expect(res).toEqual({ ok: false, reason: "host_not_allowed" });
  }
});

test("localRoutes /api/local/mos checks handshake, streams PrompterHandle, enforces auth/busy and cleans up onClose", async () => {
  mockPrompter = await createMockMosPrompter();
  const fc = fakeClock(20_000);
  const records = createMemoryRecords();
  records.savePerson({
    userId: "sam",
    name: "Sam",
    wantsCloud: false,
    cloudToken: null,
    chosenAt: 1,
  });
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: fc.clock.now,
  });
  const token = sessions.issue("sam");
  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const runOrder = createSubscribable<readonly PrompterRow[]>([
    {
      rowId: "r-1",
      kind: "story",
      number: 1,
      title: "Intro",
      storyId: "s-1",
      durationMs: 20_000,
    },
  ]);
  const stories = createSubscribable<ReadonlyMap<string, readonly BlockJSON[]>>(
    new Map([["s-1", [block("b1", "dialogue", "Welcome back.")]]]),
  );
  const status = createSubscribable<PrompterStatus>({
    feed: "live",
    lastReceivedAt: 20_000,
  });
  let handleClosed = false;
  const fakeHandle: PrompterHandle = {
    runOrder: runOrder.view,
    stories: stories.view,
    status: status.view,
    close() {
      handleClosed = true;
    },
  };
  const fakeClient = {
    prompter: () => fakeHandle,
  } as unknown as SyncClient;

  const closeHooks: (() => void)[] = [];
  const handle = localRoutes({
    records,
    shell: createShellChannel({ clock: fc.clock, heartbeatMs: 30_000 }),
    sessions,
    signInToSync: async () => ({ ok: true }),
    onFocus: () => {},
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    setConnection: () => {},
    clientOf: (uid) => (uid === "sam" ? fakeClient : null),
    clock: fc.clock,
    onClose: (fn) => closeHooks.push(fn),
  });

  // Unauthenticated rejected 401
  const unauth = await handle(new Request("http://127.0.0.1/api/local/mos"));
  expect(unauth?.status).toBe(401);

  // Handshake check succeeds against mock prompter
  const check = await handle(
    new Request("http://127.0.0.1/api/local/mos/check", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        host: mockPrompter.host,
        upperPort: mockPrompter.port,
      }),
    }),
  );
  expect(check?.status).toBe(200);
  expect(await check!.json()).toEqual({ ok: true });

  // Start LAN MOS relay
  const started = await handle(
    new Request("http://127.0.0.1/api/local/mos", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rundownId: RUNDOWN_A,
        roSlug: "Nightly",
        host: mockPrompter.host,
        upperPort: mockPrompter.port,
      }),
    }),
  );
  expect(started?.status).toBe(200);
  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roStorySend" && m.storyId === "r-1"),
  );
  expect(
    mockPrompter.runningOrders.get(RUNDOWN_A)?.stories[0]?.paragraphs,
  ).toEqual(["Welcome back."]);

  // Second rundown while first is active returns 409 busy
  const busy = await handle(
    new Request("http://127.0.0.1/api/local/mos", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rundownId: RUNDOWN_B,
        host: mockPrompter.host,
        upperPort: mockPrompter.port,
      }),
    }),
  );
  expect(busy?.status).toBe(409);

  // GET returns live status
  const got = await handle(
    new Request("http://127.0.0.1/api/local/mos", { headers: auth }),
  );
  expect(got?.status).toBe(200);
  const gotBody = (await got!.json()) as {
    rundownId: string;
    status: string;
  };
  expect(gotBody.rundownId).toBe(RUNDOWN_A);
  expect(gotBody.status).toBe("live");

  // onClose tears down cleanly and closes PrompterHandle
  for (const fn of closeHooks) fn();
  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roDelete" && m.roId === RUNDOWN_A),
  );
  expect(handleClosed).toBe(true);
});

test("createMosLanRelay preserves atomicity on TCP failure, resyncs on reconnect, and syncs story reorders via MOVE", async () => {
  // Start with a closed ephemeral port so initial TCP send fails
  const probe = await createMockMosPrompter();
  const port = probe.port;
  await probe.close();

  const row1: PrompterRow = {
    rowId: "r-1",
    kind: "story",
    number: 1,
    title: "Lead",
    storyId: "s-1",
    durationMs: 20_000,
  };
  const row2: PrompterRow = {
    rowId: "r-2",
    kind: "story",
    number: 2,
    title: "Second",
    storyId: "s-2",
    durationMs: 20_000,
  };
  const row3: PrompterRow = {
    rowId: "r-3",
    kind: "story",
    number: 3,
    title: "Third",
    storyId: "s-3",
    durationMs: 20_000,
  };

  let snapshot: PrompterFeedSnapshot = {
    runOrder: [row1, row2, row3],
    stories: new Map([
      ["s-1", [block("b1", "dialogue", "First line.")]],
      ["s-2", [block("b2", "dialogue", "Second line.")]],
      ["s-3", [block("b3", "dialogue", "Third line.")]],
    ]),
  };
  const listeners = new Set<() => void>();
  const statuses: string[] = [];
  const feed = {
    current: () => snapshot,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  const relay = await createMosLanRelay({
    config: {
      rundownId: RUNDOWN_A,
      roSlug: "Resilience Show",
      host: "127.0.0.1",
      upperPort: port,
      mosId: "autoscript.studio",
      ncsId: "manent.ncs",
      dialect: "mos_2_8_5",
      allowedCidrs: [],
    },
    feed,
    onStatus: (s) => statuses.push(s),
  });
  expect(relay.ok).toBe(true);
  if (!relay.ok) return;

  // Wait for initial TCP failure to mark status "lost" (created must stay false!)
  const deadline = Date.now() + 2_000;
  while (relay.status() !== "lost" && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 10));
  expect(relay.status()).toBe("lost");

  // Bring mock MOS prompter up on the same port and trigger feed sync -> full roCreate + all stories arrive
  mockPrompter = await createMockMosPrompter({ host: "127.0.0.1", port });
  for (const fn of listeners) fn();

  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roStorySend" && m.storyId === "r-3"),
  );
  expect(
    mockPrompter.runningOrders.get(RUNDOWN_A)?.stories.map((s) => s.storyId),
  ).toEqual(["r-1", "r-2", "r-3"]);
  expect(relay.status()).toBe("live");

  // Reorder stories with identical IDs and content/hashes: [r-1, r-2, r-3] -> [r-3, r-1, r-2]
  snapshot = {
    ...snapshot,
    runOrder: [row3, row1, row2],
  };
  for (const fn of listeners) fn();

  await mockPrompter.waitFor((msgs) =>
    msgs.some((m) => m.kind === "roElementAction" && m.operation === "MOVE"),
  );
  expect(
    mockPrompter.runningOrders.get(RUNDOWN_A)?.stories.map((s) => s.storyId),
  ).toEqual(["r-3", "r-1", "r-2"]);

  // Drop TCP connection to simulate transient loss, then recover -> full roCreate resync
  const createsBefore = mockPrompter.received.filter(
    (m) => m.kind === "roCreate",
  ).length;
  mockPrompter.disconnectAll();
  const lossDeadline = Date.now() + 2_000;
  while (relay.status() !== "lost" && Date.now() < lossDeadline)
    await new Promise((r) => setTimeout(r, 10));
  expect(relay.status()).toBe("lost");

  // Trigger sync after disconnect -> full roCreate resync restores exact reordered stories
  for (const fn of listeners) fn();
  await mockPrompter.waitFor(
    (msgs) =>
      msgs.filter((m) => m.kind === "roCreate").length > createsBefore &&
      msgs.filter((m) => m.kind === "roStorySend").length >= 6,
  );
  expect(relay.status()).toBe("live");
  expect(
    mockPrompter.runningOrders.get(RUNDOWN_A)?.stories.map((s) => s.storyId),
  ).toEqual(["r-3", "r-1", "r-2"]);

  await relay.stop();
});
