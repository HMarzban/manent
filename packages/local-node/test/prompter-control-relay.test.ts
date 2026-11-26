import { expect, test } from "bun:test";
import {
  createHistoryService,
  createPrompterService,
  createSignedSessionStore,
  createSyncService,
} from "@manent/server-core";
import { fakeClock, fakePeer } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import { ConnectError } from "@manent/sync-client";
import type {
  PrompterHandle,
  PrompterStatus,
  SyncClient,
} from "@manent/sync-client";
import {
  parsePrompterOperatorChanged,
  parsePrompterScrollControl,
} from "@manent/sync-protocol";
import type {
  Message,
  PrompterOperator,
  PrompterRow,
} from "@manent/sync-protocol";
import {
  RELAYED_CONTROL_KINDS,
  createPrompterControlHttpProxy,
  createPrompterRelay,
  relayControl,
} from "../src/index.ts";
import type { Editor, NodeCoreOptions, UpstreamFactory } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

type RemoteScrollValue = ReturnType<
  NonNullable<PrompterHandle["scroll"]>["get"]
>;

const PROJECT = "11111111-1111-7111-8111-111111111111";
const SYNCED_RUNDOWN = "22222222-2222-7222-8222-222222222222";
const LOCAL_RUNDOWN = "33333333-3333-7333-8333-333333333333";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

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

test("RELAYED_CONTROL_KINDS includes prompter_operator_changed and prompter_scroll and relays both", () => {
  expect(RELAYED_CONTROL_KINDS).toContain("prompter_operator_changed");
  expect(RELAYED_CONTROL_KINDS).toContain("prompter_scroll");
  const seen: { docId: string; kind: string; data: Uint8Array }[] = [];
  const editor: Editor = {
    userId: "sam",
    docs: new Map([[SYNCED_RUNDOWN, 1]]),
    control(docId, kind, data) {
      seen.push({ docId, kind, data });
    },
  };
  const opBytes = new TextEncoder().encode('{"operator":null}');
  const scrollBytes = new TextEncoder().encode('{"scroll":{"seq":1}}');
  relayControl([editor], SYNCED_RUNDOWN, {
    kind: "prompter_operator_changed",
    data: opBytes,
  });
  relayControl([editor], SYNCED_RUNDOWN, {
    kind: "prompter_scroll",
    data: scrollBytes,
  });
  expect(seen).toEqual([
    {
      docId: SYNCED_RUNDOWN,
      kind: "prompter_operator_changed",
      data: opBytes,
    },
    { docId: SYNCED_RUNDOWN, kind: "prompter_scroll", data: scrollBytes },
  ]);
});

