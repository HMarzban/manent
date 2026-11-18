import { expect, test } from "bun:test";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  encodeMessage,
} from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { createServer } from "../src/index.ts";
import type {
  Connection,
  ConnectionData,
  ManentServer,
  SyncLimits,
} from "../src/index.ts";
import { createFakeDirectory, fakeClock } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { BLOCK, DOC, PROJECT, createTypist } from "./seed.ts";
import { DANA_CLIENT, SAM_CLIENT, push, subscribe } from "./service-world.ts";

const ORIGIN = "http://127.0.0.1:4747";
const SAM = { userId: "sam", name: "Sam Okafor" };
const DANA = { userId: "dana", name: "Dana Reyes" };

interface FakeConnection extends Connection {
  sent: Uint8Array[];
  closed: { code: number; reason: string } | null;
}

interface Socketed {
  server: ManentServer;
  time: FakeClock;
  /** A connection for `userId` that has been answered WELCOME. */
  welcomed(userId: string): Promise<FakeConnection>;
  opened(userId: string): Promise<FakeConnection>;
}

/** The server with sync over memory storage (or none), where Sam owns DOC and Dana edits it. */
function socketed(
  options: { sync: boolean; limits?: Partial<SyncLimits> } = { sync: true },
): Socketed {
  const time = fakeClock();
  const base = makeConfig();
  const config = makeConfig({
    auth: {
      ...base.auth,
      directory: createFakeDirectory([
        { user: SAM, workspaces: [] },
        { user: DANA, workspaces: [] },
      ]),
    },
    sync: options.sync
      ? {
          storage: createMemoryStorage({ now: time.clock.now }),
          clock: time.clock,
          defer: time.defer,
          limits: options.limits ?? {},
        }
      : null,
  });
  const server = createServer(config);
  server.sync?.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  config.sync?.storage.directory.setRole(DOC, "dana", "edit", []);
  const opened = async (userId: string): Promise<FakeConnection> => {
    const ticket = config.socket.tickets.issue(userId);
    const upgrades: ConnectionData[] = [];
    await server.fetch(
      new Request(`${ORIGIN}/ws?ticket=${ticket}`, {
        headers: { Origin: ORIGIN },
      }),
      {
        remoteAddress: "127.0.0.1",
        upgrade(data) {
          upgrades.push(data);
          return true;
        },
      },
    );
    const connection: FakeConnection = {
      data: upgrades[0]!,
      bufferedBytes: 0,
      sent: [],
      closed: null,
      send(frame) {
        connection.sent.push(frame);
        return "sent";
      },
      close(code, reason) {
        connection.closed = { code, reason };
      },
    };
    server.connections.open(connection);
    return connection;
  };
  return {
    server,
    time,
    opened,
    async welcomed(userId) {
      const connection = await opened(userId);
      deliver(server, connection, encodeMessage(HELLO));
      expect(messagesTo(connection).map((m) => m.type)).toEqual(["WELCOME"]);
      return connection;
    },
  };
}

const HELLO: Message = {
  type: "HELLO",
  versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
  build: "test",
  deviceId: "device-1",
};

function deliver(
  server: ManentServer,
  connection: Connection,
  frame: Uint8Array,
): void {
  server.connections.message(connection, frame);
}

function messagesTo(connection: FakeConnection): Message[] {
  const decoder = createFrameDecoder({ from: "server" });
  return connection.sent.flatMap((frame) => {
    const result = decoder.push(frame);
    return result.kind === "message" ? [result.message] : [];
  });
}

function subscribedEditor(
  { server }: Socketed,
  connection: FakeConnection,
  clientId: number,
): void {
  deliver(
    server,
    connection,
    encodeMessage(subscribe(DOC, "edit", [clientId])),
  );
  expect(messagesTo(connection).map((m) => m.type)).toContain("SUBSCRIBED");
}

