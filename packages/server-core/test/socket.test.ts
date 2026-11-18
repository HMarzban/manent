import { afterAll, expect, test } from "bun:test";
import {
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  encodeMessage,
} from "@manent/sync-protocol";
import type {
  Message,
  SignInResponse,
  VersionSet,
  WsTicketResponse,
} from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { createServer } from "../src/index.ts";
import type { Connection, ConnectionData, ManentServer } from "../src/index.ts";
import { HTTP, makeConfig } from "./config.ts";

const ORIGIN = "http://127.0.0.1:4747";
const DOC = "0f3e9a52-7d41-4c8b-9e26-b5a1c0d7e384";
const UNKNOWN_FRAME_TYPE = 28;
const SET_TO_DOC: Message = {
  type: "SET",
  docId: DOC,
  generation: 0,
  clientSeq: 1,
  key: "script.paper",
  value: new TextEncoder().encode('"a4"'),
};

const trees = createTempTrees("manent-socket-");
afterAll(() => trees.removeAll());

const versions = (
  protocol: number,
  schema: number,
  engine: number,
  table: number,
): VersionSet => ({ protocol, schema, engine, table });

const hello = (v: VersionSet): Message => ({
  type: "HELLO",
  versions: v,
  build: "test",
  deviceId: "device-1",
});

const config = makeConfig({ demo: null });
const server = createServer(config);

interface FakeConnection extends Connection {
  sent: Uint8Array[];
  closed: [number, string] | null;
}

function fakeConnection(data: ConnectionData): FakeConnection {
  const connection: FakeConnection = {
    data,
    bufferedBytes: 0,
    sent: [],
    closed: null,
    send(frame) {
      connection.sent.push(frame);
      return "sent";
    },
    close(code, reason) {
      connection.closed = [code, reason];
    },
  };
  return connection;
}

/** A GET whose transport records each upgrade it is asked for and answers `upgraded`. */
async function request(
  url: string,
  headers: Record<string, string>,
  options: { upgraded: boolean; on?: ManentServer },
): Promise<{ response: Response | null; upgrades: ConnectionData[] }> {
  const upgrades: ConnectionData[] = [];
  const response = await (options.on ?? server).fetch(
    new Request(url, { headers }),
    {
      remoteAddress: "127.0.0.1",
      upgrade(data) {
        upgrades.push(data);
        return options.upgraded;
      },
    },
  );
  return { response, upgrades };
}

async function answer(
  path: string,
  init: RequestInit,
): Promise<[number, unknown]> {
  const response = await server.fetch(
    new Request(`http://127.0.0.1:4747${path}`, init),
    { remoteAddress: "127.0.0.1", upgrade: () => false },
  );
  if (response === null) throw new TypeError(`${path} was upgraded`);
  return [response.status, await response.json()];
}

async function ticketFor(userId: string): Promise<string> {
  const [, signIn] = await answer("/api/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  const [, issued] = await answer("/api/ws-ticket", {
    method: "POST",
    headers: { Authorization: `Bearer ${(signIn as SignInResponse).token}` },
  });
  return (issued as WsTicketResponse).ticket;
}

async function opened(ticket: string | null): Promise<FakeConnection> {
  const query = ticket === null ? "" : `?ticket=${ticket}`;
  const { response, upgrades } = await request(
    `http://127.0.0.1:4747/ws${query}`,
    { Origin: ORIGIN },
    { upgraded: true },
  );
  expect([response, upgrades.length]).toEqual([null, 1]);
  const connection = fakeConnection(upgrades[0]!);
  server.connections.open(connection);
  return connection;
}

function received(connection: FakeConnection): Message[] {
  const decoder = createFrameDecoder({ from: "server" });
  return connection.sent.flatMap((frame) => {
    const result = decoder.push(frame);
    return result.kind === "message" ? [result.message] : [];
  });
}

const closedWith = (connection: FakeConnection) => connection.closed;

async function welcomed(userId: string): Promise<FakeConnection> {
  const connection = await opened(await ticketFor(userId));
  server.connections.message(
    connection,
    encodeMessage(hello(versions(1, 1, 0, 0))),
  );
  expect(received(connection).map((m) => m.type)).toEqual(["WELCOME"]);
  return connection;
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a);
  out.set(b, a.byteLength);
  return out;
};

