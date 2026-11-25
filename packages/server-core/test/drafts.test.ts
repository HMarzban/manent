import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  createDoc,
  readCommentRounds,
  scriptDocFromJSON,
  writeGroup,
} from "@manent/crdt";
import type { ScriptFontFiles } from "@manent/formats";
import type { FontFaceKey } from "@manent/pagination";
import type { DocJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  PROTOCOL_VERSION,
  SHARE_LINK_EXPIRIES_MS,
  commentsDocId,
  indexDocId,
} from "@manent/sync-protocol";
import type {
  DraftOpenResponse,
  DraftSendsResponse,
  DraftSinceResponse,
  SendDraftResponse,
  VersionSet,
} from "@manent/sync-protocol";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  DEFAULT_LIMITS,
  PRODUCT_SETTING_RULES,
  createDraftReaders,
  createDraftsService,
  createHistoryService,
  createServer,
  createSignedSessionStore,
  createSyncService,
  createTicketStore,
  readScriptFonts,
} from "../src/index.ts";
import type { Directory, HistoryService, SyncService } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import { DOC, PROJECT, appendAll } from "./seed.ts";
import { subscribe } from "./service-world.ts";

const PEOPLE: Readonly<Record<string, string>> = {
  dana: "Dana Reyes",
  sam: "Sam Okafor",
  priya: "Priya Nair",
  leo: "Leo Marsh",
  ana: "Ana Costa",
};

const USERS: Directory = {
  user: (userId) =>
    Object.hasOwn(PEOPLE, userId) ? { userId, name: PEOPLE[userId]! } : null,
  workspacesOf: (userId) =>
    Object.hasOwn(PEOPLE, userId)
      ? [{ id: "studio", name: "Studio", seeding: null }]
      : [],
};

const T0 = 1_811_808_000_000;
const V1: VersionSet = {
  protocol: PROTOCOL_VERSION,
  schema: 1,
  engine: 1,
  table: 0,
};
const OTHER_SCRIPT = "01a1e81d-c6f2-7301-a0f6-5c345eb6c799";
const OTHER_PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d499";

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

const loadTestFonts = (): Promise<ScriptFontFiles> =>
  readScriptFonts((key: FontFaceKey) =>
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      join(import.meta.dir, "..", "..", "formats", "test"),
    ),
  );

const fontsPromise = loadTestFonts();

async function extractPdfPagesText(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(""),
    );
  }
  await task.destroy();
  return pages;
}

