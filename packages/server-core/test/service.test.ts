import { expect, test } from "bun:test";
import { applyRemote, createDoc, loadDoc, scriptBody } from "@manent/crdt";
import {
  createFrameDecoder,
  createMessageIds,
  prepareMessage,
} from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { DEFAULT_LIMITS, OWNER_CAPABILITIES, peerOf } from "../src/index.ts";
import type { Connection, ConnectionData } from "../src/index.ts";
import { fakePeer } from "../src/testing/index.ts";
import {
  BLOCK,
  DOC,
  DOC2,
  HOME,
  PROJECT,
  createTypist,
  rawEdit,
} from "./seed.ts";
import {
  DANA_CLIENT,
  EMPTY_VECTOR,
  PRIYA_CLIENT,
  SAM_CLIENT,
  createServiceWorld,
  push,
  set,
  step1,
  subscribe,
} from "./service-world.ts";

const SESSION = {
  identity: { userId: "sam", name: "Sam Okafor" },
  deviceId: "device-1",
  versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
  address: "127.0.0.1",
};

interface FakeConnection extends Connection {
  frames: Uint8Array[];
  bufferedBytes: number;
  closed: { code: number; reason: string } | null;
}

/** Records every frame; `send` answers what the transport would. */
function fakeConnection(
  options: { send?: "sent" | "dropped" } = {},
): FakeConnection {
  const connection: FakeConnection = {
    // the peer never reads its connection's data
    data: {} as ConnectionData,
    bufferedBytes: 0,
    frames: [],
    closed: null,
    send(frame) {
      connection.frames.push(frame);
      return options.send ?? "sent";
    },
    close(code, reason) {
      connection.closed = { code, reason };
    },
  };
  return connection;
}

const ping = (nonce: number): Message => ({ type: "PING", nonce });
const bytes = (length: number): Uint8Array =>
  new Uint8Array(length).map((_, i) => i % 251);
const syncUpdate = (docId: string, data: Uint8Array): Message => ({
  type: "SYNC",
  docId,
  generation: 1,
  step: "update",
  data,
});

/** A block holding an image, which the editor never writes. */
const hostileImg = (): Uint8Array =>
  rawEdit(createDoc({ clientId: SAM_CLIENT }), (body, make) =>
    body.insert(0, [
      make.element("section", {}, [
        make.element("block", { id: BLOCK, type: "action" }, [
          make.element("img"),
        ]),
      ]),
    ]),
  );

const samTyping = (): Uint8Array =>
  createTypist(SAM_CLIENT).insertBlock(BLOCK, null, "Rain");

test("an editor subscribes, exchanges state and is told of others' edits", () => {
  const { service, sam, dana, clock } = createServiceWorld();
  const typing = samTyping();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(sam.take()).toEqual([
    {
      type: "SUBSCRIBED",
      docId: DOC,
      generation: 1,
      role: "owner",
      capabilities: [...OWNER_CAPABILITIES],
      headSeq: 0,
      minSchemaVersion: 1,
      engineVersion: 0,
      lockLevel: 0,
      lockAnchors: null,
      revision: null,
      airWindow: null,
    },
    {
      type: "SYNC",
      docId: DOC,
      generation: 1,
      step: "step1",
      data: EMPTY_VECTOR,
    },
  ]);
  service.receive(sam, step1(DOC, EMPTY_VECTOR));
  expect(sam.take()).toMatchObject([{ type: "SYNC", step: "step2" }]);
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  dana.take();
  service.receive(sam, push(DOC, 1, typing));
  clock.runDeferred();
  // the sender gets no echo
  expect(sam.take()).toEqual([
    { type: "ACK", docId: DOC, generation: 1, clientSeq: 1, serverSeq: 1 },
  ]);
  expect(dana.take()).toEqual([
    { type: "SYNC", docId: DOC, generation: 1, step: "update", data: typing },
  ]);
});

const BLOCK2 = "b000000000000002";

const stepsOf = (messages: Message[]): string[] =>
  messages.map((m) => (m.type === "SYNC" ? m.step : m.type));

