import { expect, test } from "bun:test";
import { ConnectError } from "@manent/sync-client";
import {
  createFakeClock,
  createMemoryNetwork,
} from "@manent/sync-client/testing";
import type { ServerEnd } from "@manent/sync-client/testing";
import {
  SLOW_DELAY_MS,
  connectionTransport,
} from "../src/demo/connection-transport.ts";
import type { ConnectionMode } from "../src/services/sync/device-memory.ts";
import { START, createSyncWorld, settle } from "./sync.fixtures.ts";

const F1 = new Uint8Array([1]);
const F2 = new Uint8Array([2]);
const F3 = new Uint8Array([3]);

/** A server over the memory network that keeps every frame it is sent, and the transport of one tab before it. */
function slowWorld() {
  const fake = createFakeClock(START);
  const network = createMemoryNetwork({ random: () => 0 });
  const ends: ServerEnd[] = [];
  const received: Uint8Array[] = [];
  network.serve({
    connected(end) {
      ends.push(end);
      end.onFrame = (frame) => received.push(frame);
    },
    createDocument: () => ({ ok: true }),
  });
  let mode: ConnectionMode = "online";
  const transport = connectionTransport({
    transport: network.transport("dana"),
    clock: fake.clock,
    delayMs: SLOW_DELAY_MS,
    control: { mode: () => mode },
  });
  return {
    fake,
    ends,
    received,
    transport,
    set(next: ConnectionMode) {
      mode = next;
    },
    /** Everything the network holds, delivered. */
    deliver() {
      while (network.step());
    },
  };
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof ConnectError ? error.code : error),
  );

test("Offline closes this tab's socket and lets nothing out", async () => {
  const world = createSyncWorld();
  const sync = await world.personSync();
  await settle(world.network);
  expect(sync.link.get().state).toBe("online");
  const heard = world.server.got("HELLO", "SUBSCRIBE", "SYNC", "PING").length;
  const connects = world.connects();

  sync.connection.set("offline");
  await settle(world.network);
  expect(sync.link.get().state).toBe("offline");
  expect(sync.network.get()).toBe(false);
  world.fake.advance(120_000);
  await settle(world.network);
  expect(world.connects()).toBe(connects);
  expect(world.server.got("HELLO", "SUBSCRIBE", "SYNC", "PING").length).toBe(
    heard,
  );

  // the transport itself refuses at once, and a socket left open sends nothing
  const slow = slowWorld();
  const conn = await slow.transport.connect({
    onFrame() {},
    onClose() {},
  });
  slow.set("offline");
  conn.send(F1);
  slow.deliver();
  expect(slow.received).toEqual([]);
  const request = { docId: "d", kind: "script", home: "h", workspaceId: null };
  expect(
    await Promise.all([
      refusal(slow.transport.connect({ onFrame() {}, onClose() {} })),
      refusal(slow.transport.createDocument(request)),
      refusal(
        slow.transport.replay({
          docId: "d",
          generation: 1,
          lastServerSeq: 0,
          key: "k",
          updates: [],
        }),
      ),
    ]),
  ).toEqual(["unreachable", "unreachable", "unreachable"]);
});

test("Slow delays every frame both ways, in order", async () => {
  const slow = slowWorld();
  const received: Uint8Array[] = [];
  const conn = await slow.transport.connect({
    onFrame: (frame) => received.push(frame),
    onClose() {},
  });
  slow.set("slow");
  conn.send(F1);
  conn.send(F2);
  slow.fake.advance(1_499);
  slow.deliver();
  expect(slow.received).toEqual([]);
  slow.fake.advance(1);
  slow.deliver();
  expect(slow.received).toEqual([F1, F2]);

  slow.ends[0]?.send(F3);
  slow.deliver();
  expect(received).toEqual([]);
  slow.fake.advance(1_500);
  expect(received).toEqual([F3]);

  // a frame sent once the Connection is Online again still waits behind one delayed before it
  conn.send(F1);
  slow.set("online");
  conn.send(F2);
  slow.deliver();
  expect(slow.received).toEqual([F1, F2]);
  slow.fake.advance(1_500);
  slow.deliver();
  expect(slow.received).toEqual([F1, F2, F1, F2]);
});

test("Online again connects at once", async () => {
  const world = createSyncWorld();
  const sync = await world.personSync();
  await settle(world.network);
  sync.connection.set("offline");
  await settle(world.network);
  const connects = world.connects();

  sync.connection.set("online");
  await settle(world.network);
  expect(world.connects()).toBe(connects + 1);
  expect(sync.link.get().state).toBe("online");
  expect(sync.network.get()).toBe(true);
});