function createDraftsHarness() {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: clock.clock.now });
  let seqId = 0;
  let seqToken = 0;
  const ids = (): string => `id-${String(++seqId).padStart(5, "0")}`;
  const tokens = (): string => `tok_${String(++seqToken).padStart(39, "0")}`;
  const directory = USERS;
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(7),
    now: clock.clock.now,
  });
  const sentEvents: { docId: string; versionId: string; userId: string }[] = [];
  const draftEvents = {
    named: () => {},
    sent: (docId: string, versionId: string, userId: string) => {
      sentEvents.push({ docId, versionId, userId });
    },
    issued: () => {},
  };

  let builtSync: SyncService | null = null;
  const sync = (): SyncService => {
    if (builtSync === null) throw new RangeError("sync not built");
    return builtSync;
  };
  const history: HistoryService = createHistoryService({
    sync,
    storage,
    clock: clock.clock,
    ids,
  });
  const drafts = createDraftsService({
    storage,
    sync,
    clock: clock.clock,
    ids,
    tokens,
    names: (userId) => directory.user(userId)?.name ?? userId,
    fonts: () => fontsPromise,
    users: directory,
    draftEvents,
  });
  const draftReaders = createDraftReaders(storage);
  builtSync = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    limits: {
      ...DEFAULT_LIMITS,
      framesPerSecond: 1e9,
      frameBurst: 1e9,
      bytesPerSecond: 1e12,
      byteBurst: 1e12,
    },
    registry: PRODUCT_SETTING_RULES,
    hooks: [history],
    draftReaders,
  });
  const server = createServer({
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
      tickets: createTicketStore({ now: clock.clock.now }),
      versions: { current: V1, min: V1 },
      allowedOrigins: ["http://localhost:4747"],
    },
    sync: {
      storage,
      clock: clock.clock,
      defer: clock.defer,
      ids,
      registry: PRODUCT_SETTING_RULES,
      hooks: [history],
      draftReaders,
    },
    history,
    drafts,
  });

  // Create main project index with Network group (watermark: true) and script
  const projectIndexId = indexDocId("project", PROJECT);
  sync().access.create("dana", {
    docId: projectIndexId,
    kind: "index",
    home: `project:${PROJECT}`,
  });
  const idx = scriptDocFromJSON({ type: "doc", content: [] }, { clientId: 1 });
  writeGroup(idx, {
    id: "network",
    name: "Network",
    role: null,
    memberUserIds: ["leo", "priya"],
    watermark: true,
  });
  storage.open({ kind: "project", id: PROJECT }).log.append({
    docId: projectIndexId,
    generation: 1,
    userId: "dana",
    origin: "edit",
    update: idx.encodeState(),
    clocks: [],
  });

  sync().access.create("dana", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(DOC, "sam", "edit", []);
  const script: DocJSON = {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: "scene0000001", type: "scene_heading" },
            content: [{ type: "text", text: "INT. HARBOUR - NIGHT" }],
          },
          {
            type: "block",
            attrs: { id: "action000001", type: "action" },
            content: [{ type: "text", text: "Rain falls on the pier." }],
          },
        ],
      },
    ],
  };
  appendAll(
    storage,
    [scriptDocFromJSON(script, { clientId: 2 }).encodeState()],
    {
      userId: "dana",
    },
  );

  // Create a second script in another project for cross-script `since` checks
  sync().access.create("dana", {
    docId: OTHER_SCRIPT,
    kind: "script",
    home: `project:${OTHER_PROJECT}`,
  });
  storage.open({ kind: "project", id: OTHER_PROJECT }).log.append({
    docId: OTHER_SCRIPT,
    generation: 1,
    userId: "dana",
    origin: "edit",
    update: scriptDocFromJSON(script, { clientId: 3 }).encodeState(),
    clocks: [],
  });

  // Subscribe Dana as editor so CONTROL broadcasts are captured
  const danaPeer = fakePeer({
    userId: "dana",
    name: "Dana Reyes",
    versions: V1,
  });
  sync().attach(danaPeer);
  sync().receive(danaPeer, subscribe(DOC, "edit", [100]));
  danaPeer.take();

  const flush = async <T>(promise: Promise<T>): Promise<T> => {
    for (let i = 0; i < 40; i++) {
      clock.runDeferred();
      await Promise.resolve();
    }
    return promise;
  };

  const tokenOf = (userId: string) => sessions.issue(userId);
  const call = async (
    method: "GET" | "POST",
    path: string,
    userId: string | null,
    body?: unknown,
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (userId !== null) headers.Authorization = `Bearer ${tokenOf(userId)}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const req = new Request(`http://localhost:4747${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const res = await flush(
      server.fetch(req, { remoteAddress: "127.0.0.1", upgrade: () => false }),
    );
    if (res === null) throw new RangeError("unexpected socket upgrade");
    return res;
  };

  return {
    clock,
    storage,
    sync: sync(),
    history,
    drafts,
    draftReaders,
    danaPeer,
    sentEvents,
    flush,
    call,
  };
}

