import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import {
  OWNER_CAPABILITIES,
  createServer,
  createSignedSessionStore,
  createTicketStore,
} from "@manent/server-core";
import type { ManentServer } from "@manent/server-core";
import {
  createFakeDirectory,
  createFakeSignIn,
  fakeClock,
} from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type { AdoptRequest } from "@manent/sync-protocol";
import { httpCloudApi } from "../src/index.ts";
import { createFakeCloud } from "../src/testing/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const HOME = `project:${PROJECT}`;
const KEY = "0193b1f4-2c1e-7a00-8000-00000000000a";
const BASE = "http://cloud.example";
const PEOPLE = [
  { userId: "sam", name: "Sam Okafor" },
  { userId: "leo", name: "Leo Marsh" },
];
const V = { protocol: 1, schema: 1, engine: 0, table: 0 };

/** A cloud over memory storage that answers to `host`. */
function cloudServer(host: string): ManentServer {
  const time = fakeClock();
  let versionIds = 0;
  return createServer({
    http: { allowedHosts: [host], openUrl: `http://${host}`, webDir: null },
    auth: {
      signIn: createFakeSignIn(PEOPLE),
      directory: createFakeDirectory(
        PEOPLE.map((user) => ({ user, workspaces: [] })),
      ),
      sessions: createSignedSessionStore({
        secret: new Uint8Array(32).fill(5),
        now: () => 1_700_000_000_000,
      }),
    },
    demo: { seedId: () => "seed-1", control: null, controls: null },
    socket: {
      tickets: createTicketStore({ now: () => 0 }),
      versions: { current: V, min: V },
      allowedOrigins: [`http://${host}`],
    },
    sync: {
      storage: createMemoryStorage({ now: () => 1_000 }),
      clock: time.clock,
      defer: time.defer,
      ids: () => `version-${++versionIds}`,
    },
  });
}

/** `server.fetch` as the global fetch, as a socket would carry it. */
function shim(server: ManentServer): typeof fetch {
  const reach = async (input: string | URL | Request, init?: RequestInit) => {
    const answer = await server.fetch(new Request(input, init), {
      remoteAddress: "127.0.0.1",
      upgrade: () => false,
    });
    if (answer === null) throw new TypeError("upgraded");
    return answer;
  };
  return Object.assign(reach, { preconnect: () => {} });
}

/** A script holding one scene, as the update that writes it, in base64. */
function scene(): string {
  const doc = createDoc({ clientId: 6006 });
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: "b000000000000001", type: "scene_heading" },
        content: [{ type: "text", text: "INT. LAMP ROOM - NIGHT" }],
      },
    ]),
  );
  return doc.encodeState().toBase64();
}

const ADOPT: AdoptRequest = {
  key: KEY,
  docId: DOC,
  kind: "script",
  home: HOME,
  workspaceId: null,
  state: scene(),
  versions: [],
  production: null,
};

test("the cloud's answers come back typed, and a refusal as its code", async () => {
  const api = httpCloudApi({
    baseUrl: BASE,
    fetch: shim(cloudServer("cloud.example")),
  });
  const sam = await api.signIn("sam");
  if (!sam.ok) throw new Error("sam was not signed in");
  expect(await api.signIn("mallory")).toEqual({
    ok: false,
    code: "unknown_user",
  });
  expect(await api.adopt(sam.token, ADOPT)).toEqual({
    ok: true,
    body: {
      docId: DOC,
      kind: "script",
      home: HOME,
      generation: 1,
      adoptedSeq: 1,
      created: true,
    },
  });
  expect(await api.adopt(sam.token, { ...ADOPT, key: "not-a-key" })).toEqual({
    ok: false,
    code: "bad_request",
  });
  const leo = await api.signIn("leo");
  if (!leo.ok) throw new Error("leo was not signed in");
  expect(await api.describe(leo.token, { docId: DOC })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await api.describe(sam.token, { docId: DOC })).toEqual({
    ok: true,
    body: {
      docId: DOC,
      kind: "script",
      home: HOME,
      generation: 1,
      role: "owner",
      capabilities: [...OWNER_CAPABILITIES],
    },
  });
  expect(await api.demo()).toEqual({ seedId: "seed-1" });
});

test("a cloud nobody can reach rejects every call as unreachable", async () => {
  const cloud = createFakeCloud({ server: cloudServer("127.0.0.1") });
  cloud.down(true);
  await expect(cloud.signIn("sam")).rejects.toMatchObject({
    code: "unreachable",
  });
  await expect(cloud.demo()).rejects.toMatchObject({ code: "unreachable" });
  cloud.down(false);
  expect(await cloud.demo()).toEqual({ seedId: "seed-1" });
});

test("a call lost before the cloud saw it changes nothing, one lost after it was done changes it once", async () => {
  const cloud = createFakeCloud({ server: cloudServer("127.0.0.1") });
  const sam = await cloud.signIn("sam");
  if (!sam.ok) throw new Error("sam was not signed in");
  cloud.drop("request");
  await expect(cloud.adopt(sam.token, ADOPT)).rejects.toMatchObject({
    code: "unreachable",
  });
  expect(await cloud.describe(sam.token, { docId: DOC })).toEqual({
    ok: false,
    code: "forbidden",
  });
  cloud.drop("response");
  await expect(cloud.adopt(sam.token, ADOPT)).rejects.toMatchObject({
    code: "unreachable",
  });
  expect(await cloud.adopt(sam.token, ADOPT)).toMatchObject({
    ok: true,
    body: { adoptedSeq: 1, created: false },
  });
});