/** A copy of `frame` whose type is one this build does not know. */
const asUnknownType = (frame: Uint8Array): Uint8Array => {
  const copy = new Uint8Array(frame);
  copy[0] = UNKNOWN_FRAME_TYPE;
  return copy;
};

test("a ticket is issued to a signed-in person only", async () => {
  const [, signIn] = await answer("/api/sign-in", {
    method: "POST",
    body: JSON.stringify({ userId: "leo" }),
  });
  const [status, body] = await answer("/api/ws-ticket", {
    method: "POST",
    headers: { Authorization: `Bearer ${(signIn as SignInResponse).token}` },
  });
  expect([status, body]).toEqual([
    200,
    {
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresInMs: 30000,
    },
  ]);
  const withoutSession: Record<string, string>[] = [
    {},
    { Authorization: "Bearer nonsense" },
  ];
  for (const headers of withoutSession)
    expect(await answer("/api/ws-ticket", { method: "POST", headers })).toEqual(
      [401, { error: "unauthenticated" }],
    );
});

test("a ticket opens one socket; HELLO is answered by WELCOME", async () => {
  const c = await opened(await ticketFor("leo"));
  server.connections.message(c, encodeMessage(hello(versions(1, 1, 0, 0))));
  expect(received(c)).toEqual([
    {
      type: "WELCOME",
      session: { userId: "leo", name: "Leo Marsh" },
      limits: {
        frameBytes: FRAME_LIMIT_BYTES,
        messageBytes: MESSAGE_LIMIT_BYTES,
      },
      server: config.socket.versions,
    },
  ]);
  server.connections.message(c, encodeMessage({ type: "PING", nonce: 7 }));
  expect(received(c).at(-1)).toEqual({ type: "PONG", nonce: 7 });
});

test("a used or unknown ticket closes with 4401", async () => {
  const ticket = await ticketFor("leo");
  const first = await opened(ticket);
  const used = await opened(ticket);
  const unknown = await opened("nonsense");
  const missing = await opened(null);
  const refused: [number, string] = [4401, "unauthenticated"];
  expect([first, used, unknown, missing].map(closedWith)).toEqual([
    null,
    refused,
    refused,
    refused,
  ]);
  expect(received(used)).toEqual([]);
});

test("a foreign or missing origin is refused before the upgrade", async () => {
  const foreign: Record<string, string>[] = [
    { Origin: "http://evil.example" },
    {},
  ];
  for (const headers of foreign) {
    const { response, upgrades } = await request(
      "http://127.0.0.1:4747/ws?ticket=t",
      headers,
      { upgraded: true },
    );
    expect([response?.status, await response?.json(), upgrades]).toEqual([
      403,
      { error: "forbidden_origin" },
      [],
    ]);
  }
});

test("/ws is never the web app", async () => {
  const webDir = await trees.tree({
    "index.html": "<!doctype html><title>app</title>",
  });
  const { response } = await request(
    "http://127.0.0.1:4747/ws",
    { Origin: ORIGIN },
    {
      upgraded: false,
      on: createServer(makeConfig({ demo: null, http: { ...HTTP, webDir } })),
    },
  );
  expect([response?.status, await response?.json()]).toEqual([
    400,
    { error: "bad_request" },
  ]);
});

const pushOf = (updateBytes: number): Message => ({
  type: "PUSH",
  docId: DOC,
  generation: 0,
  clientSeq: 1,
  update: new Uint8Array(updateBytes),
  heal: false,
});

/** `message` as the chunks a client with this frame limit sends. */
const chunksOf = (
  message: Message,
  frameLimitBytes: number,
  ids = createMessageIds(),
): Uint8Array[] => createFrameEncoder({ ids, frameLimitBytes }).encode(message);