/** The deletions sent among `messages`; null when none were. */
const deletionsIn = (messages: Message[]): Uint8Array | null => {
  const sent = messages.find((m) => m.type === "SYNC" && m.step === "update");
  return sent?.type === "SYNC" ? sent.data : null;
};

/**
 * Sam types into two blocks that Priya, who never saw that typing, then deletes: rows 1 to 4 are
 * Sam's, row 5 deletes the first block, and `deleteSecond` commits row 6, deleting the second.
 */
function deletedUnseen() {
  const world = createServiceWorld();
  const { service, sam, priya, clock } = world;
  const typist = createTypist(SAM_CLIENT);
  const made = [
    typist.insertBlock(BLOCK, null, "Rain"),
    typist.insertBlock(BLOCK2, BLOCK, "Snow"),
  ];
  const priyaDoc = loadDoc(typist.doc.encodeState(), {
    clientId: PRIYA_CLIENT,
  });
  made.push(typist.type(BLOCK, " [sam]"), typist.type(BLOCK2, " [sam]"));
  const deleted: Uint8Array[] = [];
  const stop = priyaDoc.subscribe((update) => deleted.push(update));
  scriptBody(priyaDoc).write((w) => w.deleteBlock(BLOCK));
  scriptBody(priyaDoc).write((w) => w.deleteBlock(BLOCK2));
  stop();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(priya, subscribe(DOC, "edit", [PRIYA_CLIENT]));
  made.forEach((update, i) => service.receive(sam, push(DOC, i + 1, update)));
  service.receive(priya, push(DOC, 1, deleted[0]!));
  clock.runDeferred();
  const deleteSecond = (): void => {
    service.receive(priya, push(DOC, 2, deleted[1]!));
    clock.runDeferred();
  };
  /** Sam subscribes again with `lastServerSeq` and his step 1, and is answered. */
  const comeBack = (lastServerSeq: number): Message[] => {
    sam.take();
    service.receive(
      sam,
      subscribe(DOC, "edit", [SAM_CLIENT], { lastServerSeq }),
    );
    service.receive(sam, step1(DOC, typist.doc.encodeStateVector()));
    return sam.take();
  };
  return { ...world, typist, deleteSecond, comeBack };
}

test("an editor that comes back is sent what the rows it missed deleted before its step 2, so its own text a deleter never saw is set aside", () => {
  const { typist, deleteSecond, comeBack } = deletedUnseen();
  const own = new Set([SAM_CLIENT]);
  const setAside = (answered: Message[]) => {
    const deletions = deletionsIn(answered);
    const items =
      deletions === null ? [] : applyRemote(typist.doc, deletions, own);
    return [stepsOf(answered), items];
  };
  const first = setAside(comeBack(4));
  deleteSecond();
  expect([first, setAside(comeBack(5)), setAside(comeBack(6))]).toEqual([
    [
      ["SUBSCRIBED", "step1", "update", "step2"],
      [{ blockId: BLOCK, nearBlockId: BLOCK2, text: " [sam]" }],
    ],
    [
      ["SUBSCRIBED", "step1", "update", "step2"],
      [{ blockId: BLOCK2, nearBlockId: null, text: " [sam]" }],
    ],
    [["SUBSCRIBED", "step1", "step2"], []],
  ]);
});

test("a heal row's deletions are not sent to a returning editor, so its own text a deleter never saw is still set aside", () => {
  const { service, dana, storage, typist, comeBack, clock } = deletedUnseen();
  const healer = createTypist(DANA_CLIENT);
  const flagging = { lastServerSeq: 50 };
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT], flagging));
  const vector = dana.take().find((m) => m.type === "SYNC");
  service.receive(dana, step1(DOC, EMPTY_VECTOR));
  for (const m of dana.take())
    if (m.type === "SYNC") healer.doc.applyUpdate(m.data);
  healer.type(BLOCK2, " [dana]");
  if (vector?.type !== "SYNC") throw new RangeError("no step 1 was sent");
  const heal = { ...push(DOC, 1, healer.doc.diff(vector.data)), heal: true };
  service.receive(dana, heal);
  clock.runDeferred();
  const own = new Set([SAM_CLIENT]);
  const deletions = deletionsIn(comeBack(4));
  expect([
    storage
      .open(HOME)
      .log.tail(DOC, 1, 5)
      .rows.map((r) => r.origin),
    deletions === null ? [] : applyRemote(typist.doc, deletions, own),
  ]).toEqual([
    ["heal"],
    [{ blockId: BLOCK, nearBlockId: BLOCK2, text: " [sam]" }],
  ]);
});

