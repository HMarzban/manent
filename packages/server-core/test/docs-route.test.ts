import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  indexDocId,
  prepareMessage,
  workspaceHome,
} from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { createServer } from "../src/index.ts";
import type { ManentServer } from "../src/index.ts";
import {
  createFakeDirectory,
  fakeClock,
  fakePeer,
} from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const HOME = `project:${PROJECT}`;
const SAM = { userId: "sam", name: "Sam Okafor" };
const LEO = { userId: "leo", name: "Leo Marsh" };

function serverWith(
  sync: { storage: ReturnType<typeof createMemoryStorage> } | null,
): {
  server: ManentServer;
  tokenOf(userId: string): string;
} {
  const base = makeConfig();
  const auth = {
    ...base.auth,
    directory: createFakeDirectory([
      { user: SAM, workspaces: [] },
      { user: LEO, workspaces: [] },
    ]),
  };
  return {
    server: createServer(makeConfig({ auth, sync })),
    tokenOf: (userId) => auth.sessions.issue(userId),
  };
}

async function post(
  server: ManentServer,
  path: string,
  body: string,
  token: string | null,
): Promise<[number, unknown]> {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };
  const response = await server.fetch(
    new Request(`http://127.0.0.1:4747${path}`, {
      method: "POST",
      headers,
      body,
    }),
    { remoteAddress: "127.0.0.1", upgrade: () => false },
  );
  if (response === null) throw new TypeError(`${path} was upgraded`);
  return [response.status, await response.json()];
}

test("the two routes answer as their table says", async () => {
  const { server, tokenOf } = serverWith({
    storage: createMemoryStorage({ now: () => 1_000 }),
  });
  const [sam, leo] = [tokenOf("sam"), tokenOf("leo")];
  const create = (body: unknown, token: string | null = sam) =>
    post(server, "/api/docs", JSON.stringify(body), token);
  const script = { docId: DOC, kind: "script", home: HOME };
  expect(await create(script)).toEqual([
    200,
    { docId: DOC, kind: "script", home: HOME, generation: 1, created: true },
  ]);
  expect(await create(script, null)).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  expect(await post(server, "/api/docs", "{not json", sam)).toEqual([
    400,
    { error: "bad_request" },
  ]);
  expect(await create({ ...script, kind: "draft" })).toEqual([
    400,
    { error: "unsupported_kind" },
  ]);
  expect(await create({ ...script, docId: DOC2 }, leo)).toEqual([
    403,
    { error: "forbidden" },
  ]);
  expect(await create({ ...script, kind: "ink" })).toEqual([
    409,
    { error: "exists_elsewhere" },
  ]);
  const remove = (docId: string) =>
    post(server, "/api/docs/remove", JSON.stringify({ docId }), sam);
  expect(await remove(DOC)).toEqual([200, { removed: true }]);
  expect(await create(script)).toEqual([410, { error: "deleted" }]);
  expect(await remove(DOC2)).toEqual([404, { error: "not_found" }]);
});

test("the create route passes the workspace on and refuses a malformed one", async () => {
  const storage = createMemoryStorage({ now: () => 1_000 });
  const { server, tokenOf } = serverWith({ storage });
  const create = (body: unknown) =>
    post(server, "/api/docs", JSON.stringify(body), tokenOf("sam"));
  const index = indexDocId("workspace", "medium");
  await create({ docId: index, kind: "index", home: workspaceHome("medium") });
  storage.directory.setRole(index, "leo", "comment", []);
  const script = { docId: DOC, kind: "script", home: HOME };
  expect(await create({ ...script, workspaceId: "medium" })).toEqual([
    200,
    { docId: DOC, kind: "script", home: HOME, generation: 1, created: true },
  ]);
  expect(storage.directory.roleOf(DOC, "leo")).toEqual({
    role: "comment",
    capabilities: [],
  });
  expect(
    await create({ ...script, docId: DOC2, workspaceId: "bad id!" }),
  ).toEqual([400, { error: "bad_request" }]);
  expect(await create({ ...script, docId: DOC2 })).toEqual([
    200,
    { docId: DOC2, kind: "script", home: HOME, generation: 1, created: true },
  ]);
  expect(storage.directory.roleOf(DOC2, "leo")).toBeNull();
});

test("without sync configured the routes answer not_found", async () => {
  const { server, tokenOf } = serverWith(null);
  const body = JSON.stringify({ docId: DOC, kind: "script", home: HOME });
  for (const path of ["/api/docs", "/api/docs/remove"])
    expect(await post(server, path, body, tokenOf("sam"))).toEqual([
      404,
      { error: "not_found" },
    ]);
});

test("the fakes behave like a connection and a clock", () => {
  const peer = fakePeer();
  const m: Message = {
    type: "ACK",
    docId: DOC,
    generation: 1,
    clientSeq: 3,
    serverSeq: 9,
  };
  peer.send(m);
  expect(peer.take()).toEqual([m]);
  expect(peer.take()).toEqual([]);
  peer.send(prepareMessage(m));
  expect(peer.take()).toEqual([m]);
  expect(peer.closed()).toBeNull();
  peer.close(4401, "x");
  expect(peer.closed()).toEqual({ code: 4401, reason: "x" });
  expect([
    peer.userId,
    peer.name,
    peer.deviceId,
    peer.versions,
    peer.address,
  ]).toEqual([
    "sam",
    "Sam Okafor",
    "device-1",
    { protocol: 1, schema: 1, engine: 0, table: 0 },
    "127.0.0.1",
  ]);

  const time = fakeClock(100);
  const ran: string[] = [];
  time.clock.schedule(() => ran.push(`twenty at ${time.clock.now()}`), 20);
  const cancelled = time.clock.schedule(() => ran.push("cancelled"), 5);
  time.clock.schedule(() => ran.push(`ten at ${time.clock.now()}`), 10);
  cancelled();
  time.advance(15);
  expect([ran, time.clock.now()]).toEqual([["ten at 110"], 115]);
  time.defer(() => {
    ran.push("a");
    time.defer(() => ran.push("b"));
  });
  expect(ran).toEqual(["ten at 110"]);
  time.runDeferred();
  expect(ran).toEqual(["ten at 110", "a", "b"]);
});