test("a stranger cannot send a large frame", async () => {
  const early = await opened(await ticketFor("leo"));
  server.connections.message(early, new Uint8Array(100 * 1024));
  expect(closedWith(early)).toEqual([4413, "too_large"]);
  // nor a large message in smaller chunks, nor two chunked messages at once
  const long = await opened(await ticketFor("leo"));
  for (const chunk of chunksOf(pushOf(100 * 1024), 60 * 1024))
    server.connections.message(long, chunk);
  const two = await opened(await ticketFor("leo"));
  const ids = createMessageIds();
  for (const message of [pushOf(100), pushOf(100)])
    server.connections.message(two, chunksOf(message, 64, ids)[0]!);
  expect([long, two].map(closedWith)).toEqual([
    [4413, "too_large"],
    [4413, "too_large"],
  ]);
  const c = await welcomed("leo");
  // after the handshake an unknown frame of that size is skipped; its zero bytes read as a
  // document, so the skip is answered for that document
  server.connections.message(
    c,
    concat(new Uint8Array([UNKNOWN_FRAME_TYPE, 0]), new Uint8Array(100 * 1024)),
  );
  server.connections.message(c, encodeMessage({ type: "PING", nonce: 3 }));
  expect(received(c).slice(-2)).toMatchObject([
    { type: "ERROR", code: 4400, message: "unknown_frame" },
    { type: "PONG", nonce: 3 },
  ]);
  expect(closedWith(c)).toBeNull();
  expect(server.connections.maxFrameBytes).toBe(FRAME_LIMIT_BYTES);
});

test("a closed connection keeps nothing", async () => {
  const c = await welcomed("leo");
  const chunks = chunksOf(pushOf(60), 64);
  expect(chunks).toHaveLength(2);
  server.connections.message(c, chunks[0]!);
  expect(received(c)).toHaveLength(1);
  server.connections.close(c);
  server.connections.message(c, chunks[1]!);
  server.connections.message(c, encodeMessage({ type: "PING", nonce: 1 }));
  expect(received(c)).toHaveLength(1);
});

test("a client below the minimum closes with 4408", async () => {
  const c = await opened(await ticketFor("leo"));
  server.connections.message(c, encodeMessage(hello(versions(0, 1, 0, 0))));
  expect(closedWith(c)).toEqual([4408, "too_old"]);
  expect(received(c)).toEqual([]);
});

test("anything that is not a valid first frame closes with 4400", async () => {
  const text = await opened(await ticketFor("leo"));
  server.connections.message(text, "HELLO");
  const ping = await opened(await ticketFor("leo"));
  server.connections.message(ping, encodeMessage({ type: "PING", nonce: 1 }));
  const again = await welcomed("leo");
  server.connections.message(again, encodeMessage(hello(versions(1, 1, 0, 0))));
  const cut = await opened(await ticketFor("leo"));
  server.connections.message(
    cut,
    encodeMessage(hello(versions(1, 1, 0, 0))).subarray(0, 4),
  );
  const bad: [number, string] = [4400, "bad_frame"];
  expect([text, ping, again, cut].map(closedWith)).toEqual([
    bad,
    bad,
    bad,
    bad,
  ]);
});

test("a frame from a newer client is skipped and the socket stays open", async () => {
  const early = await opened(await ticketFor("leo"));
  server.connections.message(early, asUnknownType(encodeMessage(SET_TO_DOC)));
  expect([received(early), closedWith(early)]).toEqual([[], null]);
  const c = await welcomed("leo");
  server.connections.message(
    c,
    new Uint8Array([UNKNOWN_FRAME_TYPE, 0, 1, 2, 3]),
  );
  server.connections.message(c, encodeMessage({ type: "PING", nonce: 9 }));
  expect(received(c).slice(1)).toEqual([{ type: "PONG", nonce: 9 }]);
  server.connections.message(c, asUnknownType(encodeMessage(SET_TO_DOC)));
  expect(received(c).at(-1)).toEqual({
    type: "ERROR",
    code: 4400,
    message: "unknown_frame",
    retryAfterMs: null,
    permanent: false,
    clientSeq: null,
    doc: { docId: DOC, generation: 0 },
  });
  expect(closedWith(c)).toBeNull();
});

test("a document frame is answered, not dropped", async () => {
  const c = await welcomed("leo");
  server.connections.message(
    c,
    encodeMessage({
      type: "SUBSCRIBE",
      docId: DOC,
      generation: 0,
      mode: "edit",
      clientIds: [],
      lastServerSeq: 0,
    }),
  );
  server.connections.message(c, encodeMessage(SET_TO_DOC));
  for (const m of received(c).slice(1))
    expect(m).toMatchObject({
      type: "ERROR",
      code: 4403,
      permanent: false,
      clientSeq: null,
      doc: { docId: DOC, generation: 0 },
    });
  expect(received(c)).toHaveLength(3);
  expect(closedWith(c)).toBeNull();
});