test("a deletion still waiting to commit when a returning editor's step 1 arrives reaches it before its step 2, so its own text the deleter never saw is set aside", () => {
  const { service, sam, priya, clock } = createServiceWorld();
  const typist = createTypist(SAM_CLIENT);
  const made = [
    typist.insertBlock(BLOCK, null, "Rain"),
    typist.insertBlock(BLOCK2, BLOCK, "Snow"),
  ];
  const priyaDoc = loadDoc(typist.doc.encodeState(), {
    clientId: PRIYA_CLIENT,
  });
  made.push(typist.type(BLOCK, " [sam]"));
  const deleted: Uint8Array[] = [];
  const stop = priyaDoc.subscribe((update) => deleted.push(update));
  scriptBody(priyaDoc).write((w) => w.deleteBlock(BLOCK));
  stop();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(priya, subscribe(DOC, "edit", [PRIYA_CLIENT]));
  made.forEach((update, i) => service.receive(sam, push(DOC, i + 1, update)));
  clock.runDeferred();
  sam.take();
  service.receive(priya, push(DOC, 1, deleted[0]!));
  const extra = { lastServerSeq: 3 };
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT], extra));
  service.receive(sam, step1(DOC, typist.doc.encodeStateVector()));
  clock.runDeferred();
  const own = new Set([SAM_CLIENT]);
  const setAside = sam
    .take()
    .flatMap((m) =>
      m.type === "SYNC" && m.step !== "step1"
        ? applyRemote(typist.doc, m.data, own)
        : [],
    );
  expect(setAside).toEqual([
    { blockId: BLOCK, nearBlockId: BLOCK2, text: " [sam]" },
  ]);
});

test("a step 1 whose waiting commit fails is answered only by the failed commit", () => {
  const { service, sam, storage } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(sam, push(DOC, 1, samTyping()));
  sam.take();
  storage.failNextCommit();
  service.receive(sam, step1(DOC, EMPTY_VECTOR));
  expect(sam.take()).toEqual([
    {
      type: "ERROR",
      code: 1011,
      message: "storage_failed",
      permanent: false,
      retryAfterMs: 1000,
      clientSeq: null,
      doc: { docId: DOC, generation: 1 },
    },
  ]);
});

test("the deletions a returning editor is sent are read from each row at most twice while the script is loaded", () => {
  const { storage, deleteSecond, comeBack } = deletedUnseen();
  const { log } = storage.open(HOME);
  const tail = log.tail.bind(log);
  const read: [number, number][] = [];
  log.tail = (docId, generation, afterSeq, options) => {
    const found = tail(docId, generation, afterSeq, options);
    if (options?.quarantine === false) read.push([afterSeq, found.rows.length]);
    return found;
  };
  comeBack(4);
  comeBack(4);
  deleteSecond();
  comeBack(5);
  comeBack(2);
  comeBack(1);
  expect(read).toEqual([
    [4, 1],
    [5, 1],
    [0, 6],
  ]);
});

test("a device that holds nothing of the script is sent no deletions, and one recovering with an empty vector still is", () => {
  const { service, dana } = deletedUnseen();
  const join = (lastServerSeq: number): string[] => {
    dana.take();
    const extra = { lastServerSeq };
    service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT], extra));
    service.receive(dana, step1(DOC, EMPTY_VECTOR));
    return stepsOf(dana.take());
  };
  expect([join(0), join(4)]).toEqual([
    ["SUBSCRIBED", "step1", "step2"],
    ["SUBSCRIBED", "step1", "update", "step2"],
  ]);
});

const refusalOf = (
  code: number,
  message: string,
  permanent: boolean,
  retryAfterMs: number | null,
  docId = DOC,
): Message => ({
  type: "ERROR",
  code,
  message,
  permanent,
  retryAfterMs,
  clientSeq: null,
  doc: { docId, generation: 0 },
});