test("send draft freezes version, opens one round per group, deduplicates repeated keys, and checks token hashes", async () => {
  const h = createDraftsHarness();
  const payload = {
    docId: DOC,
    key: keyOf(1),
    name: "Network",
    what: "whole_script",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["network"],
    recipientUserIds: ["ana"],
    watermark: false,
    link: { expiresInMs: SHARE_LINK_EXPIRIES_MS[2], signIn: false },
  };

  const firstRes = await h.call("POST", "/api/drafts/send", "dana", payload);
  expect(firstRes.status).toBe(200);
  const first = (await firstRes.json()) as SendDraftResponse;
  expect(first.version.kind).toBe("sent");
  expect(first.version.name).toBe("Network");
  expect(first.send.groups).toEqual([
    { groupId: "network", name: "Network", count: 2, watermark: true },
  ]);
  expect(first.send.recipientCount).toBe(3);
  expect(first.send.hasLink).toBe(true);
  expect(first.recipientToken).not.toBeNull();
  expect(first.linkToken).not.toBeNull();
  expect(h.sentEvents).toEqual([
    { docId: DOC, versionId: first.version.id, userId: "dana" },
  ]);

  // Token stored only as SHA-256 hash
  const expectedHash = new Uint8Array(
    createHash("sha256").update(first.recipientToken!).digest(),
  );
  expect(h.storage.shareLinks.draftLinkOf(expectedHash)?.signIn).toBe(true);

  // Round created in comments doc named after group
  const cId = commentsDocId(DOC);
  const commentsFile = h.storage.open({ kind: "project", id: PROJECT });
  const cDoc = createDoc({ clientId: 99 });
  for (const r of commentsFile.log.tail(cId, 1, 0).rows)
    cDoc.applyUpdate(r.update);
  const rounds = Object.values(readCommentRounds(cDoc));
  expect(rounds).toEqual([
    {
      v: 1,
      name: "Network",
      versionId: first.version.id,
      createdAt: T0,
    },
  ]);

  // Repeated request key returns first answer without creating another version or event
  const replayRes = await h.call("POST", "/api/drafts/send", "dana", payload);
  expect(replayRes.status).toBe(200);
  const replay = (await replayRes.json()) as SendDraftResponse;
  expect(replay).toEqual(first);
  expect(h.sentEvents).toHaveLength(1);
  expect(commentsFile.sharing.sendsOf(DOC)).toHaveLength(1);
  expect(
    commentsFile.history.page(DOC, null, 50).filter((v) => v.kind === "sent"),
  ).toHaveLength(1);

  const controls = h.danaPeer
    .take()
    .flatMap((m) => (m.type === "CONTROL" ? [m] : []));
  expect(controls).toHaveLength(1);
  expect(controls[0]!.kind).toBe("draft_sent");
});

