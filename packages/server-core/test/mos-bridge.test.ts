import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  initRundown,
  insertRows,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import { indexDocId } from "@manent/sync-protocol";
import type { Identity } from "@manent/sync-protocol";
import { createMockMosPrompter } from "@manent/testkit";
import {
  answerMosRequest,
  createAirWindows,
  createHistoryService,
  createMosBridgeService,
  createMosTcpClient,
  createMosTcpServer,
  createPrompterService,
  createSyncService,
  isIpAllowed,
  resolvePinnedTarget,
} from "../src/index.ts";
import type {
  MosBridgeService,
  PrompterService,
  SyncService,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const WORKSPACE = "studio-one";
const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN_LIVE = "22222222-2222-7222-8222-222222222222";
const RUNDOWN_PRIVATE = "22222222-2222-7222-8222-222222222299";
const STORY_1 = "33333333-3333-7333-8333-333333333333";
const ROW_1 = "row-1-0000000001";
const BLK_CHAR = "blk-char-0000001";
const BLK_DIAL = "blk-dial-0000001";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

const ANA: Identity = { userId: "ana", name: "Ana" };
const LEO: Identity = { userId: "leo", name: "Leo" };

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

async function flushAll(fc: FakeClock): Promise<void> {
  for (let i = 0; i < 8; i++) {
    fc.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

interface MosWorld {
  readonly storage: ReturnType<typeof createMemoryStorage>;
  readonly sync: SyncService;
  readonly prompter: PrompterService;
  readonly mos: MosBridgeService;
}

function createMosWorld(fc: FakeClock): MosWorld {
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  let seq = 0;
  const ids = (): string => `ver-${++seq}`;
  let sync!: SyncService;
  const airWindows = createAirWindows({ clock: fc.clock, storage });
  const history = createHistoryService({
    sync: () => sync,
    storage,
    clock: fc.clock,
    ids,
  });
  const prompter = createPrompterService({
    storage,
    sync: () => sync,
    history,
    clock: fc.clock,
    ids,
    airWindows,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [history, airWindows.hooks, prompter.hooks],
    airWindow: airWindows.isInside,
    airWindowOf: airWindows.windowOf,
    prompterSubscribe: prompter.subscribePrompter,
  });
  const mos = createMosBridgeService({
    storage,
    sync: () => sync,
    feed: prompter.feed,
    clock: fc.clock,
  });
  return { storage, sync, prompter, mos };
}

async function seedWorld(
  world: MosWorld,
  fc: FakeClock,
  options: { insideAirWindow: boolean },
): Promise<void> {
  const { sync, storage } = world;
  const wsIndex = indexDocId("workspace", WORKSPACE);
  storage.directory.setRole(wsIndex, ANA.userId, "owner", []);
  storage.directory.setRole(wsIndex, LEO.userId, "edit", []);

  sync.access.create(ANA.userId, {
    docId: RUNDOWN_LIVE,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  sync.access.create(ANA.userId, {
    docId: RUNDOWN_PRIVATE,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  sync.access.create(ANA.userId, {
    docId: STORY_1,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  // Leo has edit_rundowns but NOT send_to_prompter
  storage.directory.setRole(RUNDOWN_LIVE, LEO.userId, "edit", [
    "edit_rundowns",
  ]);

  const peer = fakePeer({ userId: ANA.userId, name: ANA.name });
  sync.attach(peer);

  const storyDoc = createDoc({ clientId: 101 });
  scriptBody(storyDoc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: "blk-act-00000001", type: "action" },
        content: [{ type: "text", text: "Camera zooms in (never spoken)." }],
      },
      {
        type: "block",
        attrs: { id: BLK_CHAR, type: "character" },
        content: [{ type: "text", text: "ana" }],
      },
      {
        type: "block",
        attrs: { id: BLK_DIAL, type: "dialogue" },
        content: [{ type: "text", text: "Initial spoken copy." }],
      },
    ]),
  );
  sync.receive(peer, {
    type: "SUBSCRIBE",
    docId: STORY_1,
    generation: 0,
    mode: "edit",
    clientIds: [101],
    lastServerSeq: 0,
  });
  sync.receive(peer, {
    type: "PUSH",
    docId: STORY_1,
    generation: 1,
    clientSeq: 1,
    update: storyDoc.encodeState(),
    heal: false,
  });

  const airAt = options.insideAirWindow
    ? fc.clock.now() + 30_000
    : fc.clock.now() + 600_000;
  const rdDoc = createDoc({ clientId: 102 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-25",
      airAt,
      windowLeadMs: 60_000,
      targetMs: 60_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rdDoc,
    [{ id: ROW_1, kind: "script", docId: STORY_1, blockId: null }],
    null,
  );
  sync.receive(peer, {
    type: "SUBSCRIBE",
    docId: RUNDOWN_LIVE,
    generation: 0,
    mode: "edit",
    clientIds: [102],
    lastServerSeq: 0,
  });
  sync.receive(peer, {
    type: "PUSH",
    docId: RUNDOWN_LIVE,
    generation: 1,
    clientSeq: 1,
    update: rdDoc.encodeState(),
    heal: false,
  });
  await flushAll(fc);
  sync.detach(peer);
}

async function callMos(
  mos: MosBridgeService,
  user: Identity | null,
  method: "GET" | "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  const request = new Request(`http://localhost:5911${path}`, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const response = await answerMosRequest(request, {
    mos,
    user: () => user,
  });
  if (response === null)
    throw new Error(`unmatched MOS route ${method} ${path}`);
  return response;
}

test("SSRF allowlist denies metadata, 0.0.0.0/8, IPv4-mapped IPv6 bypasses, public IPs and bad ports", async () => {
  // Allowed studio private/loopback networks
  expect(isIpAllowed("127.0.0.1")).toBe(true);
  expect(isIpAllowed("10.20.30.40")).toBe(true);
  expect(isIpAllowed("172.16.5.10")).toBe(true);
  expect(isIpAllowed("192.168.1.50")).toBe(true);
  expect(isIpAllowed("::1")).toBe(true);
  expect(isIpAllowed("fd12:3456:789a::1")).toBe(true);

  // Denied metadata, unspecified, IPv4-mapped IPv6, public IPs
  const deniedIps = [
    "169.254.169.254",
    "169.254.0.1",
    "0.0.0.0",
    "0.1.2.3",
    "8.8.8.8",
    "1.1.1.1",
    "fd00:ec2::254",
    "fe80::1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "0:0:0:0:0:ffff:169.254.169.254",
  ];
  for (const ip of deniedIps) {
    expect(isIpAllowed(ip)).toBe(false);
    // Hard-denied metadata/unspecified/mapped IPs stay blocked even if added to extra CIDRs
    expect(
      isIpAllowed(ip, ["169.254.0.0/16", "0.0.0.0/8", "fd00:ec2::/32"]),
    ).toBe(false);
  }

  // Ports outside 1024..65535 are rejected
  expect((await resolvePinnedTarget("127.0.0.1", 80)).ok).toBe(false);
  expect((await resolvePinnedTarget("127.0.0.1", 1023)).ok).toBe(false);
  expect((await resolvePinnedTarget("127.0.0.1", 65536)).ok).toBe(false);

  // DNS pinning rejects hostname if ANY returned A/AAAA record is outside allowlist
  const mixedDns = await resolvePinnedTarget("prompter.studio", 10541, {
    lookup: async () => [
      { address: "192.168.1.20", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ],
  });
  expect(mixedDns.ok).toBe(false);

  const okDns = await resolvePinnedTarget("prompter.studio", 10541, {
    lookup: async () => [{ address: "192.168.1.20", family: 4 }],
  });
  expect(okDns).toEqual({
    ok: true,
    address: "192.168.1.20",
    family: 4,
    port: 10541,
  });
});

test("end-to-end MOS TCP bridge delivers WinPlus-IP stories, preserves air window, and enforces ACLs & roReq IDOR", async () => {
  const mock = await createMockMosPrompter({
    dialect: "autoscript_winplus_ip",
  });
  const fc = fakeClock(100_000);
  const world = createMosWorld(fc);
  await seedWorld(world, fc, { insideAirWindow: true });

  try {
    // Non-owner Leo cannot configure workspace MOS (403)
    const nonOwnerSave = await callMos(
      world.mos,
      LEO,
      "PUT",
      `/api/workspaces/${WORKSPACE}/mos`,
      {
        dialect: "autoscript_winplus_ip",
        host: "127.0.0.1",
        lowerPort: mock.port,
        upperPort: mock.port,
        ncsId: "manent.ncs",
        mosId: "winplus.studio",
        allowedCidrs: [],
        enabled: true,
      },
    );
    expect(nonOwnerSave.status).toBe(403);

    // SSRF target 169.254.169.254 is refused at save time (400/403)
    const ssrfSave = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/workspaces/${WORKSPACE}/mos`,
      {
        dialect: "autoscript_winplus_ip",
        host: "169.254.169.254",
        lowerPort: 10540,
        upperPort: 10541,
        ncsId: "manent.ncs",
        mosId: "winplus.studio",
        allowedCidrs: [],
        enabled: true,
      },
    );
    expect(ssrfSave.status).toBe(400);

    // Owner Ana saves valid loopback studio MOS config
    const saved = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/workspaces/${WORKSPACE}/mos`,
      {
        dialect: "autoscript_winplus_ip",
        host: "127.0.0.1",
        lowerPort: mock.port,
        upperPort: mock.port,
        ncsId: "manent.ncs",
        mosId: "winplus.studio",
        allowedCidrs: [],
        enabled: true,
      },
    );
    expect(saved.status).toBe(200);

    // Test handshake route succeeds against mock MOS prompter
    const check = await callMos(
      world.mos,
      ANA,
      "POST",
      `/api/workspaces/${WORKSPACE}/mos/check`,
      {},
    );
    expect(check.status).toBe(200);
    expect(((await check.json()) as { ok: boolean }).ok).toBe(true);

    // Leo lacks send_to_prompter -> cannot enable rundown MOS opt-in (403)
    const leoOptIn = await callMos(
      world.mos,
      LEO,
      "PUT",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
      { workspaceId: WORKSPACE, enabled: true, roSlug: "Six O'Clock News" },
    );
    expect(leoOptIn.status).toBe(403);

    // Rundown MOS is OFF by default
    const defaultOpt = await callMos(
      world.mos,
      ANA,
      "GET",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
    );
    expect(((await defaultOpt.json()) as { enabled: boolean }).enabled).toBe(
      false,
    );

    // Ana opts RUNDOWN_LIVE into MOS while inside air window -> roCreate arrives with 0 unsent stories
    const optIn = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
      { workspaceId: WORKSPACE, enabled: true, roSlug: "Six O'Clock News" },
    );
    expect(optIn.status).toBe(200);
    await mock.waitFor((msgs) => msgs.some((m) => m.kind === "roCreate"));
    expect(mock.runningOrders.get(RUNDOWN_LIVE)?.stories).toEqual([]);

    // Edit story inside the air window WITHOUT manual Send -> NOTHING sent over MOS!
    const editor = fakePeer({ userId: ANA.userId, name: ANA.name });
    world.sync.attach(editor);
    world.sync.receive(editor, {
      type: "SUBSCRIBE",
      docId: STORY_1,
      generation: 0,
      mode: "edit",
      clientIds: [601],
      lastServerSeq: 0,
    });
    const file = world.storage.open({ kind: "project", id: PROJECT });
    const sRow = file.log.get(STORY_1)!;
    const cp = file.checkpoints.newest(STORY_1, sRow.generation);
    const sDoc =
      cp === null
        ? createDoc({ clientId: 601 })
        : loadDoc(cp.state, { clientId: 601 });
    for (const e of file.log.tail(STORY_1, sRow.generation, cp?.seq ?? 0).rows)
      sDoc.applyUpdate(e.update, ORIGIN_LOAD);
    const updates: Uint8Array[] = [];
    const stopSub = sDoc.subscribe((u) => updates.push(u));
    scriptBody(sDoc).write((w) => {
      w.deleteText(BLK_DIAL, 0, "Initial spoken copy.".length);
      w.insertText(BLK_DIAL, 0, "Air-window edited copy.");
    });
    stopSub();
    expect(updates.length).toBeGreaterThan(0);
    world.sync.receive(editor, {
      type: "PUSH",
      docId: STORY_1,
      generation: sRow.generation,
      clientSeq: 1,
      update: updates[0]!,
      heal: false,
    });
    await flushAll(fc);
    fc.advance(5_000); // even 5s quiet inside air window must not send
    await flushAll(fc);
    expect(mock.received.filter((m) => m.kind === "roStorySend")).toHaveLength(
      0,
    );

    // Manual Send to prompter delivers ONLY ADR 0050 spoken lines (action block excluded!)
    const sent = world.prompter.send(ANA.userId, {
      docId: RUNDOWN_LIVE,
      rowId: ROW_1,
      key: keyOf(1),
    });
    await flushAll(fc);
    expect((await sent).ok).toBe(true);
    await mock.waitFor((msgs) => msgs.some((m) => m.kind === "roStorySend"));
    const ro = mock.runningOrders.get(RUNDOWN_LIVE);
    expect(ro?.stories).toHaveLength(1);
    expect(ro?.stories[0]?.paragraphs).toEqual([
      "ANA",
      "Air-window edited copy.",
    ]);
    expect(ro?.stories[0]?.presenter).toBe("ANA");

    // Inbound roReq IDOR check: non-opted-in RUNDOWN_PRIVATE gets NACK, opted-in RUNDOWN_LIVE gets roCreate + roStorySend
    const privReplies = world.mos.handleIncomingMosMessage({
      kind: "roReq",
      mosId: "winplus.studio",
      ncsId: "manent.ncs",
      messageId: 90,
      roId: RUNDOWN_PRIVATE,
    });
    expect(privReplies).toEqual([
      expect.objectContaining({
        kind: "roAck",
        roId: RUNDOWN_PRIVATE,
        roStatus: "NACK",
      }),
    ]);

    const liveReplies = world.mos.handleIncomingMosMessage({
      kind: "roReq",
      mosId: "winplus.studio",
      ncsId: "manent.ncs",
      messageId: 91,
      roId: RUNDOWN_LIVE,
    });
    expect(liveReplies.map((m) => m.kind)).toEqual(["roCreate", "roStorySend"]);

    // Opting out sends roDelete
    const optOut = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
      { workspaceId: WORKSPACE, enabled: false, roSlug: "Six O'Clock News" },
    );
    expect(optOut.status).toBe(200);
    await mock.waitFor((msgs) => msgs.some((m) => m.kind === "roDelete"));
    expect(mock.runningOrders.has(RUNDOWN_LIVE)).toBe(false);

    world.sync.detach(editor);
  } finally {
    await world.mos.stop();
    world.prompter.stop();
    await mock.close();
  }
});

test("non-owner cannot run check handshake, and inbound MOS TCP server handles heartbeat/roReq/roListAll cleanly", async () => {
  const fc = fakeClock(200_000);
  const world = createMosWorld(fc);
  await seedWorld(world, fc, { insideAirWindow: false });

  const leoCheck = await callMos(
    world.mos,
    LEO,
    "POST",
    `/api/workspaces/${WORKSPACE}/mos/check`,
    { host: "127.0.0.1", upperPort: 10541 },
  );
  expect(leoCheck.status).toBe(403);

  // Inbound MOS TCP server enforces peer allowlist & responds to heartbeat and roReqAll over UTF-16BE
  const tcpServer = await createMosTcpServer({
    host: "127.0.0.1",
    port: 0,
    onMessage: (msg) => world.mos.handleIncomingMosMessage(msg),
  });
  const pinned = await resolvePinnedTarget("127.0.0.1", tcpServer.port);
  expect(pinned.ok).toBe(true);
  if (!pinned.ok) return;
  const client = createMosTcpClient({ target: pinned });

  try {
    const hbReply = await client.send({
      kind: "heartbeat",
      mosId: "mos.studio",
      ncsId: "manent.ncs",
      messageId: 1,
      time: "2026-11-25T21:00:00Z",
    });
    expect(hbReply?.kind).toBe("heartbeat");

    const listReply = await client.send({
      kind: "roReqAll",
      mosId: "mos.studio",
      ncsId: "manent.ncs",
      messageId: 2,
    });
    expect(listReply).toEqual({
      kind: "roListAll",
      mosId: "mos.studio",
      ncsId: "manent.ncs",
      messageId: 2,
      runningOrders: [],
    });

    const nackReply = await client.send({
      kind: "roReq",
      mosId: "mos.studio",
      ncsId: "manent.ncs",
      messageId: 3,
      roId: RUNDOWN_PRIVATE,
    });
    expect(nackReply).toEqual({
      kind: "roAck",
      mosId: "mos.studio",
      ncsId: "manent.ncs",
      messageId: 3,
      roId: RUNDOWN_PRIVATE,
      roStatus: "NACK",
    });
  } finally {
    client.close();
    await tcpServer.close();
    await world.mos.stop();
    world.prompter.stop();
  }
});

test("MOS bridge serializes overlapping feed batches per workspace in FIFO order", async () => {
  const fc = fakeClock(300_000);
  const world = createMosWorld(fc);
  await seedWorld(world, fc, { insideAirWindow: true });
  const mock = await createMockMosPrompter({
    dialect: "autoscript_winplus_ip",
  });

  try {
    const saved = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/workspaces/${WORKSPACE}/mos`,
      {
        enabled: true,
        dialect: "autoscript_winplus_ip",
        host: mock.host,
        lowerPort: mock.port,
        upperPort: mock.port,
      },
    );
    expect(saved.status).toBe(200);

    // Trigger opt-in (queues roCreate) and immediately fire a manual send (queues roStorySend) before TCP connects.
    const optIn = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
      { workspaceId: WORKSPACE, enabled: true, roSlug: "Six O'Clock News" },
    );
    expect(optIn.status).toBe(200);

    const sent = world.prompter.send(ANA.userId, {
      docId: RUNDOWN_LIVE,
      rowId: ROW_1,
      key: keyOf(9),
    });
    await flushAll(fc);
    expect((await sent).ok).toBe(true);

    await mock.waitFor(
      (msgs) =>
        msgs.some((m) => m.kind === "roCreate") &&
        msgs.some((m) => m.kind === "roStorySend"),
    );
    const firstCreate = mock.received.findIndex((m) => m.kind === "roCreate");
    const firstStory = mock.received.findIndex((m) => m.kind === "roStorySend");
    expect(firstCreate).toBeGreaterThanOrEqual(0);
    expect(firstStory).toBeGreaterThan(firstCreate);
    expect(
      mock.runningOrders.get(RUNDOWN_LIVE)?.stories[0]?.paragraphs,
    ).toEqual(["ANA", "Initial spoken copy."]);
  } finally {
    await world.mos.stop();
    world.prompter.stop();
    await mock.close();
  }
});

test("MOS bridge clears queued batches on stop and delivers fresh waves after idle drain", async () => {
  const fc = fakeClock(400_000);
  const world = createMosWorld(fc);
  await seedWorld(world, fc, { insideAirWindow: true });
  const mock = await createMockMosPrompter({
    dialect: "autoscript_winplus_ip",
  });

  try {
    const saved = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/workspaces/${WORKSPACE}/mos`,
      {
        enabled: true,
        dialect: "autoscript_winplus_ip",
        host: mock.host,
        lowerPort: mock.port,
        upperPort: mock.port,
      },
    );
    expect(saved.status).toBe(200);

    const optIn = await callMos(
      world.mos,
      ANA,
      "PUT",
      `/api/prompter/${RUNDOWN_LIVE}/mos`,
      { workspaceId: WORKSPACE, enabled: true, roSlug: "Six O'Clock News" },
    );
    expect(optIn.status).toBe(200);
    await mock.waitFor((msgs) => msgs.some((m) => m.kind === "roCreate"));

    // Allow the settled queue tail to prune while idle, then send a new batch.
    await flushAll(fc);
    const sent = world.prompter.send(ANA.userId, {
      docId: RUNDOWN_LIVE,
      rowId: ROW_1,
      key: keyOf(11),
    });
    await flushAll(fc);
    expect((await sent).ok).toBe(true);
    await mock.waitFor((msgs) => msgs.some((m) => m.kind === "roStorySend"));

    // Stopping clears any queued state and drops subsequent feed updates cleanly.
    const countBeforeStop = mock.received.length;
    await world.mos.stop();
    const afterStop = world.prompter.send(ANA.userId, {
      docId: RUNDOWN_LIVE,
      rowId: ROW_1,
      key: keyOf(12),
    });
    await flushAll(fc);
    expect((await afterStop).ok).toBe(true);
    expect(mock.received.length).toBe(countBeforeStop);
  } finally {
    await world.mos.stop();
    world.prompter.stop();
    await mock.close();
  }
});
