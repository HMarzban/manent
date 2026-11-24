import { expect, test } from "bun:test";
import {
  ORIGIN_LOAD,
  createDoc,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocFile, Home } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  commentsDocId,
  indexDocId,
  workspaceHome,
} from "@manent/sync-protocol";
import type { IssueRequest } from "@manent/sync-protocol";
import {
  OWNER_CAPABILITIES,
  adoptedWorkflowOf,
  createServer,
  itemOf,
  productionState,
} from "../src/index.ts";
import { createFakeDirectory } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { productionWorld, valueOf } from "./production-world.ts";
import { rawEdit } from "./seed.ts";
import type { ElementNode } from "./seed.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const HOME = `project:${PROJECT}`;
const HOME_OBJ: Home = { kind: "project", id: PROJECT };
const KEY = "0193b1f4-2c1e-7a00-8000-00000000000a";
const KEY2 = "0193b1f4-2c1e-7a00-8000-00000000000b";
const B1 = "b000000000000001";
const YOU_CLIENT = 6006;
const ADOPT_BODY_LIMIT_BYTES = 96 * 1024 * 1024;

const people = ["you", "sam", "dana", "leo", "priya"].map((userId) => ({
  user: { userId, name: userId },
  workspaces: [],
}));

/** The server over memory storage, the storage, and a token for each person. */
function adopting() {
  const storage = createMemoryStorage({ now: () => 1_000 });
  const base = makeConfig();
  const auth = { ...base.auth, directory: createFakeDirectory(people) };
  const server = createServer(makeConfig({ auth, sync: { storage } }));
  const tokenOf = (userId: string) => auth.sessions.issue(userId);
  /** POSTs `body` (JSON unless already a string) as the bearer of `token`. */
  async function post(
    path: string,
    body: unknown,
    token: string | null,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const bearer: Record<string, string> =
      token === null ? {} : { Authorization: `Bearer ${token}` };
    const response = await server.fetch(
      new Request(`http://127.0.0.1:4747${path}`, {
        method: "POST",
        headers: { ...bearer, ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    if (response === null) throw new TypeError(`${path} was upgraded`);
    return response;
  }
  return { storage, post, tokenOf, YOU_TOKEN: tokenOf("you") };
}

/** You's device document, holding one scene. */
function youDoc(): CrdtDoc {
  const doc = createDoc({ clientId: YOU_CLIENT });
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: B1, type: "scene_heading" },
        content: [{ type: "text", text: "INT. LAMP ROOM - NIGHT" }],
      },
    ]),
  );
  return doc;
}

const state = (): Uint8Array => youDoc().encodeState();

function stateWithMore(): Uint8Array {
  const doc = youDoc();
  scriptBody(doc).write((w) => w.insertText(B1, 0, "More. "));
  return doc.encodeState();
}

/** The first half of a whole update's bytes. */
const halfAnUpdate = (): Uint8Array =>
  state().subarray(0, Math.floor(state().length / 2));

/** Typing into a block whose creation the state does not hold. */
function dependsOnMissing(): Uint8Array {
  const doc = youDoc();
  const vector = doc.encodeStateVector();
  scriptBody(doc).write((w) => w.insertText(B1, 0, "x"));
  return doc.diff(vector);
}

/** A block holding an image, which the editor never writes. */
function imageInABlock(): Uint8Array {
  const doc = youDoc();
  rawEdit(doc, (body, make) => {
    const section = body.get(0) as ElementNode;
    const block = section.get(0) as ElementNode;
    block.insert(0, [make.element("img")]);
  });
  return doc.encodeState();
}

const base64 = (bytes: Uint8Array): string => bytes.toBase64();

