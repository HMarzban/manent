import { expect, test } from "bun:test";
import { createServer } from "../src/index.ts";
import { createFakeDirectory } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { KEY1, key, productionWorld } from "./production-world.ts";
import { DOC } from "./seed.ts";

const PEOPLE = [
  { userId: "priya", name: "Priya Nair" },
  { userId: "dana", name: "Dana Reyes" },
  { userId: "leo", name: "Leo Marsh" },
];

/** The production routes of a server over the world's production service, and a caller for each person. */
async function routes() {
  const w = productionWorld();
  const base = makeConfig();
  const config = {
    ...base,
    auth: {
      ...base.auth,
      directory: createFakeDirectory(
        PEOPLE.map((user) => ({ user, workspaces: [] })),
      ),
    },
    production: w.service,
  };
  const server = createServer(config);
  const tokens = new Map(
    PEOPLE.map(({ userId }) => [userId, config.auth.sessions.issue(userId)]),
  );
  async function call(
    path: string,
    body: string,
    userId = "priya",
  ): Promise<Response> {
    const request = new Request(`http://127.0.0.1:4747${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.get(userId)}` },
      body,
    });
    const response = await w.run(
      server.fetch(request, {
        remoteAddress: "127.0.0.1",
        upgrade: () => false,
      }),
    );
    if (response === null) throw new TypeError("the request was upgraded");
    return response;
  }
  const post = async (
    path: string,
    body: unknown,
    userId?: string,
  ): Promise<[number, unknown]> => {
    const response = await call(path, JSON.stringify(body), userId);
    return [response.status, await response.json()];
  };
  return { w, call, post };
}

function issueIdOf(body: unknown): string {
  if (typeof body !== "object" || body === null || !("issue" in body))
    return "";
  const { issue } = body;
  return typeof issue === "object" && issue !== null && "issueId" in issue
    ? String(issue.issueId)
    : "";
}

const issueBody = (n: number) => ({
  docId: DOC,
  key: key(n),
  expectedOrdinal: 1,
  what: "changed",
  pages: ["12", "12A"],
  files: ["pdf_marked"],
  tint: false,
  recipientUserIds: ["leo"],
  memo: "Blue revisions 16 Nov: pp. 12, 12A",
  issuedOn: "2026-11-16",
});

test("each production route answers its body and its refusals", async () => {
  const { w, call, post } = await routes();
  const lock = {
    docId: DOC,
    key: KEY1,
    numbering: "suffix",
    colourOrder: "standard",
    lockedOn: "2026-10-27",
  };
  const state = await post("/api/production/state", { docId: DOC });
  const locked = await post("/api/production/lock", lock);
  const again = await post("/api/production/lock", { ...lock, key: key(2) });
  await w.editPage(12, 60);
  const issued = await post("/api/production/issue", issueBody(3));
  const late = await post("/api/production/issue", issueBody(4), "dana");
  const file = await call(
    "/api/production/file",
    JSON.stringify({
      docId: DOC,
      issueId: issueIdOf(issued[1]),
      file: "pdf_marked",
    }),
    "leo",
  );
  expect([
    state[0],
    [locked[0], again],
    [issued[0], late],
    [file.status, file.headers.get("content-type")],
  ]).toEqual([
    200,
    [200, [409, { error: "already_locked", issued: null }]],
    [
      200,
      [
        409,
        {
          error: "already_issued",
          issued: {
            name: "Blue",
            byName: "Priya Nair",
            issuedAt: 1_811_808_000_000,
            nextName: "Pink",
          },
        },
      ],
    ],
    [200, "application/pdf"],
  ]);
});

test("a body over the limit or a bad key is a bad request", async () => {
  const { call, post } = await routes();
  const over = await call("/api/production/state", "x".repeat(1_048_577));
  const unlock = await post("/api/production/unlock", { docId: DOC, key: "x" });
  expect([[over.status, await over.json()], unlock]).toEqual([
    [400, { error: "bad_request", issued: null }],
    [400, { error: "bad_request", issued: null }],
  ]);
});
