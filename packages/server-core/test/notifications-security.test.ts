import { expect, test } from "bun:test";
import {
  createDoc,
  jsonMap,
  observeScript,
  replyToThread,
  startThread,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  PROTOCOL_VERSION,
  commentsDocId,
  indexDocId,
  seedDocId,
} from "@manent/sync-protocol";
import type { Identity } from "@manent/sync-protocol";
import {
  DELIVER_INTERVAL_MS,
  OWNER_CAPABILITIES,
  RETRY_DELAYS_MS,
  createNotificationsService,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "../src/index.ts";
import type {
  Clock,
  Committed,
  Directory,
  NotificationsService,
  Peer,
  Room,
  ServerConfig,
} from "../src/index.ts";

const PEOPLE: readonly Identity[] = [
  { userId: "dana", name: "Dana Reyes" },
  { userId: "leo", name: "Leo Marsh" },
  { userId: "sam", name: "Sam Okafor" },
  { userId: "priya", name: "Priya Nair" },
  { userId: "ana", name: "Ana Costa" },
  { userId: "outsider", name: "Alex Mercer" },
];

interface RecordedFetch {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

interface FakeTimer {
  id: number;
  at: number;
  fn: () => void;
  cancelled: boolean;
}

function createFakeClock(start = 1_700_000_000_000) {
  let now = start;
  let nextId = 1;
  const timers: FakeTimer[] = [];
  const clock: Clock = {
    now: () => now,
    schedule(fn, delayMs) {
      const timer: FakeTimer = {
        id: nextId++,
        at: now + delayMs,
        fn,
        cancelled: false,
      };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    while (true) {
      const due = timers
        .filter((t) => !t.cancelled && t.at <= now)
        .toSorted((a, b) => a.at - b.at || a.id - b.id);
      const next = due[0];
      if (next === undefined) break;
      next.cancelled = true;
      next.fn();
    }
  };
  const activeCount = (): number => timers.filter((t) => !t.cancelled).length;
  return { clock, advance, activeCount };
}

function fakePeer(userId: string): Peer {
  return {
    userId,
    name: PEOPLE.find((p) => p.userId === userId)?.name ?? userId,
    deviceId: "dev-1",
    versions: { protocol: PROTOCOL_VERSION, schema: 2, engine: 2, table: 1 },
    address: "127.0.0.1",
    send() {},
    close() {},
  };
}

function seedCommittedDoc(
  storage: ReturnType<typeof createMemoryStorage>,
  home: { kind: "project" | "user"; id: string },
  docId: string,
  kind: "index" | "private",
  userId: string,
  populate: (doc: CrdtDoc) => void,
): void {
  storage.directory.place(docId, home, kind, userId);
  const file = storage.open(home);
  file.log.create({
    id: docId,
    kind,
    ownerUserId: kind === "private" ? userId : null,
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

function setupFixture(options?: {
  resendApiKey?: string | null;
  resendFrom?: string | null;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const { clock, advance, activeCount } = createFakeClock();
  const storage = createMemoryStorage({ now: clock.now });
  const wsId = "writers-room";
  const wsName = "Writers' room";
  const attackerWsId = "attacker-ws";
  const wsIndexId = indexDocId("workspace", wsId);
  const attackerWsIndexId = indexDocId("workspace", attackerWsId);
  const projectId = seedDocId("nt-proj-1");
  const scriptDocId = seedDocId("nt-script-1");
  const privateDocId = seedDocId("nt-private-1");
  const userHomeDocId = seedDocId("nt-user-home-1");

  const directory: Directory = {
    user: (id) => PEOPLE.find((p) => p.userId === id) ?? null,
    workspacesOf: (userId) => {
      const list: { id: string; name: string; seeding: null }[] = [];
      if (["dana", "leo", "sam", "priya", "ana"].includes(userId)) {
        list.push({ id: wsId, name: wsName, seeding: null });
      }
      if (["outsider", "dana"].includes(userId)) {
        list.push({ id: attackerWsId, name: "Attacker Room", seeding: null });
      }
      return list;
    },
  };

  // Seed legitimate workspace index with project + script
  seedCommittedDoc(
    storage,
    { kind: "project", id: wsIndexId },
    wsIndexId,
    "index",
    "dana",
    (doc) => {
      jsonMap(doc, "projects").set(projectId, { title: "Season 1" });
      jsonMap(doc, "documents").set(scriptDocId, {
        title: "The Long Night",
        projectId,
      });
    },
  );
  storage.directory.setRole(wsIndexId, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(wsIndexId, "leo", "edit", []);
  storage.directory.setRole(wsIndexId, "sam", "edit", []);
  storage.directory.setRole(wsIndexId, "priya", "comment", []);
  storage.directory.setRole(wsIndexId, "ana", "view", []);

  // Seed Dana's private index listing privateDocId in private_folder
  const danaPrivateIndexId = indexDocId("user", "dana");
  seedCommittedDoc(
    storage,
    { kind: "user", id: "dana" },
    danaPrivateIndexId,
    "private",
    "dana",
    (doc) => {
      jsonMap(doc, "private_folder").set(privateDocId, {
        title: "Secret Draft",
      });
    },
  );

  // Seed attacker workspace index baiting BOTH scriptDocId and privateDocId
  seedCommittedDoc(
    storage,
    { kind: "project", id: attackerWsIndexId },
    attackerWsIndexId,
    "index",
    "outsider",
    (doc) => {
      jsonMap(doc, "projects").set(projectId, { title: "Bait Project" });
      jsonMap(doc, "documents").set(scriptDocId, {
        title: "Hijacked Title",
        projectId,
      });
      jsonMap(doc, "documents").set(privateDocId, {
        title: "Hijacked Private",
        projectId,
      });
    },
  );
  storage.directory.setRole(
    attackerWsIndexId,
    "outsider",
    "owner",
    OWNER_CAPABILITIES,
  );
  storage.directory.setRole(attackerWsIndexId, "dana", "view", []);

  // Place scriptDocId in projectId with workspace grants
  const projHome = { kind: "project" as const, id: projectId };
  storage.directory.place(scriptDocId, projHome, "script", "dana");
  storage.directory.setRole(scriptDocId, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(scriptDocId, "leo", "edit", []);
  storage.directory.setRole(scriptDocId, "sam", "edit", []);
  storage.shareLinks.grant(scriptDocId, "leo", "edit", "workspace");
  storage.shareLinks.grant(scriptDocId, "sam", "edit", "workspace");

  // Place privateDocId in projectId (not in writers-room index, and in Dana's private_folder)
  storage.directory.place(privateDocId, projHome, "script", "dana");
  storage.directory.setRole(privateDocId, "dana", "owner", OWNER_CAPABILITIES);

  // Place userHomeDocId in user:dana home
  const userHome = { kind: "user" as const, id: "dana" };
  storage.directory.place(userHomeDocId, userHome, "script", "dana");
  storage.directory.setRole(userHomeDocId, "dana", "owner", OWNER_CAPABILITIES);

  const calls: RecordedFetch[] = [];
  const defaultFetch: typeof globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers: Record<string, string> = {};
      if (init?.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (init?.headers !== undefined && !Array.isArray(init.headers)) {
        Object.assign(headers, init.headers);
      }
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response("ok", { status: 200 });
    },
    { preconnect: () => {} },
  );

  const notify: NotificationsService = createNotificationsService({
    storage,
    users: directory,
    clock,
    openUrl: "https://manent.example/",
    resendApiKey:
      options?.resendApiKey === undefined
        ? "re_test_secret_key_12345"
        : options.resendApiKey,
    resendFrom:
      options?.resendFrom === undefined
        ? "Manent <notes@manent.example>"
        : options.resendFrom,
    fetch: options?.fetchImpl ?? defaultFetch,
  });

  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(9),
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
      openUrl: "https://manent.example",
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
    notify,
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

  /** Applies a comment mutation to `commentsDoc` and delivers the resulting Committed event to `notify.committed`. */
  function commitComment(
    commentsDoc: CrdtDoc,
    targetScriptId: string,
    home: { kind: "project" | "user"; id: string },
    mutate: (doc: CrdtDoc) => void,
    commitOptions?: {
      senderUserId?: string | null;
      echo?: boolean;
      dropReport?: boolean;
    },
  ): void {
    const reports: TransactionReport[] = [];
    const unsub = observeScript(commentsDoc, (r) => reports.push(r));
    try {
      mutate(commentsDoc);
    } finally {
      unsub();
    }
    const report = commitOptions?.dropReport ? null : (reports.at(-1) ?? null);
    const room = {
      docId: commentsDocId(targetScriptId),
      home,
      kind: "comments",
      doc: commentsDoc,
    } as unknown as Room;
    const sender =
      commitOptions?.senderUserId === null
        ? null
        : fakePeer(commitOptions?.senderUserId ?? "leo");
    const committed: Committed = {
      room,
      sender,
      seq: 1,
      update: report?.update ?? new Uint8Array(),
      report,
      echo: commitOptions?.echo ?? false,
    };
    notify.committed?.(committed);
  }

  return {
    storage,
    notify,
    clock,
    advance,
    activeCount,
    calls,
    fetchAs,
    commitComment,
    wsId,
    attackerWsId,
    projectId,
    scriptDocId,
    privateDocId,
    userHomeDocId,
  };
}

test("authZ, URL masking (S4-16 A), invalid address rejection, and Resend key secrecy", async () => {
  const fx = setupFixture();
  try {
    // Unauthenticated -> 401; non-member -> 403 on GET & POST; non-owner -> 403 on POST
    for (const [path, body] of [
      [`/api/workspace/notifications?workspaceId=${fx.wsId}`, undefined],
      [
        "/api/workspace/notifications/set",
        {
          workspaceId: fx.wsId,
          adapter: "webhook",
          address: "http://127.0.0.1:9999/hook",
        },
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

    const memberSet = await fx.fetchAs(
      "leo",
      "/api/workspace/notifications/set",
      {
        workspaceId: fx.wsId,
        adapter: "webhook",
        address: "http://127.0.0.1:9999/hook",
      },
    );
    expect([memberSet.status, await memberSet.json()]).toEqual([
      403,
      { error: "forbidden" },
    ]);

    // Invalid addresses refused with 400 bad_request
    for (const [adapter, address] of [
      ["webhook", "javascript:alert(1)"],
      ["webhook", "file:///etc/passwd"],
      ["webhook", "http://127.0.0.1/hook\r\nX-Inject: 1"],
      ["slack", "https://evil.example/services/T1/B1/xxxx"],
      ["slack", "https://hooks.slack.com@evil.com/secret"],
      ["slack", "https://user:pass@hooks.slack.com/services/T1/B1/secret"],
      ["slack", "https://hooks.slack.com:8443/services/T1/B1/secret"],
      ["slack", "https://hooks.slack.com/"],
      ["slack", "http://hooks.slack.com/services/T1/B1/xxxx"],
      ["email", "a@b.com\r\nBcc:evil@x.com"],
      ["email", "not-an-email"],
    ] as const) {
      const bad = await fx.fetchAs("dana", "/api/workspace/notifications/set", {
        workspaceId: fx.wsId,
        adapter,
        address,
      });
      expect([bad.status, await bad.json()]).toEqual([
        400,
        { error: "bad_request" },
      ]);
    }

    // Owner saves all three valid addresses
    const saveWebhook = await fx.fetchAs(
      "dana",
      "/api/workspace/notifications/set",
      {
        workspaceId: fx.wsId,
        adapter: "webhook",
        address: "http://127.0.0.1:8123/hooks/secretHook9z8y",
      },
    );
    expect(saveWebhook.status).toBe(200);

    const saveSlack = await fx.fetchAs(
      "dana",
      "/api/workspace/notifications/set",
      {
        workspaceId: fx.wsId,
        adapter: "slack",
        address: "https://hooks.slack.com/services/T0001/B0002/secretTokena1b2",
      },
    );
    expect(saveSlack.status).toBe(200);

    const saveEmail = await fx.fetchAs(
      "dana",
      "/api/workspace/notifications/set",
      {
        workspaceId: fx.wsId,
        adapter: "email",
        address: "room@studio.example",
      },
    );
    expect(saveEmail.status).toBe(200);

    // Owner GET returns masked hints only, never raw URL or Resend key
    const ownerGet = await fx.fetchAs(
      "dana",
      `/api/workspace/notifications?workspaceId=${fx.wsId}`,
    );
    const ownerBody = await ownerGet.json();
    expect([ownerGet.status, ownerBody]).toEqual([
      200,
      {
        adapters: [
          {
            adapter: "webhook",
            on: true,
            available: true,
            hint: "127.0.0.1:8123/…9z8y",
            state: "delivering",
            nextTryAt: null,
          },
          {
            adapter: "slack",
            on: true,
            available: true,
            hint: "hooks.slack.com/…a1b2",
            state: "delivering",
            nextTryAt: null,
          },
          {
            adapter: "email",
            on: true,
            available: true,
            hint: "…@studio.example",
            state: "delivering",
            nextTryAt: null,
          },
        ],
      },
    ]);
    const serialized = JSON.stringify(ownerBody);
    expect(serialized.includes("secretHook")).toBe(false);
    expect(serialized.includes("secretToken")).toBe(false);
    expect(serialized.includes("re_test_secret_key")).toBe(false);
    expect(serialized.includes("room@studio.example")).toBe(false);

    // Non-owner member GET sees on/available only; hint/state/nextTryAt are ALL null
    const memberGet = await fx.fetchAs(
      "leo",
      `/api/workspace/notifications?workspaceId=${fx.wsId}`,
    );
    expect([memberGet.status, await memberGet.json()]).toEqual([
      200,
      {
        adapters: [
          {
            adapter: "webhook",
            on: true,
            available: true,
            hint: null,
            state: null,
            nextTryAt: null,
          },
          {
            adapter: "slack",
            on: true,
            available: true,
            hint: null,
            state: null,
            nextTryAt: null,
          },
          {
            adapter: "email",
            on: true,
            available: true,
            hint: null,
            state: null,
            nextTryAt: null,
          },
        ],
      },
    ]);
  } finally {
    fx.notify.stop();
  }
});

test("Private-folder docs, user: home docs, cross-workspace bait, replays, and authority writes NEVER enqueue notifications", async () => {
  const fx = setupFixture();
  try {
    // Configure webhook on BOTH writers-room and attacker-ws
    await fx.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: fx.wsId,
      adapter: "webhook",
      address: "http://127.0.0.1:8123/writers-hook",
    });
    await fx.fetchAs("outsider", "/api/workspace/notifications/set", {
      workspaceId: fx.attackerWsId,
      adapter: "webhook",
      address: "http://127.0.0.1:8123/attacker-hook",
    });

    // 1. Comment on user: home doc -> NEVER enqueues
    const userComments = createDoc();
    fx.commitComment(
      userComments,
      fx.userHomeDocId,
      { kind: "user", id: "dana" },
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t-user",
            itemId: "i-user",
            anchor: null,
            roundId: null,
            authorUserId: "dana",
            body: "Private thought",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "dana" },
    );
    userComments.destroy();

    // 2. Comment on Private-folder doc (even though baited into attacker-ws!) -> NEVER enqueues
    const privateComments = createDoc();
    fx.commitComment(
      privateComments,
      fx.privateDocId,
      { kind: "project", id: fx.projectId },
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t-priv",
            itemId: "i-priv",
            anchor: null,
            roundId: null,
            authorUserId: "dana",
            body: "Secret draft note",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "dana" },
    );
    privateComments.destroy();

    // 3. Replay (sender === null, echo: true) and authority write (sender === null, report === null) -> NEVER enqueue
    const wsComments = createDoc();
    fx.commitComment(
      wsComments,
      fx.scriptDocId,
      { kind: "project", id: fx.projectId },
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t-replay",
            itemId: "i-replay",
            anchor: null,
            roundId: null,
            authorUserId: "leo",
            body: "Replayed comment",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: null, echo: true },
    );
    fx.commitComment(
      wsComments,
      fx.scriptDocId,
      { kind: "project", id: fx.projectId },
      (doc) =>
        replyToThread(
          doc,
          {
            threadId: "t-replay",
            itemId: "i-auth",
            authorUserId: "leo",
            body: "Authority write",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: null, dropReport: true },
    );
    expect(fx.storage.outbox.pending(fx.wsId)).toEqual([]);
    expect(fx.storage.outbox.pending(fx.attackerWsId)).toEqual([]);

    // 4. Legitimate comment on scriptDocId goes ONLY to writers-room, NEVER to attacker-ws despite CRDT bait!
    fx.commitComment(
      wsComments,
      fx.scriptDocId,
      { kind: "project", id: fx.projectId },
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t-legit",
            itemId: "i-legit",
            anchor: null,
            roundId: null,
            authorUserId: "leo",
            body: "Real note",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "leo" },
    );
    wsComments.destroy();

    expect(fx.storage.outbox.pending(fx.wsId).length).toBe(1);
    expect(fx.storage.outbox.pending(fx.attackerWsId)).toEqual([]);
  } finally {
    fx.notify.stop();
  }
});

test("verbatim Slack (S4-NT-20..22), Webhook, and Resend Email (S4-NT-23..24) payloads, and email availability gate (S4-19 A)", async () => {
  // Missing RESEND_FROM -> email unavailable & off even if address saved
  const noFrom = setupFixture({ resendApiKey: "re_key", resendFrom: null });
  try {
    await noFrom.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: noFrom.wsId,
      adapter: "email",
      address: "room@studio.example",
    });
    const res = await noFrom.fetchAs(
      "dana",
      `/api/workspace/notifications?workspaceId=${noFrom.wsId}`,
    );
    const body = (await res.json()) as {
      adapters: {
        adapter: string;
        on: boolean;
        available: boolean;
        state: string | null;
      }[];
    };
    const email = body.adapters.find((a) => a.adapter === "email")!;
    expect(email.available).toBe(false);
    expect(email.on).toBe(false);
    expect(email.state).toBeNull();
  } finally {
    noFrom.notify.stop();
  }

  const fx = setupFixture();
  try {
    await fx.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: fx.wsId,
      adapter: "webhook",
      address: "http://127.0.0.1:8123/hook",
    });
    await fx.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: fx.wsId,
      adapter: "slack",
      address: "https://hooks.slack.com/services/T1/B2/token1234",
    });
    await fx.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: fx.wsId,
      adapter: "email",
      address: "room@studio.example",
    });

    const commentsDoc = createDoc();
    const projHome = { kind: "project" as const, id: fx.projectId };
    const expectedUrl = `https://manent.example/s/${fx.scriptDocId}`;

    // 1. New thread (S4-NT-20, S4-NT-23, S4-NT-24)
    fx.commitComment(
      commentsDoc,
      fx.scriptDocId,
      projHome,
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t1",
            itemId: "i1",
            anchor: null,
            roundId: null,
            authorUserId: "leo",
            body: "Why doesn't Jane just wait for the fire brigade?",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "leo" },
    );

    // Outbox payload must NEVER contain resendApiKey
    const dueRows = fx.storage.outbox.due(10);
    expect(dueRows.length).toBe(3);
    for (const row of dueRows) {
      expect(row.payload.includes("re_test_secret_key")).toBe(false);
    }

    await fx.notify.deliverNow();
    expect(fx.calls.length).toBe(3);

    const webhookCall = fx.calls.find(
      (c) => c.url === "http://127.0.0.1:8123/hook",
    )!;
    expect(JSON.parse(webhookCall.body)).toEqual({
      type: "thread_opened",
      workspaceId: fx.wsId,
      docId: fx.scriptDocId,
      title: "The Long Night",
      threadId: "t1",
      itemId: "i1",
      authorUserId: "leo",
      authorName: "Leo Marsh",
      mentionedUserIds: [],
      text: "Why doesn't Jane just wait for the fire brigade?",
      url: expectedUrl,
      at: fx.clock.now(),
    });

    const slackCall = fx.calls.find((c) =>
      c.url.startsWith("https://hooks.slack.com/"),
    )!;
    expect(JSON.parse(slackCall.body)).toEqual({
      text: `Leo Marsh commented on 'The Long Night':\n"Why doesn't Jane just wait for the fire brigade?"\n${expectedUrl}`,
    });

    const emailCall = fx.calls.find(
      (c) => c.url === "https://api.resend.com/emails",
    )!;
    expect(emailCall.headers.Authorization).toBe(
      "Bearer re_test_secret_key_12345",
    );
    expect(JSON.parse(emailCall.body)).toEqual({
      from: "Manent <notes@manent.example>",
      to: "room@studio.example",
      subject: "Leo Marsh commented on 'The Long Night'",
      text: [
        "Leo Marsh commented on 'The Long Night' in Writers' room:",
        '"Why doesn\'t Jane just wait for the fire brigade?"',
        `Open it in Manent: ${expectedUrl}`,
        "You get this because an owner of Writers' room chose this address for its comments in Workspace settings → Notifications.",
      ].join("\n\n"),
    });

    // 2. Reply (S4-NT-21) and 3-person mention winning over reply (S4-NT-22, no Oxford comma)
    fx.calls.length = 0;
    fx.commitComment(
      commentsDoc,
      fx.scriptDocId,
      projHome,
      (doc) =>
        replyToThread(
          doc,
          {
            threadId: "t1",
            itemId: "i2",
            authorUserId: "sam",
            body: "She loses her nerve.",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "sam" },
    );
    fx.commitComment(
      commentsDoc,
      fx.scriptDocId,
      projHome,
      (doc) =>
        replyToThread(
          doc,
          {
            threadId: "t1",
            itemId: "i3",
            authorUserId: "dana",
            body: "Check scene 4.",
            mentionedUserIds: ["priya", "sam", "ana"],
          },
          fx.clock.now,
        ),
      { senderUserId: "dana" },
    );
    commentsDoc.destroy();

    await fx.notify.deliverNow();
    const slackTexts = fx.calls
      .filter((c) => c.url.startsWith("https://hooks.slack.com/"))
      .map((c) => (JSON.parse(c.body) as { text: string }).text);
    expect(slackTexts).toEqual([
      `Sam Okafor replied on 'The Long Night':\n"She loses her nerve."\n${expectedUrl}`,
      `Dana Reyes mentioned Priya Nair, Sam Okafor and Ana Costa on 'The Long Night':\n"Check scene 4."\n${expectedUrl}`,
    ]);
  } finally {
    fx.notify.stop();
  }
});

