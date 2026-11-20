import { expect, test } from "bun:test";
import type {
  Connection,
  ConnectionData,
  ConnectionHandler,
} from "@manent/server-core";
import { createMemoryStorage } from "@manent/storage/testing";
import { createFakeClock } from "@manent/sync-client/testing";
import {
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  encodeMessage,
} from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { MIRROR_RETRY_AFTER_MS, guardSubscribe } from "../src/index.ts";
import type { Mirror } from "../src/index.ts";
import { DOC, DOC2, PROJECT, world } from "./relay-world.ts";

test("a document made elsewhere is mirrored with the cloud's kind, home and role", async () => {
  const w = world();
  w.cloudMakes(DOC2, "dana", ["sam"]);
  await w.signedIn("sam");
  expect(await w.mirror.ensure("sam", DOC2)).toEqual({ ok: true });
  expect(w.nodeStorage.directory.placeOf(DOC2)).toEqual({
    home: { kind: "project", id: PROJECT },
    kind: "script",
  });
  expect(w.nodeStorage.directory.roleOf(DOC2, "sam")).toEqual({
    role: "edit",
    capabilities: [],
  });
  expect(w.records.docState(DOC2)).toEqual({
    userId: "sam",
    state: "synced",
    generation: 1,
  });
});

test("offline, an unknown document is not invented", async () => {
  const w = world();
  w.cloudMakes(DOC2, "dana", ["sam"]);
  await w.signedIn("sam");
  w.cloudDown(true);
  expect(await w.mirror.ensure("sam", DOC2)).toEqual({
    ok: false,
    code: "unreachable",
  });
  expect(w.nodeStorage.directory.placeOf(DOC2)).toBeNull();
  expect(w.records.docState(DOC2)).toBeNull();
});

const V1 = Object.freeze({ protocol: 1, schema: 1, engine: 0, table: 0 });
const subscribe = (docId: string): Message => ({
  type: "SUBSCRIBE",
  docId,
  generation: 0,
  mode: "edit",
  clientIds: [],
  lastServerSeq: 0,
});

/** What reached the server, and what the window was sent, as `TYPE docId`; an ERROR as its code, message and wait. */
function read(frames: readonly Uint8Array[], from: "client" | "server") {
  const decoder = createFrameDecoder({ from });
  return frames.flatMap((frame) => {
    const out = decoder.push(frame);
    if (out.kind !== "message") return [];
    const { message } = out;
    if (message.type === "ERROR")
      return [
        `ERROR ${message.code} ${message.message} ${message.retryAfterMs}`,
      ];
    return [
      "docId" in message ? `${message.type} ${message.docId}` : message.type,
    ];
  });
}

/** A window's connection to a guard over a server that hears every frame; DOC is placed and DOC2 is not. */
function guarded(ensure: Mirror["ensure"]) {
  const clock = createFakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  storage.directory.place(
    DOC,
    { kind: "project", id: PROJECT },
    "script",
    "sam",
  );
  const heard: Uint8Array[] = [];
  const sent: Uint8Array[] = [];
  let heardAfterClose = 0;
  let closed = false;
  const inner: ConnectionHandler = {
    maxFrameBytes: FRAME_LIMIT_BYTES,
    open(connection) {
      connection.send(
        encodeMessage({
          type: "WELCOME",
          session: { userId: "sam", name: "Sam Okafor" },
          limits: {
            frameBytes: FRAME_LIMIT_BYTES,
            messageBytes: MESSAGE_LIMIT_BYTES,
          },
          server: { current: V1, min: V1 },
        }),
      );
    },
    message(_connection, frame) {
      if (typeof frame === "string") return;
      heard.push(frame);
      if (closed) heardAfterClose += 1;
    },
    drain() {},
    close() {},
  };
  const guard = guardSubscribe({
    inner,
    storage,
    mirror: { ensure },
    tokenOf: () => "cloud-token",
    clock: clock.clock,
    subscribed() {},
  });
  // the guard keys a connection by its data's identity, which only server-core can make
  const connection: Connection = {
    data: {} as ConnectionData,
    bufferedBytes: 0,
    send(frame) {
      sent.push(new Uint8Array(frame));
      return "sent";
    },
    close() {},
  };
  guard.connections.open(connection);
  return {
    clock,
    window: (message: Message) =>
      guard.connections.message(connection, encodeMessage(message)),
    close() {
      closed = true;
      guard.connections.close(connection);
    },
    heard: () => read(heard, "client"),
    sent: () => read(sent, "server").filter((type) => type !== "WELCOME"),
    heardAfterClose: () => heardAfterClose,
  };
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

test("while one script waits for the cloud, the window's other frames reach the node at once", async () => {
  const g = guarded(() => new Promise(() => {}));
  g.window(subscribe(DOC2));
  g.window(subscribe(DOC));
  g.window({ type: "PING", nonce: 1 });
  g.window({ type: "UNSUBSCRIBE", docId: DOC2, generation: 0 });
  await settle();
  expect(g.heard()).toEqual([`SUBSCRIBE ${DOC}`, "PING"]);
});

test("a cloud that does not answer in time reads as busy, and what waited goes on", async () => {
  const g = guarded(() => new Promise(() => {}));
  g.window(subscribe(DOC2));
  g.window({ type: "UNSUBSCRIBE", docId: DOC2, generation: 0 });
  g.clock.advance(MIRROR_RETRY_AFTER_MS - 1);
  await settle();
  expect([g.sent(), g.heard()]).toEqual([[], []]);
  g.clock.advance(1);
  await settle();
  expect([g.sent(), g.heard()]).toEqual([
    ["ERROR 4429 busy 5000"],
    [`UNSUBSCRIBE ${DOC2}`],
  ]);
});

test("what a window sent while its script waited goes nowhere once it has closed", async () => {
  const answer = Promise.withResolvers<{ ok: true }>();
  const g = guarded(() => answer.promise);
  g.window(subscribe(DOC2));
  g.window({ type: "UNSUBSCRIBE", docId: DOC2, generation: 0 });
  g.close();
  answer.resolve({ ok: true });
  await settle();
  expect([g.heardAfterClose(), g.sent()]).toEqual([0, []]);
});
