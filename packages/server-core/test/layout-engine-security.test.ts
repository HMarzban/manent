// Security regression tests for layout engine pin & guarded layout settings:
// 1. Unknown/uncarried script.engineVersion rejected as bad_value; carried rollback (2 -> 1) accepted while unlocked.
// 2. Locked scripts refuse SET of script.engineVersion and script.linesPerPage (4423 locked), while unguarded script.sceneNumbers succeeds.
// 3. POST /api/production/layout refuses script.engineVersion (400 bad_request).
import { expect, test } from "bun:test";
import { ORIGIN_LOAD, createDoc, scriptSettings } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import { CODE, PROTOCOL_VERSION } from "@manent/sync-protocol";
import {
  PRODUCT_SETTING_RULES,
  createServer,
  createSyncService,
} from "../src/index.ts";
import {
  createFakeDirectory,
  fakeClock,
  fakePeer,
} from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { KEY1, key, productionWorld } from "./production-world.ts";
import { DOC, HOME } from "./seed.ts";
import { createWorld, setOf } from "./write-world.ts";

test("SET of script.engineVersion accepts carried engines (including 2 -> 1 rollback) and refuses uncarried values", () => {
  expect([
    PRODUCT_SETTING_RULES.check("script.engineVersion", 1),
    PRODUCT_SETTING_RULES.check("script.engineVersion", 2),
    PRODUCT_SETTING_RULES.check("script.engineVersion", 3),
    PRODUCT_SETTING_RULES.check("script.engineVersion", 99),
    PRODUCT_SETTING_RULES.check("script.engineVersion", 0),
    PRODUCT_SETTING_RULES.check("script.engineVersion", 1.5),
    PRODUCT_SETTING_RULES.check("script.engineVersion", "2"),
  ]).toEqual([
    { ok: true },
    { ok: true },
    { ok: false, code: "bad_value" },
    { ok: false, code: "bad_value" },
    { ok: false, code: "bad_value" },
    { ok: false, code: "bad_value" },
    { ok: false, code: "bad_value" },
  ]);

  const { path, room, subA, clock, refusals } = createWorld({
    registry: PRODUCT_SETTING_RULES,
  });

  // Uncarried engine version 3 is refused as bad_value without mutating the document.
  path.set(room, subA, setOf(1, "script.engineVersion", 3));
  clock.runDeferred();
  expect(scriptSettings(room.doc!).entries()["script.engineVersion"]).toBe(
    undefined,
  );
  expect(refusals).toEqual([
    {
      code: 4423,
      message: "bad_value",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 1,
    },
  ]);

  // Carried engine 2 is accepted, then rolling back 2 -> 1 (Undo) is also accepted while unlocked.
  path.set(room, subA, setOf(2, "script.engineVersion", 2));
  clock.runDeferred();
  expect(scriptSettings(room.doc!).entries()["script.engineVersion"]).toBe(2);

  path.set(room, subA, setOf(3, "script.engineVersion", 1));
  clock.runDeferred();
  expect(scriptSettings(room.doc!).entries()["script.engineVersion"]).toBe(1);
});

test("locked scripts refuse SET of script.engineVersion and script.linesPerPage with 4423", () => {
  const { path, room, subA, clock, refusals } = createWorld({
    registry: PRODUCT_SETTING_RULES,
  });
  room.row = { ...room.row, locked: 1 };

  path.set(room, subA, setOf(1, "script.engineVersion", 2));
  path.set(room, subA, setOf(2, "script.linesPerPage", 50));
  path.set(room, subA, setOf(3, "script.sceneNumbers", "left"));
  clock.runDeferred();

  expect(scriptSettings(room.doc!).entries()).toEqual({
    "script.sceneNumbers": "left",
  });
  expect(refusals).toEqual([
    {
      code: 4423,
      message: "locked",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 1,
    },
    {
      code: 4423,
      message: "locked",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 2,
    },
  ]);
});