test("each SUBSCRIBE check answers as its row says, in order", () => {
  const rows: [string, () => [Message[], Message]][] = [
    [
      "an empty bucket",
      () => {
        const { service, sam } = createServiceWorld({
          limits: { framesPerSecond: 1, frameBurst: 1 },
        });
        service.receive(sam, subscribe(DOC, "view", []));
        sam.take();
        service.receive(sam, subscribe(DOC, "view", []));
        return [sam.take(), refusalOf(4429, "rate_limited", false, 1000)];
      },
    ],
    [
      "too many client ids",
      () => {
        const { service, sam } = createServiceWorld();
        const ids = Array.from({ length: 257 }, (_, i) => i + 1);
        service.receive(sam, subscribe(DOC, "edit", ids));
        return [sam.take(), refusalOf(4413, "too_many_client_ids", true, null)];
      },
    ],
    [
      "a deleted document",
      () => {
        const { service, sam } = createServiceWorld();
        service.access.remove("sam", { docId: DOC });
        service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
        return [sam.take(), refusalOf(4410, "deleted", true, null)];
      },
    ],
    [
      "an unknown document",
      () => {
        const { service, sam } = createServiceWorld();
        service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
        return [sam.take(), refusalOf(4403, "forbidden", false, null, DOC2)];
      },
    ],
    [
      "another generation",
      () => {
        const { service, sam } = createServiceWorld();
        service.receive(
          sam,
          subscribe(DOC, "edit", [SAM_CLIENT], { generation: 7 }),
        );
        return [
          sam.take(),
          {
            type: "GENERATION_MOVED",
            docId: DOC,
            generation: 7,
            newGeneration: 1,
          },
        ];
      },
    ],
    [
      "a prompter",
      () => {
        const { service, sam } = createServiceWorld();
        service.receive(sam, subscribe(DOC, "prompter", []));
        return [
          sam.take(),
          refusalOf(4403, "prompter_unavailable", false, null),
        ];
      },
    ],
    [
      "a viewer asking to edit",
      () => {
        const { service, leo } = createServiceWorld();
        service.receive(leo, subscribe(DOC, "edit", []));
        return [leo.take(), refusalOf(4403, "read_only_role", false, null)];
      },
    ],
    [
      "an app too old for the document",
      () => {
        const world = createServiceWorld();
        const old = fakePeer({
          versions: { protocol: 1, schema: 0, engine: 0, table: 0 },
        });
        world.service.attach(old);
        world.service.receive(old, subscribe(DOC, "edit", [SAM_CLIENT]));
        return [old.take(), refusalOf(4408, "too_old", false, null)];
      },
    ],
    [
      "someone else's client id",
      () => {
        const { service, sam, dana } = createServiceWorld();
        service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
        service.receive(dana, subscribe(DOC, "edit", [SAM_CLIENT]));
        return [dana.take(), refusalOf(4400, "client_id_taken", true, null)];
      },
    ],
    [
      "a full document",
      () => {
        const { service, sam, dana } = createServiceWorld({
          limits: { subscribersPerDocument: 1 },
        });
        service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
        service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
        return [dana.take(), refusalOf(4429, "document_full", false, 1000)];
      },
    ],
    [
      "no room can be loaded",
      () => {
        const { service, sam } = createServiceWorld({
          limits: { roomLoadsPerSecond: 1 },
        });
        service.access.create("sam", {
          docId: DOC2,
          kind: "script",
          home: `project:${PROJECT}`,
        });
        service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
        sam.take();
        service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
        return [sam.take(), refusalOf(4429, "busy", false, 1000)];
      },
    ],
  ];
  for (const [name, run] of rows) {
    const [answered, expected] = run();
    // one answer, and no SUBSCRIBED after it
    expect([name, answered]).toEqual([name, [expected]]);
  }
});