test("retry schedule [1, 5, 30, 120, 720] min, stop after 6th attempt, 10 s timeout, and stop() cancels timer", async () => {
  let attemptCount = 0;
  let hangNext = false;
  const failingFetch: typeof globalThis.fetch = Object.assign(
    (_input: string | URL | Request, init?: RequestInit) => {
      attemptCount++;
      if (hangNext) {
        hangNext = false;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        });
      }
      return Promise.resolve(new Response("down", { status: 503 }));
    },
    { preconnect: () => {} },
  );

  const fx = setupFixture({ fetchImpl: failingFetch });
  try {
    await fx.fetchAs("dana", "/api/workspace/notifications/set", {
      workspaceId: fx.wsId,
      adapter: "webhook",
      address: "http://127.0.0.1:8123/down",
    });

    const commentsDoc = createDoc();
    fx.commitComment(
      commentsDoc,
      fx.scriptDocId,
      { kind: "project", id: fx.projectId },
      (doc) =>
        startThread(
          doc,
          {
            threadId: "t-retry",
            itemId: "i-retry",
            anchor: null,
            roundId: null,
            authorUserId: "leo",
            body: "Will retry",
            mentionedUserIds: [],
          },
          fx.clock.now,
        ),
      { senderUserId: "leo" },
    );
    commentsDoc.destroy();

    // Attempt 1 hangs and times out at 10,000 ms via injected clock -> retry scheduled at +60_000 ms
    hangNext = true;
    const firstDelivery = fx.notify.deliverNow();
    fx.advance(10_000);
    await firstDelivery;
    expect(attemptCount).toBe(1);

    let pending = fx.storage.outbox.pending(fx.wsId);
    expect(pending.length).toBe(1);
    expect(pending[0]!.attempts).toBe(1);
    expect(pending[0]!.nextTryAt).toBe(fx.clock.now() + RETRY_DELAYS_MS[0]!);

    // Owner GET reports state: "retrying" with exact nextTryAt
    const retryingRes = await fx.fetchAs(
      "dana",
      `/api/workspace/notifications?workspaceId=${fx.wsId}`,
    );
    const retryingBody = (await retryingRes.json()) as {
      adapters: {
        adapter: string;
        state: string | null;
        nextTryAt: number | null;
      }[];
    };
    const webhookStatus = retryingBody.adapters.find(
      (a) => a.adapter === "webhook",
    )!;
    expect(webhookStatus.state).toBe("retrying");
    expect(webhookStatus.nextTryAt).toBe(pending[0]!.nextTryAt);

    // Attempts 2..5 follow exact backoff delays [5, 30, 120, 720] minutes
    for (let i = 1; i < RETRY_DELAYS_MS.length; i++) {
      const dueAt = pending[0]!.nextTryAt;
      // Advance directly to dueAt without firing overlapping background loop ticks
      fx.notify.stop();
      fx.advance(dueAt - fx.clock.now());
      await fx.notify.deliverNow();
      pending = fx.storage.outbox.pending(fx.wsId);
      expect(pending[0]!.attempts).toBe(i + 1);
      expect(pending[0]!.nextTryAt).toBe(fx.clock.now() + RETRY_DELAYS_MS[i]!);
    }

    // Attempt 6 fails -> marked stopped, no longer returned by due(), owner GET shows state: "stopped"
    fx.advance(pending[0]!.nextTryAt - fx.clock.now());
    await fx.notify.deliverNow();
    expect(attemptCount).toBe(6);
    expect(fx.storage.outbox.due(10)).toEqual([]);

    const stoppedRes = await fx.fetchAs(
      "dana",
      `/api/workspace/notifications?workspaceId=${fx.wsId}`,
    );
    const stoppedBody = (await stoppedRes.json()) as {
      adapters: {
        adapter: string;
        state: string | null;
        nextTryAt: number | null;
      }[];
    };
    const stoppedWebhook = stoppedBody.adapters.find(
      (a) => a.adapter === "webhook",
    )!;
    expect(stoppedWebhook.state).toBe("stopped");
    expect(stoppedWebhook.nextTryAt).toBeNull();

    // Background timer is cancelled cleanly by stop() and does not fire after DELIVER_INTERVAL_MS
    expect(fx.activeCount()).toBe(0);
    fx.advance(DELIVER_INTERVAL_MS * 2);
    expect(attemptCount).toBe(6);
  } finally {
    fx.notify.stop();
  }
});