/** The document DOC's log builds. */
function logged(storage: ReturnType<typeof createMemoryStorage>): CrdtDoc {
  const doc = createDoc();
  for (const { update } of storage.open(HOME_OBJ).log.tail(DOC, 1, 0).rows)
    doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

const ok = {
  key: KEY,
  docId: DOC,
  kind: "script",
  home: HOME,
  workspaceId: null,
};

test("a script made on a device is adopted once, whatever the retries", async () => {
  const { storage, post, YOU_TOKEN } = adopting();
  const body = { ...ok, state: base64(state()) };
  const first = await post("/api/docs/adopt", body, YOU_TOKEN);
  expect([first.status, await first.json()]).toEqual([
    200,
    {
      docId: DOC,
      kind: "script",
      home: HOME,
      generation: 1,
      adoptedSeq: 1,
      created: true,
    },
  ]);
  // a retry carries more: it changes nothing
  const again = await post(
    "/api/docs/adopt",
    { ...body, state: base64(stateWithMore()) },
    YOU_TOKEN,
  );
  expect(await again.json()).toEqual({
    docId: DOC,
    kind: "script",
    home: HOME,
    generation: 1,
    adoptedSeq: 1,
    created: false,
  });
  expect(
    storage
      .open(HOME_OBJ)
      .log.tail(DOC, 1, 0)
      .rows.map((r) => [r.seq, r.origin, r.userId]),
  ).toEqual([[1, "import", "you"]]);
  expect(
    [...storage.open(HOME_OBJ).log.ledger(DOC).values()].map((o) => o.userId),
  ).toEqual(["you"]);
});

test("each way an adoption can be wrong has its status and code", async () => {
  const { post, YOU_TOKEN } = adopting();
  const whole = { ...ok, state: base64(state()) };
  const cases: [unknown, string | null, number, string][] = [
    [whole, null, 401, "unauthenticated"],
    ["{not json", YOU_TOKEN, 400, "bad_request"],
    [{ ...whole, key: "x" }, YOU_TOKEN, 400, "bad_request"],
    [{ ...whole, state: "***" }, YOU_TOKEN, 400, "bad_request"],
    [
      { ...whole, state: base64(halfAnUpdate()) },
      YOU_TOKEN,
      400,
      "bad_request",
    ],
    [
      { ...whole, state: base64(dependsOnMissing()) },
      YOU_TOKEN,
      400,
      "bad_request",
    ],
    [{ ...whole, kind: "draft" }, YOU_TOKEN, 400, "unsupported_kind"],
    [{ ...whole, state: base64(imageInABlock()) }, YOU_TOKEN, 422, "invalid"],
  ];
  for (const [body, token, status, code] of cases) {
    const r = await post("/api/docs/adopt", body, token);
    expect([r.status, await r.json()]).toEqual([status, { error: code }]);
  }
});

test("an adoption with another key, or of a document already written, is refused", async () => {
  const { storage, post, YOU_TOKEN } = adopting();
  const whole = { ...ok, state: base64(state()) };
  expect((await post("/api/docs/adopt", whole, YOU_TOKEN)).status).toBe(200);
  const other = await post(
    "/api/docs/adopt",
    { ...whole, key: KEY2 },
    YOU_TOKEN,
  );
  expect([other.status, await other.json()]).toEqual([
    409,
    { error: "exists_elsewhere" },
  ]);
  // a document made through /api/docs and written to since
  const script = { docId: DOC2, kind: "script", home: HOME };
  expect((await post("/api/docs", script, YOU_TOKEN)).status).toBe(200);
  storage.open(HOME_OBJ).log.append({
    docId: DOC2,
    generation: 1,
    update: state(),
    userId: "you",
    origin: "edit",
    clocks: [],
  });
  const written = await post(
    "/api/docs/adopt",
    { ...whole, docId: DOC2 },
    YOU_TOKEN,
  );
  expect([written.status, await written.json()]).toEqual([
    409,
    { error: "exists_elsewhere" },
  ]);
});

test("a script created on the server and never written to is adopted", async () => {
  const { post, tokenOf } = adopting();
  const sam = tokenOf("sam");
  const script = { docId: DOC2, kind: "script", home: HOME };
  expect((await post("/api/docs", script, sam)).status).toBe(200);
  const adopted = await post(
    "/api/docs/adopt",
    { ...ok, docId: DOC2, state: base64(state()) },
    sam,
  );
  expect([adopted.status, await adopted.json()]).toEqual([
    200,
    {
      docId: DOC2,
      kind: "script",
      home: HOME,
      generation: 1,
      adoptedSeq: 1,
      created: true,
    },
  ]);
});

test("a script adopted into a workspace takes that workspace's roles", async () => {
  const { storage, post, YOU_TOKEN } = adopting();
  const index = indexDocId("workspace", "medium");
  const made = await post(
    "/api/docs",
    { docId: index, kind: "index", home: workspaceHome("medium") },
    YOU_TOKEN,
  );
  expect(made.status).toBe(200);
  storage.directory.setRole(index, "dana", "edit", []);
  const adopted = await post(
    "/api/docs/adopt",
    { ...ok, workspaceId: "medium", state: base64(state()) },
    YOU_TOKEN,
  );
  expect(adopted.status).toBe(200);
  expect(storage.directory.roleOf(DOC, "dana")).toEqual({
    role: "edit",
    capabilities: [],
  });
});

test("settings the device wrote as the authority come over with the script", async () => {
  const { storage, post, YOU_TOKEN } = adopting();
  const doc = youDoc();
  scriptSettings(doc).set("paper", "a4", {
    userId: "you",
    setAt: 900,
    replaced: null,
  });
  const adopted = await post(
    "/api/docs/adopt",
    { ...ok, state: base64(doc.encodeState()) },
    YOU_TOKEN,
  );
  expect(adopted.status).toBe(200);
  expect(scriptSettings(logged(storage)).entries()).toEqual({ paper: "a4" });
});

test("describe tells a person what a document is and what they may do", async () => {
  const { post, tokenOf } = adopting();
  const sam = tokenOf("sam");
  const script = { docId: DOC, kind: "script", home: HOME };
  expect((await post("/api/docs", script, sam)).status).toBe(200);
  const described = await post("/api/docs/describe", { docId: DOC }, sam);
  expect([described.status, await described.json()]).toEqual([
    200,
    {
      docId: DOC,
      kind: "script",
      home: HOME,
      generation: 1,
      role: "owner",
      capabilities: [...OWNER_CAPABILITIES],
    },
  ]);
  const leo = await post("/api/docs/describe", { docId: DOC }, tokenOf("leo"));
  expect([leo.status, await leo.json()]).toEqual([403, { error: "forbidden" }]);
  const bad = await post("/api/docs/describe", { docId: "x" }, sam);
  expect([bad.status, await bad.json()]).toEqual([
    400,
    { error: "bad_request" },
  ]);
  await post("/api/docs/remove", { docId: DOC }, sam);
  const removed = await post("/api/docs/describe", { docId: DOC }, sam);
  expect([removed.status, await removed.json()]).toEqual([
    410,
    { error: "deleted" },
  ]);
  const nobody = await post("/api/docs/describe", { docId: DOC }, null);
  expect(nobody.status).toBe(401);
});

test("a body over the limit is refused before it is read whole", async () => {
  const { post, YOU_TOKEN } = adopting();
  const r = await post("/api/docs/adopt", "{}", YOU_TOKEN, {
    "Content-Length": String(ADOPT_BODY_LIMIT_BYTES + 1),
  });
  expect([r.status, await r.json()]).toEqual([413, { error: "too_large" }]);
});

test("without sync configured the two routes answer not_found", async () => {
  const server = createServer(makeConfig());
  for (const path of ["/api/docs/adopt", "/api/docs/describe"]) {
    const response = await server.fetch(
      new Request(`http://127.0.0.1:4747${path}`, {
        method: "POST",
        body: "{}",
      }),
      { remoteAddress: "127.0.0.1", upgrade: () => false },
    );
    expect([response?.status, await response?.json()]).toEqual([
      404,
      { error: "not_found" },
    ]);
  }
});

/** What a script's people see of its production and versions, wherever its log stands. */
function workflowSeen(file: DocFile) {
  const production = productionState(file, DOC, (userId) => userId);
  const versions = file.history
    .page(DOC, null, 500)
    .map((row) => ({ ...itemOf(file, row), position: null }));
  return {
    production: { ...production, headSeq: null },
    versions,
    workflow: adoptedWorkflowOf(file, DOC),
  };
}

test("a script locked and issued on a device keeps its production and versions once adopted", async () => {
  const device = productionWorld();
  await device.lock();
  await device.editPage(12, 60);
  const issue: IssueRequest = {
    docId: DOC,
    key: "0".repeat(31) + "b",
    expectedOrdinal: 1,
    what: "changed",
    pages: ["12", "12A"],
    files: ["pdf_marked"],
    tint: false,
    recipientUserIds: ["sam"],
    memo: "Blue revisions: pp. 12, 12A",
    issuedOn: "2026-11-16",
  };
  valueOf(await device.run(device.service.issue("priya", issue)));
  const { storage, post, tokenOf } = adopting();
  const body = {
    ...ok,
    state: base64(device.replica().encodeState()),
    ...adoptedWorkflowOf(device.file, DOC),
  };
  const response = await post("/api/docs/adopt", body, tokenOf("priya"));
  expect(response.status).toBe(200);
  expect(workflowSeen(storage.open(HOME_OBJ))).toEqual(
    workflowSeen(device.file),
  );
});

test("adopting a comments document requires and forwards scriptDocId", async () => {
  const { storage, post, YOU_TOKEN } = adopting();
  await post("/api/docs/adopt", { ...ok, state: base64(state()) }, YOU_TOKEN);
  const cId = commentsDocId(DOC);
  const commentsState = createDoc({ clientId: YOU_CLIENT }).encodeState();
  const baseComments = {
    key: KEY2,
    docId: cId,
    kind: "comments",
    home: HOME,
    workspaceId: null,
    state: base64(commentsState),
  };
  const withoutScript = await post("/api/docs/adopt", baseComments, YOU_TOKEN);
  expect([withoutScript.status, await withoutScript.json()]).toEqual([
    400,
    { error: "bad_request" },
  ]);
  const withScript = await post(
    "/api/docs/adopt",
    { ...baseComments, scriptDocId: DOC },
    YOU_TOKEN,
  );
  expect([withScript.status, await withScript.json()]).toEqual([
    200,
    {
      docId: cId,
      kind: "comments",
      home: HOME,
      generation: 1,
      adoptedSeq: 1,
      created: true,
    },
  ]);
  expect(storage.directory.placeOf(cId)).toEqual({
    home: HOME_OBJ,
    kind: "comments",
  });
});