test("a fresh client gets the cached full state; another gets a diff", () => {
  const { service, sam, dana, clock } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(sam, push(DOC, 1, samTyping()));
  clock.runDeferred();
  sam.take();
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  const current = (dana.take()[1] as { data: Uint8Array }).data;
  service.receive(dana, step1(DOC, EMPTY_VECTOR));
  service.receive(sam, step1(DOC, EMPTY_VECTOR));
  const [first, second] = [dana.take(), sam.take()].map(
    (m) => (m[0] as { data: Uint8Array }).data,
  );
  expect(second).toEqual(first!);
  expect(first!.byteLength).toBeGreaterThan(2);
  service.receive(dana, step1(DOC, current));
  expect(dana.take()).toEqual([
    {
      type: "SYNC",
      docId: DOC,
      generation: 1,
      step: "step2",
      data: new Uint8Array([0, 0]),
    },
  ]);
  service.receive(dana, step1(DOC, new Uint8Array([9])));
  expect(dana.take()).toMatchObject([
    { type: "ERROR", code: 4400, message: "bad_update", permanent: false },
  ]);
});

test("a SUBSCRIBE whose write the store refuses is answered as a failed commit, and the next one subscribes", () => {
  const { service, sam, storage } = createServiceWorld();
  storage.failNextCommit();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(sam.take()).toEqual([
    {
      type: "ERROR",
      code: 1011,
      message: "storage_failed",
      permanent: false,
      retryAfterMs: 1000,
      clientSeq: null,
      doc: { docId: DOC, generation: 1 },
    },
  ]);
  service.receive(sam, push(DOC, 1, samTyping()));
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(sam.take().map((m) => m.type)).toEqual([
    "ERROR",
    "SUBSCRIBED",
    "SYNC",
  ]);
});

test("a refused push stalls the subscription until the next SUBSCRIBE", () => {
  const { service, sam, clock } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  sam.take();
  service.receive(sam, push(DOC, 1, hostileImg()));
  service.receive(sam, push(DOC, 2, samTyping()));
  clock.runDeferred();
  // one answer; the second push is dropped unanswered
  expect(sam.take()).toMatchObject([
    {
      type: "ERROR",
      code: 4422,
      message: "invalid",
      permanent: true,
      clientSeq: 1,
    },
  ]);
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  sam.take();
  service.receive(sam, push(DOC, 2, samTyping()));
  clock.runDeferred();
  expect(sam.take()).toMatchObject([{ type: "ACK", clientSeq: 2 }]);
});

test("a push larger than the byte burst passes on a full bucket, never refused for ever", () => {
  const paste = createTypist(SAM_CLIENT).insertBlock(
    BLOCK,
    null,
    "x".repeat(2_000),
  );
  const { service, sam, clock } = createServiceWorld({
    limits: { byteBurst: paste.byteLength - 1 },
  });
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  sam.take();
  // the bucket is full again
  clock.advance(1_000);
  service.receive(sam, push(DOC, 1, paste));
  clock.runDeferred();
  expect(sam.take()).toMatchObject([
    { type: "ACK", clientSeq: 1, serverSeq: 1 },
  ]);
});

test("a setting request reaches the write path, and its update comes back to the sender too", () => {
  const { service, sam, dana, clock } = createServiceWorld({
    registry: {
      check: (key) =>
        key === "script.paper"
          ? { ok: true }
          : { ok: false, code: "unknown_key" },
      isGuarded: () => false,
    },
  });
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  sam.take();
  dana.take();
  service.receive(sam, set(DOC, 3, "script.paper", "a4"));
  clock.runDeferred();
  const toSam = sam.take();
  expect(toSam).toMatchObject([
    { type: "SYNC", step: "update" },
    { type: "ACK", clientSeq: 3, serverSeq: 1 },
  ]);
  expect(dana.take()).toEqual([toSam[0]!]);
});

test("a skipped document frame is answered, never left hanging", () => {
  const { service, sam } = createServiceWorld();
  service.skipped(sam, { docId: DOC, generation: 1 });
  expect(sam.take()).toEqual([
    {
      type: "ERROR",
      code: 4400,
      message: "unknown_frame",
      retryAfterMs: null,
      permanent: false,
      clientSeq: null,
      doc: { docId: DOC, generation: 1 },
    },
  ]);
});

