import { expect, test } from "bun:test";
import { createSignedSessionStore } from "@manent/server-core";
import { createFakeClock } from "@manent/sync-client/testing";
import { createShellChannel, localRoutes } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const SAM = { userId: "sam", name: "Sam Okafor" };
const YOU = { userId: "you", name: "You" };
const BASE = "http://127.0.0.1:51234";

test("the node's routes say who is here and pass Sign in to sync on", async () => {
  const records = createMemoryRecords();
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: () => 1_000,
  });
  records.savePerson({
    ...SAM,
    wantsCloud: true,
    cloudToken: null,
    chosenAt: 1,
  });
  records.savePerson({
    ...YOU,
    wantsCloud: false,
    cloudToken: null,
    chosenAt: 2,
  });
  const samToken = sessions.issue("sam");
  const youToken = sessions.issue("you");
  let reachable = false;
  const asked: string[] = [];
  const connections: [string, number][] = [];
  let focused = 0;
  const routes = localRoutes({
    records,
    shell: createShellChannel({
      clock: createFakeClock(0).clock,
      heartbeatMs: 30_000,
    }),
    sessions,
    async signInToSync(userId) {
      asked.push(userId);
      return reachable ? { ok: true } : { ok: false, code: "unreachable" };
    },
    onFocus: () => focused++,
    storeUsage: () => ({ scripts: 14, bytes: 23_000_000 }),
    setConnection: (mode, delayMs) => void connections.push([mode, delayMs]),
  });
  const call = async (
    method: "GET" | "POST",
    path: string,
    init: { token?: string; body?: unknown } = {},
  ): Promise<[number, unknown]> => {
    const headers: Record<string, string> =
      init.token === undefined ? {} : { authorization: `Bearer ${init.token}` };
    const answer = await routes(
      new Request(
        `${BASE}${path}`,
        init.body === undefined
          ? { method, headers }
          : { method, headers, body: JSON.stringify(init.body) },
      ),
    );
    if (answer === null) return [0, null];
    const text = await answer.text();
    return [answer.status, text === "" ? null : JSON.parse(text)];
  };
  expect(await call("GET", "/api/local/person", { token: youToken })).toEqual([
    200,
    { userId: "you", name: "You", cloud: "not_signed_in" },
  ]);
  expect(await call("GET", "/api/local/person", { token: samToken })).toEqual([
    200,
    { userId: "sam", name: "Sam Okafor", cloud: "signed_in" },
  ]);
  expect(
    await call("POST", "/api/local/sign-in-to-sync", { token: youToken }),
  ).toEqual([503, { error: "unreachable" }]);
  reachable = true;
  expect(
    await call("POST", "/api/local/sign-in-to-sync", { token: youToken }),
  ).toEqual([200, { cloud: "signed_in" }]);
  expect(asked).toEqual(["you", "you"]);
  for (const [method, path] of [
    ["GET", "/api/local/person"],
    ["POST", "/api/local/sign-in-to-sync"],
  ] as const) {
    expect(await call(method, path)).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect(await call(method, path, { token: "v1.forged" })).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
    expect(await call(method, path, { token: sessions.issue("leo") })).toEqual([
      401,
      { error: "unauthenticated" },
    ]);
  }
  expect([await call("POST", "/api/local/focus"), focused]).toEqual([
    [204, null],
    1,
  ]);
  expect(await call("GET", "/api/local/storage")).toEqual([
    200,
    { scripts: 14, bytes: 23_000_000 },
  ]);
  expect(
    await call("POST", "/api/local/connection", {
      body: { mode: "slow", delayMs: 800 },
    }),
  ).toEqual([204, null]);
  for (const refused of [
    { mode: "fast" },
    { mode: "slow", delayMs: 10_001 },
    { mode: "online", delayMs: -1 },
    { mode: "offline", delayMs: 1.5 },
    "slow",
  ])
    expect(
      await call("POST", "/api/local/connection", { body: refused }),
    ).toEqual([400, { error: "bad_request" }]);
  expect(connections).toEqual([["slow", 800]]);
  expect(
    await call("POST", "/api/local/shell", {
      body: { v: 1, t: "first_frame" },
    }),
  ).toEqual([204, null]);
  expect(await call("GET", "/api/docs")).toEqual([0, null]);
});