test("sign-in link refuses non-recipients with not_sent, logs opens, protects sends list, and checks since", async () => {
  const h = createDraftsHarness();

  // Send 1: White to Leo + Ana, plus anonymous link
  const s1Res = await h.call("POST", "/api/drafts/send", "dana", {
    docId: DOC,
    key: keyOf(10),
    name: "White",
    what: "whole_script",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["network"],
    recipientUserIds: ["ana"],
    watermark: false,
    link: { expiresInMs: SHARE_LINK_EXPIRIES_MS[1], signIn: false },
  });
  const s1 = (await s1Res.json()) as SendDraftResponse;

  // Named (non-sent) version on the same script, and a sent draft on another script
  const namedRes = await h.flush(
    h.history.name("dana", {
      docId: DOC,
      key: keyOf(11),
      name: "Working named",
      fromVersionId: null,
    }),
  );
  if (!namedRes.ok) throw new Error("name failed");
  const otherRes = await h.call("POST", "/api/drafts/send", "dana", {
    docId: OTHER_SCRIPT,
    key: keyOf(12),
    name: "Other",
    what: "whole_script",
    againstVersionId: null,
    files: [],
    groupIds: [],
    recipientUserIds: ["leo"],
    watermark: false,
    link: null,
  });
  const other = (await otherRes.json()) as SendDraftResponse;

  // Send 2: Blue to Leo
  h.clock.advance(1_000);
  const s2Res = await h.call("POST", "/api/drafts/send", "dana", {
    docId: DOC,
    key: keyOf(13),
    name: "Blue",
    what: "whole_script",
    againstVersionId: s1.version.id,
    files: ["pdf"],
    groupIds: ["network"],
    recipientUserIds: [],
    watermark: false,
    link: null,
  });
  const s2 = (await s2Res.json()) as SendDraftResponse;

  // Unauthenticated caller on sign-in link -> 401
  const unauthOpen = await h.call("POST", "/api/drafts/open", null, {
    token: s1.recipientToken,
  });
  expect(unauthOpen.status).toBe(401);

  // Non-recipient Sam on sign-in link -> 404 not_sent
  const samOpen = await h.call("POST", "/api/drafts/open", "sam", {
    token: s1.recipientToken,
  });
  expect(samOpen.status).toBe(404);
  expect(await samOpen.json()).toEqual({ error: "not_sent" });

  // Recipient Leo opens White (first open) -> watermarked "Leo Marsh", lastReadVersionId null
  const leoOpen1 = await h.call("POST", "/api/drafts/open", "leo", {
    token: s1.recipientToken,
  });
  expect(leoOpen1.status).toBe(200);
  const open1Body = (await leoOpen1.json()) as DraftOpenResponse;
  expect(open1Body.watermark).toBe("Leo Marsh");
  expect(open1Body.canComment).toBe(true);
  expect(open1Body.lastReadVersionId).toBeNull();

  // Anonymous open on anyone link -> clean (watermark null, canComment false), not counted in recipient openedCount
  const anonOpen = await h.call("POST", "/api/drafts/open", null, {
    token: s1.linkToken,
  });
  expect(anonOpen.status).toBe(200);
  const anonBody = (await anonOpen.json()) as DraftOpenResponse;
  expect(anonBody.watermark).toBeNull();
  expect(anonBody.canComment).toBe(false);
  expect(anonBody.lastReadVersionId).toBeNull();

  // Leo opens Blue -> lastReadVersionId is White
  const leoOpen2 = await h.call("POST", "/api/drafts/open", "leo", {
    token: s2.recipientToken,
  });
  expect(leoOpen2.status).toBe(200);
  const open2Body = (await leoOpen2.json()) as DraftOpenResponse;
  expect(open2Body.lastReadVersionId).toBe(s1.version.id);

  // `since` accepts White (earlier sent draft of same script)
  const goodSince = await h.call(
    "GET",
    `/api/drafts/since?token=${encodeURIComponent(s2.recipientToken!)}&since=${encodeURIComponent(s1.version.id)}`,
    "leo",
  );
  expect(goodSince.status).toBe(200);
  const sinceBody = (await goodSince.json()) as DraftSinceResponse;
  expect(sinceBody.versionId).toBe(s1.version.id);
  expect(sinceBody.name).toBe("White");

  // `since` refuses same draft, named draft, foreign script draft, and later draft with 404 not_sent
  for (const badId of [
    s2.version.id,
    namedRes.value.version.id,
    other.version.id,
  ]) {
    const res = await h.call(
      "GET",
      `/api/drafts/since?token=${encodeURIComponent(s2.recipientToken!)}&since=${encodeURIComponent(badId)}`,
      "leo",
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_sent" });
  }
  const laterSince = await h.call(
    "GET",
    `/api/drafts/since?token=${encodeURIComponent(s1.recipientToken!)}&since=${encodeURIComponent(s2.version.id)}`,
    "leo",
  );
  expect(laterSince.status).toBe(404);
  expect(await laterSince.json()).toEqual({ error: "not_sent" });

  // Sends list: allowed for owner/edit, forbidden for commenter/draft reader
  const editorSends = await h.call("POST", "/api/drafts/sends", "sam", {
    docId: DOC,
  });
  expect(editorSends.status).toBe(200);
  const sendsBody = (await editorSends.json()) as DraftSendsResponse;
  expect(
    sendsBody.sends.find((s) => s.sendId === s1.send.sendId)?.openedCount,
  ).toBe(1);
  expect(
    sendsBody.sends.find((s) => s.sendId === s1.send.sendId)?.totalOpens,
  ).toBe(2);

  const readerSends = await h.call("POST", "/api/drafts/sends", "leo", {
    docId: DOC,
  });
  expect(readerSends.status).toBe(403);
  expect(await readerSends.json()).toEqual({ error: "forbidden" });

  // Anonymous PDF before expiry is clean (no watermark)
  const anonPdfRes = await h.call("POST", "/api/drafts/pdf", null, {
    token: s1.linkToken,
  });
  expect(anonPdfRes.status).toBe(200);
  const anonPages = await extractPdfPagesText(
    new Uint8Array(await anonPdfRes.arrayBuffer()),
  );
  expect(anonPages[0]).toContain("INT. HARBOUR - NIGHT");
  expect(anonPages[0]).not.toContain("Leo Marsh");

  // Expiry check on 1-day anyone link
  h.clock.advance(86_400_000);
  const expiredRes = await h.call("POST", "/api/drafts/open", null, {
    token: s1.linkToken,
  });
  expect(expiredRes.status).toBe(410);
  expect(await expiredRes.json()).toEqual({ error: "link_expired" });

  // Watermarked PDF for Leo vs clean PDF for Ana (non-watermarked) and anonymous
  const leoPdfRes = await h.call("POST", "/api/drafts/pdf", "leo", {
    token: s1.recipientToken,
  });
  expect(leoPdfRes.status).toBe(200);
  const leoPages = await extractPdfPagesText(
    new Uint8Array(await leoPdfRes.arrayBuffer()),
  );
  expect(leoPages[0]).toContain("Leo Marsh");

  const anaPdfRes = await h.call("POST", "/api/drafts/pdf", "ana", {
    token: s1.recipientToken,
  });
  expect(anaPdfRes.status).toBe(200);
  const anaPages = await extractPdfPagesText(
    new Uint8Array(await anaPdfRes.arrayBuffer()),
  );
  expect(anaPages[0]).not.toContain("Ana Costa");
  expect(anaPages[0]).not.toContain("Leo Marsh");

  // isDraftReader grants comment on comments doc strictly from draft_sends
  const cId = commentsDocId(DOC);
  expect(h.draftReaders.isDraftReader("leo", DOC)).toBe(true);
  expect(h.draftReaders.isDraftReader("sam", DOC)).toBe(false);
  expect(h.sync.access.resolve("leo", cId)).toMatchObject({
    ok: true,
    access: { role: "comment", capabilities: [] },
  });
  expect(h.sync.access.resolve("leo", DOC)).toEqual({
    ok: false,
    code: "forbidden",
  });

  // Tombstoned script revokes links and disables isDraftReader
  h.storage.directory.tombstone(DOC, "dana");
  expect(h.draftReaders.isDraftReader("leo", DOC)).toBe(false);
  const revokedRes = await h.call("POST", "/api/drafts/open", "leo", {
    token: s1.recipientToken,
  });
  expect(revokedRes.status).toBe(410);
  expect(await revokedRes.json()).toEqual({ error: "link_revoked" });
});

const controlKindsOf = (peer: ReturnType<typeof fakePeer>): string[] =>
  peer
    .take()
    .filter((message) => message.type === "CONTROL")
    .map((message) => message.kind);

test("draft send and open controls reach editors and never viewers or commenters", async () => {
  const h = createDraftsHarness();
  h.storage.directory.setRole(DOC, "priya", "comment", []);
  h.storage.directory.setRole(DOC, "ana", "view", []);
  const sam = fakePeer({
    userId: "sam",
    name: "Sam Okafor",
    versions: V1,
  });
  const priya = fakePeer({
    userId: "priya",
    name: "Priya Nair",
    versions: V1,
  });
  const ana = fakePeer({
    userId: "ana",
    name: "Ana Costa",
    versions: V1,
  });
  for (const peer of [sam, priya, ana]) h.sync.attach(peer);
  h.sync.receive(sam, subscribe(DOC, "edit", [101]));
  h.sync.receive(priya, subscribe(DOC, "view", []));
  h.sync.receive(ana, subscribe(DOC, "view", []));
  expect(sam.take().some((m) => m.type === "SUBSCRIBED")).toBe(true);
  expect(priya.take().some((m) => m.type === "SUBSCRIBED")).toBe(true);
  expect(ana.take().some((m) => m.type === "SUBSCRIBED")).toBe(true);
  h.danaPeer.take();

  const sentRes = await h.call("POST", "/api/drafts/send", "dana", {
    docId: DOC,
    key: keyOf(90),
    name: "Network",
    what: "whole",
    againstVersionId: null,
    files: ["pdf_clean"],
    groupIds: [],
    recipientUserIds: ["leo"],
    watermark: false,
    link: null,
  });
  expect(sentRes.status).toBe(200);
  const sent = (await sentRes.json()) as SendDraftResponse;

  const openRes = await h.call("POST", "/api/drafts/open", "leo", {
    token: sent.recipientToken,
  });
  expect(openRes.status).toBe(200);

  expect(controlKindsOf(h.danaPeer)).toEqual(["draft_sent", "draft_opened"]);
  expect(controlKindsOf(sam)).toEqual(["draft_sent", "draft_opened"]);
  expect(controlKindsOf(priya)).toEqual([]);
  expect(controlKindsOf(ana)).toEqual([]);
});

test("createServer wires config.drafts into sync access for draft-reader comments subscriptions", async () => {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: clock.clock.now });
  let seqId = 0;
  let seqToken = 0;
  const ids = (): string => `srv-${String(++seqId).padStart(5, "0")}`;
  const tokens = (): string => `tok_${String(++seqToken).padStart(39, "0")}`;
  const sessions = createSignedSessionStore({
    secret: new Uint8Array(32).fill(9),
    now: clock.clock.now,
  });
  let serverSync: SyncService | null = null;
  const syncRef = (): SyncService => {
    if (serverSync === null) throw new RangeError("server sync not ready");
    return serverSync;
  };
  const history = createHistoryService({
    sync: syncRef,
    storage,
    clock: clock.clock,
    ids,
  });
  const drafts = createDraftsService({
    storage,
    sync: syncRef,
    clock: clock.clock,
    ids,
    tokens,
    names: (userId) => USERS.user(userId)?.name ?? userId,
    fonts: () => fontsPromise,
    users: USERS,
  });
  const server = createServer({
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
      directory: USERS,
      sessions,
    },
    demo: null,
    socket: {
      tickets: createTicketStore({ now: clock.clock.now }),
      versions: { current: V1, min: V1 },
      allowedOrigins: ["http://localhost:4747"],
    },
    // Intentionally omit `draftReaders`: createServer must fall back to `config.drafts`.
    sync: {
      storage,
      clock: clock.clock,
      defer: clock.defer,
      ids,
      registry: PRODUCT_SETTING_RULES,
      hooks: [history],
    },
    history,
    drafts,
  });
  serverSync = server.sync;
  if (serverSync === null) throw new Error("expected server.sync");

  const projectIndexId = indexDocId("project", PROJECT);
  serverSync.access.create("dana", {
    docId: projectIndexId,
    kind: "index",
    home: `project:${PROJECT}`,
  });
  const idx = scriptDocFromJSON({ type: "doc", content: [] }, { clientId: 1 });
  writeGroup(idx, {
    id: "network",
    name: "Network",
    role: null,
    memberUserIds: ["leo"],
    watermark: true,
  });
  storage.open({ kind: "project", id: PROJECT }).log.append({
    docId: projectIndexId,
    generation: 1,
    userId: "dana",
    origin: "edit",
    update: idx.encodeState(),
    clocks: [],
  });
  serverSync.access.create("dana", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  appendAll(
    storage,
    [
      scriptDocFromJSON(
        {
          type: "doc",
          content: [
            {
              type: "section",
              content: [
                {
                  type: "block",
                  attrs: { id: "scene0000001", type: "scene_heading" },
                  content: [{ type: "text", text: "INT. PIER - NIGHT" }],
                },
              ],
            },
          ],
        },
        { clientId: 2 },
      ).encodeState(),
    ],
    { userId: "dana" },
  );

  const req = new Request("http://localhost:4747/api/drafts/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessions.issue("dana")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      docId: DOC,
      key: keyOf(99),
      name: "Studio",
      what: "whole_script",
      againstVersionId: null,
      files: ["pdf"],
      groupIds: ["network"],
      recipientUserIds: [],
      watermark: false,
      link: null,
    }),
  });
  const sendPromise = server.fetch(req, {
    remoteAddress: "127.0.0.1",
    upgrade: () => false,
  });
  for (let i = 0; i < 40; i++) {
    clock.runDeferred();
    await Promise.resolve();
  }
  const sendRes = await sendPromise;
  expect(sendRes?.status).toBe(200);

  // Leo subscribes over WS: admitted to comments doc in edit mode as comment role, refused on live script
  const leoPeer = fakePeer({
    userId: "leo",
    name: "Leo Marsh",
    versions: V1,
  });
  serverSync.attach(leoPeer);
  const cId = commentsDocId(DOC);
  serverSync.receive(leoPeer, subscribe(cId, "edit", [201]));
  const cMessages = leoPeer.take();
  expect(
    cMessages.some((m) => m.type === "SUBSCRIBED" && m.docId === cId),
  ).toBe(true);
  serverSync.receive(leoPeer, subscribe(DOC, "edit", [202]));
  const sMessages = leoPeer.take();
  expect(
    sMessages.some(
      (m) =>
        m.type === "ERROR" && m.doc?.docId === DOC && m.message === "forbidden",
    ),
  ).toBe(true);
});

