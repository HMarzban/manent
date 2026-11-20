import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createDoc, scriptBody } from "@manent/crdt";
import { openSqliteStorage } from "@manent/storage";
import type { Transport } from "@manent/sync-client";
import { createFrameDecoder, encodeMessage } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { createTempTrees, startTestServer } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import { bunTransport } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const KEY = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const KEY2 = "0f1e2d3c4b5a69788796a5b4c3d2e1f1";
const TIMEOUT = { timeout: 30_000 };
// high enough that the cloud lets the client in, whatever its own versions
const NEWER = { protocol: 99, schema: 99, engine: 99, table: 99 };

const trees = createTempTrees("manent-transport-");
let cloud: TestServer;

beforeAll(async () => {
  cloud = await startTestServer({ dataDir: await trees.tree({}) });
  await cloud.createDocument("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
}, 30_000);

afterAll(async () => {
  await cloud.stop();
  await trees.removeAll();
});

/** Bun's WebSocket with the Origin header a browser would send; the DOM's type does not declare its headers. */
function socket(url: string, origin: string): WebSocket {
  const made: unknown = Reflect.construct(WebSocket, [
    url,
    { headers: { Origin: origin } },
  ]);
  if (!(made instanceof WebSocket)) throw new TypeError(`no socket for ${url}`);
  return made;
}

function transportOf(
  baseUrl: string,
  token: string | null,
  send: typeof fetch = fetch,
): Transport {
  return bunTransport({ baseUrl, token: () => token, fetch: send, socket });
}

/** A port nothing listens on: listened on and closed again. */
function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** What a client sends to say who it is. */
const hello = (): Message => ({
  type: "HELLO",
  versions: NEWER,
  build: "test",
  deviceId: "node-1",
});

/** One block of action holding `text`, as the update that writes it. */
function typing(text: string): Uint8Array {
  const doc = createDoc();
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: "b000000000000001", type: "action" },
        content: [{ type: "text", text }],
      },
    ]),
  );
  return doc.encodeState();
}

test(
  "the node reaches the cloud the way a browser does",
  async () => {
    const token = await cloud.token("sam");
    const t = transportOf(cloud.url, token);
    const decoder = createFrameDecoder({ from: "server" });
    const first = Promise.withResolvers<Message>();
    const c = await t.connect({
      onFrame(frame) {
        const read = decoder.push(frame);
        if (read.kind === "message") first.resolve(read.message);
      },
      onClose: () => {},
    });
    c.send(encodeMessage(hello()));
    expect((await first.promise).type).toBe("WELCOME");
    c.close(1000, "done");
  },
  TIMEOUT,
);

test("with nobody signed in the cloud is never asked", async () => {
  let asked = 0;
  const spy: typeof fetch = Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      asked += 1;
      return fetch(input, init);
    },
    { preconnect: fetch.preconnect },
  );
  const t = transportOf(cloud.url, null, spy);
  const handlers = { onFrame: () => {}, onClose: () => {} };
  await expect(t.connect(handlers)).rejects.toMatchObject({ code: "sign_in" });
  const request = {
    docId: DOC,
    kind: "script",
    home: "user",
    workspaceId: null,
  };
  await expect(t.createDocument(request)).rejects.toMatchObject({
    code: "sign_in",
  });
  expect(asked).toBe(0);
});

test("a session the cloud refused asks for sign-in again", async () => {
  const t = transportOf(cloud.url, "a-session-the-cloud-never-issued");
  const handlers = { onFrame: () => {}, onClose: () => {} };
  await expect(t.connect(handlers)).rejects.toMatchObject({ code: "sign_in" });
});

test(
  "a cloud that is down reads as unreachable",
  async () => {
    const t = transportOf(`http://127.0.0.1:${freePort()}`, "a-token");
    const handlers = { onFrame: () => {}, onClose: () => {} };
    await expect(t.connect(handlers)).rejects.toMatchObject({
      code: "unreachable",
    });
  },
  TIMEOUT,
);

test(
  "a replay reaches the cloud and its refusal comes back as its code",
  async () => {
    const request = {
      docId: DOC,
      generation: 1,
      lastServerSeq: 0,
      key: KEY,
      updates: [typing("Rain on the glass.")],
    };
    const current = transportOf(cloud.url, await cloud.token("sam"));
    expect(await current.replay(request)).toEqual({
      ok: false,
      code: "generation_current",
    });
    // the cloud moves the script to a new generation while it is stopped
    await cloud.stop();
    const storage = openSqliteStorage({
      dir: join(cloud.dataDir, "data"),
      now: Date.now,
    });
    const file = storage.open({ kind: "project", id: PROJECT });
    const row = file.log.get(DOC)!;
    file.generations.freeze({
      docId: DOC,
      finalSeq: row.headSeq,
      finalState: createDoc().encodeState(),
      frozenAt: Date.now(),
      purgeAfter: Date.now() + 86_400_000,
      reason: "rebuild",
      initialUpdate: createDoc().encodeState(),
      rebuiltByClientId: 77,
      userId: "system",
    });
    storage.close();
    await cloud.start();
    const frozen = transportOf(cloud.url, await cloud.token("sam"));
    expect(await frozen.replay({ ...request, key: KEY2 })).toEqual({
      ok: true,
      response: {
        docId: DOC,
        generation: 2,
        serverSeq: 2,
        applied: 1,
        overlaps: [],
        setAside: [],
      },
    });
  },
  TIMEOUT,
);
