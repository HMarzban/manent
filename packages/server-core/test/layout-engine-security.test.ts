// Security regression tests for layout engine pin & guarded layout settings:
// 1. Unknown/uncarried script.engineVersion rejected as bad_value; carried rollback (2 -> 1) accepted while unlocked.
// 2. Locked scripts refuse SET of script.engineVersion and script.linesPerPage (4423 locked), while unguarded script.sceneNumbers succeeds.
// 3. POST /api/production/layout refuses script.engineVersion (400 bad_request).
import { expect, test } from "bun:test";
import { scriptSettings } from "@manent/crdt";
import { PRODUCT_SETTING_RULES, createServer } from "../src/index.ts";
import { createFakeDirectory } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { KEY1, key, productionWorld } from "./production-world.ts";
import { DOC } from "./seed.ts";
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
});