test("losing access, or the document, ends the subscription with the right code", () => {
  const { service, sam, dana, storage, clock } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  sam.take();
  dana.take();
  storage.directory.removeRole(DOC, "dana");
  service.accessChanged(DOC, "dana");
  expect(dana.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "forbidden" },
  ]);
  service.receive(
    dana,
    push(DOC, 1, createTypist(DANA_CLIENT).insertBlock(BLOCK, null, "x")),
  );
  clock.runDeferred();
  expect(dana.take()).toMatchObject([
    { type: "ERROR", code: 4403, message: "not_subscribed" },
  ]);
  service.access.remove("sam", { docId: DOC });
  service.removed(DOC);
  expect(sam.take()).toMatchObject([
    { type: "ERROR", code: 4410, message: "deleted", permanent: true },
  ]);
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(sam.take()).toMatchObject([
    { type: "ERROR", code: 4410, message: "deleted" },
  ]);
});

test("the connection caps refuse the 33rd connection of one person", () => {
  const { service } = createServiceWorld();
  const peers = Array.from({ length: 32 }, () =>
    fakePeer({ userId: "you", name: "You" }),
  );
  expect(peers.map((peer) => service.attach(peer))).toEqual(
    peers.map(() => ({ ok: true })),
  );
  expect(service.attach(fakePeer({ userId: "you", name: "You" }))).toEqual({
    ok: false,
    code: 4429,
  });
  service.detach(peers[0]!);
  expect(service.attach(fakePeer({ userId: "you", name: "You" }))).toEqual({
    ok: true,
  });
});

test("shutting down commits what is queued and closes everyone with 1012", async () => {
  const { service, sam, storage } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(sam, push(DOC, 1, samTyping()));
  await service.shutdown();
  expect(
    storage.open({ kind: "project", id: PROJECT }).log.get(DOC)!.headSeq,
  ).toBe(1);
  expect(sam.closed()).toEqual({ code: 1012, reason: "restarting" });
  expect(service.attach(fakePeer())).toEqual({ ok: false, code: 4429 });
});

test("a reader that stops reading is closed, and the others miss nothing", () => {
  const stuck = fakeConnection();
  const peer = peerOf(stuck, SESSION, createMessageIds(), {
    ...DEFAULT_LIMITS,
    backpressureBytes: 1_000,
  });
  peer.send(ping(1));
  expect(stuck.closed).toBeNull();
  stuck.bufferedBytes = 1_001;
  peer.send(ping(2));
  expect(stuck.closed).toEqual({ code: 4429, reason: "slow_reader" });
  const dropping = fakeConnection({ send: "dropped" });
  peerOf(dropping, SESSION, createMessageIds(), DEFAULT_LIMITS).send(ping(3));
  expect(dropping.closed).toEqual({ code: 4429, reason: "slow_reader" });
});

test("two rooms' large messages on one connection never share a message ID", () => {
  const connection = fakeConnection();
  const peer = peerOf(connection, SESSION, createMessageIds(), DEFAULT_LIMITS);
  const [one, two] = [
    syncUpdate(DOC, bytes(5 * 1024 * 1024)),
    syncUpdate(DOC2, bytes(5 * 1024 * 1024)),
  ];
  peer.send(prepareMessage(one));
  peer.send(two);
  const decoder = createFrameDecoder({ from: "server" });
  expect(
    connection.frames
      .map((f) => decoder.push(f))
      .flatMap((r) => (r.kind === "message" ? [r.message] : [])),
  ).toEqual([one, two]);
  // message IDs 1 and 2
  expect(new Set(connection.frames.map((f) => f[2])).size).toBe(2);
});

test("what the service did is counted", async () => {
  const { service, sam, clock } = createServiceWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  const typing = samTyping();
  service.receive(sam, push(DOC, 1, typing));
  service.receive(sam, push(DOC, 1, typing));
  clock.runDeferred();
  service.skipped(sam, { docId: DOC, generation: 1 });
  expect(service.stats()).toEqual({
    peers: 5,
    rooms: 1,
    loadedRooms: 1,
    commits: 1,
    appended: 1,
    duplicates: 1,
    refused: { unknown_frame: 1 },
    poisoned: 0,
    awarenessDropped: 0,
    skipped: 1,
    rebuilds: 0,
    rebuildsSkipped: {},
  });
});