test("POST /api/production/layout refuses script.engineVersion with 400 bad_request", async () => {
  const w = productionWorld();
  const base = makeConfig();
  const config = {
    ...base,
    auth: {
      ...base.auth,
      directory: createFakeDirectory([
        { user: { userId: "priya", name: "Priya Nair" }, workspaces: [] },
      ]),
    },
    production: w.service,
  };
  const server = createServer(config);
  const token = config.auth.sessions.issue("priya");
  const post = async (
    path: string,
    body: unknown,
  ): Promise<[number, unknown]> => {
    const request = new Request(`http://127.0.0.1:4747${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const response = await w.run(
      server.fetch(request, {
        remoteAddress: "127.0.0.1",
        upgrade: () => false,
      }),
    );
    if (response === null) throw new TypeError("the request was upgraded");
    return [response.status, await response.json()];
  };

  const locked = await post("/api/production/lock", {
    docId: DOC,
    key: KEY1,
    numbering: "suffix",
    colourOrder: "standard",
    lockedOn: "2026-10-27",
  });
  expect(locked[0]).toBe(200);

  const attempt = await post("/api/production/layout", {
    docId: DOC,
    key: key(2),
    changes: [{ key: "script.engineVersion", value: 2 }],
    affected: { gainAPages: [], fallShort: [] },
  });
  expect(attempt).toEqual([400, { error: "bad_request", issued: null }]);

  // Mixed changes array carrying both script.linesPerPage and script.engineVersion is refused whole
  const mixed = await post("/api/production/layout", {
    docId: DOC,
    key: key(3),
    changes: [
      { key: "script.linesPerPage", value: 50 },
      { key: "script.engineVersion", value: 2 },
    ],
    affected: { gainAPages: [], fallShort: [] },
  });
  expect(mixed).toEqual([400, { error: "bad_request", issued: null }]);
  const liveDoc = createDoc();
  for (const row of w.file.log.tail(DOC, 1, 0).rows)
    liveDoc.applyUpdate(row.update, ORIGIN_LOAD);
  expect(scriptSettings(liveDoc).entries()["script.linesPerPage"]).toBeNull();
  liveDoc.destroy();
});

test("SET script.engineVersion mirrors to documents.engine_version so gateDocument downgrades engine-1 clients to read-only", () => {
  const fc = fakeClock(1_000);
  const storage = createMemoryStorage({ now: fc.clock.now });
  let idSeq = 1;
  const service = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids: () => `id-${idSeq++}`,
    registry: PRODUCT_SETTING_RULES,
    versions: {
      current: { protocol: PROTOCOL_VERSION, schema: 1, engine: 2, table: 1 },
      min: { protocol: PROTOCOL_VERSION, schema: 1, engine: 1, table: 1 },
    },
  });
  const created = service.access.create("priya", {
    docId: DOC,
    kind: "script",
    home: `${HOME.kind}:${HOME.id}`,
  });
  expect(created.ok).toBe(true);
  storage.directory.setRole(DOC, "sam", "edit", []);

  const v2 = { protocol: PROTOCOL_VERSION, schema: 1, engine: 2, table: 1 };
  const v1 = { protocol: PROTOCOL_VERSION, schema: 1, engine: 1, table: 1 };
  const priya = fakePeer({ userId: "priya", name: "Priya", versions: v2 });
  const samOld = fakePeer({ userId: "sam", name: "Sam", versions: v1 });
  service.attach(priya);
  service.attach(samOld);

  // Priya (engine 2) subscribes and raises script.engineVersion to 2
  service.receive(priya, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 0,
    mode: "edit",
    lastServerSeq: 0,
    clientIds: [11],
  });
  priya.take();
  service.receive(priya, {
    type: "SET",
    docId: DOC,
    ...setOf(1, "script.engineVersion", 2),
  });
  fc.runDeferred();
  expect(storage.open(HOME).log.get(DOC)?.engineVersion).toBe(2);

  // Sam (engine 1) requesting edit after the raise is refused with too_old by gateDocument, and can open read-only (view)
  service.receive(samOld, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 0,
    mode: "edit",
    lastServerSeq: 0,
    clientIds: [22],
  });
  const refusedEdit = samOld.take().find((m) => m.type === "ERROR");
  expect(refusedEdit).toMatchObject({
    type: "ERROR",
    code: CODE.TOO_OLD,
    message: "too_old",
  });
  service.receive(samOld, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 0,
    mode: "view",
    lastServerSeq: 0,
    clientIds: [],
  });
  const samView = samOld.take().find((m) => m.type === "SUBSCRIBED");
  expect(samView).toMatchObject({
    type: "SUBSCRIBED",
    docId: DOC,
    engineVersion: 2,
  });

  // Priya rolls script.engineVersion back to 1 -> Sam (engine 1) subscribing in edit mode succeeds again
  service.receive(priya, {
    type: "SET",
    docId: DOC,
    ...setOf(2, "script.engineVersion", 1),
  });
  fc.runDeferred();
  expect(storage.open(HOME).log.get(DOC)?.engineVersion).toBe(1);

  const samAgain = fakePeer({ userId: "sam", name: "Sam", versions: v1 });
  service.attach(samAgain);
  service.receive(samAgain, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 0,
    mode: "edit",
    lastServerSeq: 0,
    clientIds: [23],
  });
  const restored = samAgain.take().find((m) => m.type === "SUBSCRIBED");
  expect(restored).toMatchObject({
    type: "SUBSCRIBED",
    docId: DOC,
    role: "edit",
    engineVersion: 1,
  });
});