/** The 16 bytes of a UUID. */
const uuidBytes = (id: string): number[] =>
  Array.from(id.replaceAll("-", "").matchAll(/../g), ([pair]) =>
    Number.parseInt(pair, 16),
  );

test("a 10 MB push travels as chunks and is committed and acknowledged once", async () => {
  const world = socketed();
  const { server, time } = world;
  const sam = await world.welcomed("sam");
  const dana = await world.welcomed("dana");
  subscribedEditor(world, sam, SAM_CLIENT);
  subscribedEditor(world, dana, DANA_CLIENT);
  const tenMegabytePaste = createTypist(SAM_CLIENT).insertBlock(
    BLOCK,
    null,
    "x".repeat(10 * 1024 * 1024),
  );
  const danaTyping = createTypist(DANA_CLIENT).insertBlock(
    "b000000000000002",
    null,
    "Dusk",
  );
  const chunks = createFrameEncoder({ ids: createMessageIds() }).encode(
    push(DOC, 1, tenMegabytePaste),
  );
  expect(chunks.length).toBeGreaterThan(2);
  deliver(server, sam, chunks[0]!);
  // dana's small push passes between the chunks
  deliver(server, dana, encodeMessage(push(DOC, 1, danaTyping)));
  for (const c of chunks.slice(1)) deliver(server, sam, c);
  time.runDeferred();
  expect(messagesTo(sam).filter((m) => m.type === "ACK")).toEqual([
    { type: "ACK", docId: DOC, generation: 1, clientSeq: 1, serverSeq: 2 },
  ]);
  const update = messagesTo(dana).find(
    (m) => m.type === "SYNC" && m.step === "update",
  );
  expect((update as { data: Uint8Array }).data.byteLength).toBe(
    tenMegabytePaste.byteLength,
  );
  expect(server.sync!.stats()).toMatchObject({ appended: 2 });
});

test("a connection that never says HELLO is closed", async () => {
  const world = socketed({ sync: true, limits: { helloTimeoutMs: 200 } });
  const quiet = await world.opened("sam");
  world.time.advance(199);
  expect(quiet.closed).toBeNull();
  world.time.advance(1);
  expect(quiet.closed).toEqual({ code: 4400, reason: "bad_frame" });
  const greeted = await world.welcomed("sam");
  world.time.advance(1_000);
  expect(greeted.closed).toBeNull();
});

test("a frame type from a newer client for a document is answered with unknown_frame", async () => {
  const world = socketed();
  const sam = await world.welcomed("sam");
  subscribedEditor(world, sam, SAM_CLIENT);
  deliver(world.server, sam, new Uint8Array([28, 0, ...uuidBytes(DOC), 1, 9]));
  expect(messagesTo(sam).at(-1)).toEqual({
    type: "ERROR",
    code: 4400,
    message: "unknown_frame",
    retryAfterMs: null,
    permanent: false,
    clientSeq: null,
    doc: { docId: DOC, generation: 1 },
  });
  expect(sam.closed).toBeNull();
});

test("without sync a document frame is answered 4403 as before", async () => {
  const world = socketed({ sync: false });
  const sam = await world.welcomed("sam");
  deliver(
    world.server,
    sam,
    encodeMessage(subscribe(DOC, "edit", [SAM_CLIENT])),
  );
  expect(messagesTo(sam).at(-1)).toEqual({
    type: "ERROR",
    code: 4403,
    message: "forbidden",
    retryAfterMs: null,
    permanent: false,
    clientSeq: null,
    doc: { docId: DOC, generation: 0 },
  });
  expect(world.server.sync).toBeNull();
});

test("a closed connection leaves the service", async () => {
  const world = socketed();
  const sam = await world.welcomed("sam");
  subscribedEditor(world, sam, SAM_CLIENT);
  expect(world.server.sync!.stats()).toMatchObject({ peers: 1, rooms: 1 });
  world.server.connections.close(sam);
  expect(world.server.sync!.stats()).toMatchObject({ peers: 0 });
});