test("createPrompterRelay forwards upstream operator and scroll CONTROL frames to local prompter peers", () => {
  const fc = fakeClock(50_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const runOrder = createSubscribable<readonly PrompterRow[]>([]);
  const stories = createSubscribable(new Map());
  const status = createSubscribable<PrompterStatus>({
    feed: "live",
    lastReceivedAt: 50_000,
  });
  const operator = createSubscribable<PrompterOperator | null>({
    userId: "sam",
    name: "Sam",
    deviceId: "dev-1",
    since: 49_000,
    expiresAt: 79_000,
  });
  const scroll = createSubscribable<RemoteScrollValue>({
    state: {
      seq: 1,
      playing: true,
      linesPerSecond: 4,
      rowId: "row-1",
      lineOffset: 0,
      updatedAt: 49_500,
      operatorUserId: "sam",
      operatorDeviceId: "dev-1",
    },
    clockOffsetMs: 0,
  });

  const fakeHandle: PrompterHandle = {
    runOrder: runOrder.view,
    stories: stories.view,
    status: status.view,
    operator: operator.view,
    scroll: scroll.view,
    close() {},
  };
  const fakeUpstream: UpstreamFactory = {
    create() {
      return {
        setOnline() {},
        prompter: () => fakeHandle,
        close: async () => {},
      } as unknown as SyncClient;
    },
    store() {
      throw new Error("store not used");
    },
  };
  const records = createMemoryRecords();
  records.savePerson({
    userId: "dana",
    name: "Dana",
    wantsCloud: true,
    cloudToken: "tok",
    chosenAt: 1,
  });

  let idSeq = 0;
  let sync!: ReturnType<typeof createSyncService>;
  const relay = createPrompterRelay({
    storage,
    records,
    upstream: fakeUpstream,
    sync: () => sync,
    clock: fc.clock,
    airWindowOf: () => null,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids: () => `id-${++idSeq}`,
    versions: { current: V1, min: V1 },
    prompterSubscribe: relay.subscribe,
  });
  sync.access.create("sam", {
    docId: SYNCED_RUNDOWN,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(SYNCED_RUNDOWN, "dana", "view", []);

  const dana = fakePeer({ userId: "dana", name: "Dana" });
  sync.attach(dana);
  sync.receive(dana, {
    type: "SUBSCRIBE",
    docId: SYNCED_RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });

  // Initial subscribe delivers SUBSCRIBED, VIEW_SNAPSHOT, and both CONTROL snapshots
  const initial = dana.take();
  expect(initial.map((m: Message) => m.type)).toEqual([
    "SUBSCRIBED",
    "VIEW_SNAPSHOT",
    "CONTROL",
    "CONTROL",
  ]);
  const opSnap = initial[2]!;
  expect(opSnap.type === "CONTROL" && opSnap.kind).toBe(
    "prompter_operator_changed",
  );
  if (opSnap.type === "CONTROL") {
    expect(parsePrompterOperatorChanged(opSnap.data)?.operator?.userId).toBe(
      "sam",
    );
  }
  const scrollSnap = initial[3]!;
  expect(scrollSnap.type === "CONTROL" && scrollSnap.kind).toBe(
    "prompter_scroll",
  );
  if (scrollSnap.type === "CONTROL") {
    expect(parsePrompterScrollControl(scrollSnap.data)?.scroll.seq).toBe(1);
  }

  // Subsequent upstream scroll update forwards live CONTROL frame
  fc.advance(250);
  scroll.set({
    state: {
      seq: 2,
      playing: false,
      linesPerSecond: 6,
      rowId: "row-2",
      lineOffset: 3,
      updatedAt: 50_250,
      operatorUserId: "sam",
      operatorDeviceId: "dev-1",
    },
    clockOffsetMs: 0,
  });
  const live = dana.take();
  expect(live).toHaveLength(1);
  const frame = live[0]!;
  expect(frame.type === "CONTROL" && frame.kind).toBe("prompter_scroll");
  if (frame.type === "CONTROL") {
    const parsed = parsePrompterScrollControl(frame.data);
    expect(parsed?.scroll.seq).toBe(2);
    expect(parsed?.scroll.playing).toBe(false);
    expect(parsed?.scroll.linesPerSecond).toBe(6);
  }

  // Subsequent upstream operator release forwards null operator
  operator.set(null);
  const released = dana.take();
  expect(released).toHaveLength(1);
  const relFrame = released[0]!;
  expect(relFrame.type === "CONTROL" && relFrame.kind).toBe(
    "prompter_operator_changed",
  );
  if (relFrame.type === "CONTROL") {
    expect(parsePrompterOperatorChanged(relFrame.data)?.operator).toBeNull();
  }

  relay.stop();
});

test("createPrompterControlHttpProxy proxies synced rundowns (static + parameterized) to cloud and serves local rundowns locally", async () => {
  const fc = fakeClock(100_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const records = createMemoryRecords();
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: fc.clock.now,
  });
  records.savePerson({
    userId: "sam",
    name: "Sam",
    wantsCloud: true,
    cloudToken: "cloud-tok-sam",
    chosenAt: 1,
  });
  records.savePerson({
    userId: "offline-user",
    name: "Offline",
    wantsCloud: false,
    cloudToken: null,
    chosenAt: 2,
  });
  records.setDocState(SYNCED_RUNDOWN, "sam", "synced", 1);

  let idSeq = 0;
  let sync!: ReturnType<typeof createSyncService>;
  const history = createHistoryService({
    storage,
    sync: () => sync,
    clock: fc.clock,
    ids: () => `h-${++idSeq}`,
  });
  const prompter = createPrompterService({
    storage,
    sync: () => sync,
    history,
    clock: fc.clock,
    ids: () => `p-${++idSeq}`,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids: () => `s-${++idSeq}`,
    versions: { current: V1, min: V1 },
    prompterSubscribe: prompter.subscribePrompter,
  });
  sync.access.create("sam", {
    docId: LOCAL_RUNDOWN,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(LOCAL_RUNDOWN, "sam", "owner", [
    "edit_rundowns",
    "send_to_prompter",
  ]);

  const forwarded: { token: string; method: string; path: string }[] = [];
  let failCloud = false;
  const cloud = {
    async forward(token: string, request: Request) {
      if (failCloud) throw new ConnectError("unreachable");
      const url = new URL(request.url);
      forwarded.push({
        token,
        method: request.method,
        path: `${url.pathname}${url.search}`,
      });
      return Response.json({ proxied: true, path: url.pathname });
    },
  } as unknown as NodeCoreOptions["cloud"];

  const proxy = createPrompterControlHttpProxy({
    records,
    sessions,
    cloud,
    localPrompter: prompter,
  });

  const samToken = sessions.issue("sam");
  const offlineToken = sessions.issue("offline-user");
  const authSam = { Authorization: `Bearer ${samToken}` };

  // Unrelated path returns null
  expect(await proxy(new Request("http://127.0.0.1/api/docs/list"))).toBeNull();

  // Synced rundown: static & parameterized GET + POST paths proxy to cloud
  const r1 = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/control?docId=${SYNCED_RUNDOWN}`,
      { headers: authSam },
    ),
  );
  expect(r1?.status).toBe(200);
  const r2 = await proxy(
    new Request("http://127.0.0.1/api/prompter/operator/take", {
      method: "POST",
      headers: { ...authSam, "Content-Type": "application/json" },
      body: JSON.stringify({
        docId: SYNCED_RUNDOWN,
        deviceId: "dev-1",
        expectedUserId: null,
      }),
    }),
  );
  expect(r2?.status).toBe(200);
  const r3 = await proxy(
    new Request(`http://127.0.0.1/api/prompter/${SYNCED_RUNDOWN}/control`, {
      method: "POST",
      headers: { ...authSam, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "play", deviceId: "dev-1" }),
    }),
  );
  expect(r3?.status).toBe(200);
  const r4 = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/${SYNCED_RUNDOWN}/operator/release`,
      {
        method: "POST",
        headers: { ...authSam, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "dev-1" }),
      },
    ),
  );
  expect(r4?.status).toBe(200);
  expect(forwarded).toEqual([
    {
      token: "cloud-tok-sam",
      method: "GET",
      path: `/api/prompter/control?docId=${SYNCED_RUNDOWN}`,
    },
    {
      token: "cloud-tok-sam",
      method: "POST",
      path: "/api/prompter/operator/take",
    },
    {
      token: "cloud-tok-sam",
      method: "POST",
      path: `/api/prompter/${SYNCED_RUNDOWN}/control`,
    },
    {
      token: "cloud-tok-sam",
      method: "POST",
      path: `/api/prompter/${SYNCED_RUNDOWN}/operator/release`,
    },
  ]);

  // Synced rundown: unauthenticated -> 401; no cloudToken -> 503; ConnectError -> 503
  const rUnauth = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/control?docId=${SYNCED_RUNDOWN}`,
    ),
  );
  expect(rUnauth?.status).toBe(401);
  const rNoToken = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/control?docId=${SYNCED_RUNDOWN}`,
      { headers: { Authorization: `Bearer ${offlineToken}` } },
    ),
  );
  expect(rNoToken?.status).toBe(503);
  failCloud = true;
  const rDown = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/control?docId=${SYNCED_RUNDOWN}`,
      { headers: authSam },
    ),
  );
  expect(rDown?.status).toBe(503);

  // Local rundown: served directly by local PrompterService.control (take -> play -> status -> release)
  const localTake = await proxy(
    new Request("http://127.0.0.1/api/prompter/operator/take", {
      method: "POST",
      headers: { ...authSam, "Content-Type": "application/json" },
      body: JSON.stringify({
        docId: LOCAL_RUNDOWN,
        deviceId: "desk-1",
        expectedUserId: null,
      }),
    }),
  );
  expect(localTake?.status).toBe(200);
  const takenBody = (await localTake!.json()) as {
    operator: PrompterOperator | null;
  };
  expect(takenBody.operator?.userId).toBe("sam");
  expect(takenBody.operator?.deviceId).toBe("desk-1");

  const localPlay = await proxy(
    new Request("http://127.0.0.1/api/prompter/control", {
      method: "POST",
      headers: { ...authSam, "Content-Type": "application/json" },
      body: JSON.stringify({
        docId: LOCAL_RUNDOWN,
        action: "play",
        deviceId: "desk-1",
        linesPerSecond: 5,
      }),
    }),
  );
  expect(localPlay?.status).toBe(200);
  const playBody = (await localPlay!.json()) as {
    scroll: { playing: boolean; linesPerSecond: number };
  };
  expect(playBody.scroll.playing).toBe(true);
  expect(playBody.scroll.linesPerSecond).toBe(5);

  const localRelease = await proxy(
    new Request(
      `http://127.0.0.1/api/prompter/${LOCAL_RUNDOWN}/operator/release`,
      {
        method: "POST",
        headers: { ...authSam, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "desk-1" }),
      },
    ),
  );
  expect(localRelease?.status).toBe(200);
  const relBody = (await localRelease!.json()) as {
    operator: PrompterOperator | null;
  };
  expect(relBody.operator).toBeNull();

  prompter.stop();
});
