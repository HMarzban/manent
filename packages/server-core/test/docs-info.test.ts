import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { createServer } from "../src/index.ts";
import type { ManentServer } from "../src/index.ts";
import { createFakeDirectory } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { DOC, DOC2, HOME, placeScript } from "./seed.ts";

const SAM = { userId: "sam", name: "Sam Okafor" };
const DANA = { userId: "dana", name: "Dana Reyes" };
const LEO = { userId: "leo", name: "Leo Marsh" };

/** DOC is Sam's, Dana may edit it, Leo holds no role; Sam's client is 7 and Dana's 3. */
function serverWith(storage: MemoryStorage | null): {
  server: ManentServer;
  tokenOf(userId: string): string;
} {
  if (storage !== null) {
    placeScript(storage);
    storage.directory.setRole(DOC, "dana", "edit", []);
    const { log } = storage.open(HOME);
    log.registerClients(DOC, "sam", [7]);
    log.registerClients(DOC, "dana", [3]);
  }
  const base = makeConfig();
  const auth = {
    ...base.auth,
    directory: createFakeDirectory(
      [SAM, DANA, LEO].map((user) => ({ user, workspaces: [] })),
    ),
  };
  const sync = storage === null ? null : { storage };
  return {
    server: createServer(makeConfig({ auth, sync })),
    tokenOf: (userId) => auth.sessions.issue(userId),
  };
}

async function post(
  server: ManentServer,
  path: string,
  body: unknown,
  token: string | null,
): Promise<[number, unknown]> {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };
  const response = await server.fetch(
    new Request(`http://127.0.0.1:4747${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { remoteAddress: "127.0.0.1", upgrade: () => false },
  );
  if (response === null) throw new TypeError(`${path} was upgraded`);
  return [response.status, await response.json()];
}

test("the authors of client ids are named for someone who may open the script", async () => {
  const { server, tokenOf } = serverWith(
    createMemoryStorage({ now: () => 1_000 }),
  );
  const ask = (body: unknown, userId: string | null = "dana") =>
    post(
      server,
      "/api/docs/clients",
      body,
      userId === null ? null : tokenOf(userId),
    );
  const both = {
    clients: [
      { clientId: 3, userId: "dana", name: "Dana Reyes" },
      { clientId: 7, userId: "sam", name: "Sam Okafor" },
    ],
  };
  expect(await ask({ docId: DOC, clientIds: [9, 7, 3, 7] })).toEqual([
    200,
    both,
  ]);
  expect(await ask({ docId: DOC, clientIds: [7] }, "leo")).toEqual([
    403,
    { error: "forbidden" },
  ]);
  expect(await ask({ docId: DOC, clientIds: [7] }, null)).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  const tooMany = Array.from({ length: 65 }, (_, i) => i);
  for (const body of [
    null,
    [DOC],
    { docId: "NOT-A-UUID", clientIds: [7] },
    { docId: DOC },
    { docId: DOC, clientIds: tooMany },
    { docId: DOC, clientIds: [-1] },
    { docId: DOC, clientIds: [1.5] },
    { docId: DOC, clientIds: [2 ** 32] },
    { docId: DOC, clientIds: ["7"] },
  ])
    expect(await ask(body)).toEqual([400, { error: "bad_request" }]);
  expect(await ask({ docId: DOC, clientIds: tooMany.slice(1) })).toEqual([
    200,
    both,
  ]);
  expect(await ask({ docId: DOC2, clientIds: [7] })).toEqual([
    404,
    { error: "not_found" },
  ]);
});

test("who deleted a script and when is told to the people who had it", async () => {
  const storage = createMemoryStorage({ now: () => 1_000 });
  const { server, tokenOf } = serverWith(storage);
  const ask = (body: unknown, userId: string | null = "sam") =>
    post(
      server,
      "/api/docs/removed",
      body,
      userId === null ? null : tokenOf(userId),
    );
  expect(await ask({ docId: DOC })).toEqual([404, { error: "not_found" }]);
  storage.directory.tombstone(DOC, "dana");
  expect(await ask({ docId: DOC })).toEqual([
    200,
    { deletedByUserId: "dana", deletedByName: "Dana Reyes", deletedAt: 1_000 },
  ]);
  expect(await ask({ docId: DOC }, "leo")).toEqual([
    403,
    { error: "forbidden" },
  ]);
  expect(await ask({ docId: DOC }, null)).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  for (const body of [null, {}, { docId: "NOT-A-UUID" }])
    expect(await ask(body)).toEqual([400, { error: "bad_request" }]);
});

test("without sync configured the authors and removal routes answer not_found", async () => {
  const { server, tokenOf } = serverWith(null);
  for (const [path, body] of [
    ["/api/docs/clients", { docId: DOC, clientIds: [7] }],
    ["/api/docs/removed", { docId: DOC }],
  ] as const)
    expect(await post(server, path, body, tokenOf("sam"))).toEqual([
      404,
      { error: "not_found" },
    ]);
});