test("anyone-with-link sign-in token admits non-recipients while recipient token stays restricted, and directRecipientCount is stored", async () => {
  const h = createDraftsHarness();
  // Group "network" holds ["leo", "priya"]; Ana is a direct recipient outside the group, Leo overlaps
  const sendRes = await h.call("POST", "/api/drafts/send", "dana", {
    docId: DOC,
    key: keyOf(90),
    name: "Open Sign-In Draft",
    what: "whole_script",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["network"],
    recipientUserIds: ["ana", "leo"],
    watermark: false,
    link: { expiresInMs: SHARE_LINK_EXPIRIES_MS[2], signIn: true },
  });
  expect(sendRes.status).toBe(200);
  const sent = (await sendRes.json()) as SendDraftResponse;
  expect(sent.send.directRecipientCount).toBe(1);
  expect(sent.recipientToken).not.toBeNull();
  expect(sent.linkToken).not.toBeNull();

  // Signed-in non-recipient ("sam") is refused on the recipient token with 404 not_sent
  const recipientAttempt = await h.call("POST", "/api/drafts/open", "sam", {
    token: sent.recipientToken,
  });
  expect([recipientAttempt.status, await recipientAttempt.json()]).toEqual([
    404,
    { error: "not_sent" },
  ]);

  // Same non-recipient ("sam") is admitted on the anyone-with-link sign-in token (open: true)
  const openAttempt = await h.call("POST", "/api/drafts/open", "sam", {
    token: sent.linkToken,
  });
  expect(openAttempt.status).toBe(200);

  // Unauthenticated caller is still refused 401 on the sign-in open link
  const anonAttempt = await h.call("POST", "/api/drafts/open", null, {
    token: sent.linkToken,
  });
  expect([anonAttempt.status, await anonAttempt.json()]).toEqual([
    401,
    { error: "unauthenticated" },
  ]);

  // Listing sends preserves stored directRecipientCount = 1
  const listRes = await h.call("POST", "/api/drafts/sends", "dana", {
    docId: DOC,
  });
  expect(listRes.status).toBe(200);
  const listed = (await listRes.json()) as {
    sends: { sendId: string; directRecipientCount?: number | null }[];
  };
  expect(listed.sends[0]?.directRecipientCount).toBe(1);
});
