import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import fc from "fast-check";
import {
  FRAME_LIMIT_BYTES,
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  decodeMessage,
  encodeMessage,
  prepareMessage,
} from "../src/index.ts";
import type { FrameDecoder, Message, PushResult } from "../src/index.ts";
import {
  DOC_BYTES,
  DOC_ID,
  arbMessage,
  badFrame,
  concat,
  senderOf,
} from "./arbitraries.ts";

const DOC = DOC_ID;
const OTHER_DOC = "0f3e9a52-7d41-4c8b-9e26-b5a1c0d7e384";
const MORE = 0b0001;
const CHUNK = 0b1000;
const UNKNOWN_FLAG = 0b1_0000;
const tooLarge = expect.objectContaining({ name: "ProtocolError", code: 4413 });
const PENDING: PushResult = { kind: "pending" };

function bytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) & 0xff;
  return out;
}
const syncUpdate = (docId: string, data: Uint8Array): Message => ({
  type: "SYNC",
  docId,
  generation: 1,
  step: "update",
  data,
});
const pushOf = (n: number, clientSeq = 1): Message => ({
  type: "PUSH",
  docId: DOC,
  generation: 1,
  clientSeq,
  heal: false,
  update: bytes(n),
});
/** Pushes every frame; returns the messages the decoder produced. */
const messages = (d: FrameDecoder, frames: Uint8Array[]) =>
  frames
    .map((f) => d.push(f))
    .flatMap((r) => (r.kind === "message" ? [r.message] : []));
const encoderAt = (frameLimitBytes: number) =>
  createFrameEncoder({ ids: createMessageIds(), frameLimitBytes });

test("a payload over the frame limit travels as chunks with a more flag", () => {
  const push = {
    type: "PUSH",
    docId: DOC,
    generation: 1,
    clientSeq: 1,
    heal: false,
    update: bytes(10 * 1024 * 1024),
  } as const;
  const frames = createFrameEncoder({ ids: createMessageIds() }).encode(push);
  expect(frames).toHaveLength(3);
  for (const f of frames)
    expect(f.byteLength).toBeLessThanOrEqual(FRAME_LIMIT_BYTES);
  const d = createFrameDecoder({ from: "client" });
  expect(d.push(frames[0]!)).toEqual(PENDING);
  expect(d.push(frames[1]!)).toEqual(PENDING);
  expect(d.push(frames[2]!)).toEqual({ kind: "message", message: push });
});

test("chunking round-trips at any limit", () => {
  fc.assert(
    fc.property(
      arbMessage,
      fc.integer({ min: 64, max: 4096 }),
      (m, frameLimitBytes) => {
        const frames = encoderAt(frameLimitBytes).encode(m);
        for (const f of frames) {
          expect(f.byteLength).toBeLessThanOrEqual(frameLimitBytes);
          expect(f[1]! & ~MORE).toBe(frames[0]![1]! & ~MORE); // one flags byte per message, MORE aside
        }
        const d = createFrameDecoder({ from: senderOf(m), frameLimitBytes });
        const out = frames.map((f) => d.push(f));
        expect(out.slice(0, -1).every((r) => r.kind === "pending")).toBe(true);
        expect(out.at(-1)).toEqual({ kind: "message", message: m });
      },
    ),
    { numRuns: 500 },
  );
});

test("a whole frame of the same type and document between two chunks decodes as its own message", () => {
  const enc = encoderAt(256);
  const d = createFrameDecoder({ from: "server" });
  const big = syncUpdate(DOC, bytes(600));
  const small = syncUpdate(DOC, bytes(10));
  const [c1, c2, c3] = enc.encode(big);
  const [whole] = enc.encode(small);
  expect(d.push(c1!)).toEqual(PENDING);
  expect(d.push(whole!)).toEqual({ kind: "message", message: small });
  expect(d.push(c2!)).toEqual(PENDING);
  expect(d.push(c3!)).toEqual({ kind: "message", message: big });
});

test("chunks of two messages may interleave", () => {
  const enc = encoderAt(256);
  const a = pushOf(600, 1);
  const b = pushOf(700, 2);
  const fa = enc.encode(a);
  const fb = enc.encode(b);
  expect(fa.length).toBeGreaterThan(1);
  expect(fb.length).toBeGreaterThan(1);
  const alternated: Uint8Array[] = [];
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    if (fa[i]) alternated.push(fa[i]!);
    if (fb[i]) alternated.push(fb[i]!);
  }
  expect(messages(createFrameDecoder({ from: "client" }), alternated)).toEqual([
    a,
    b,
  ]);
});

test("two encoders on one connection never share a message ID", () => {
  const ids = createMessageIds();
  const [a, b] = [
    createFrameEncoder({ ids, frameLimitBytes: 256 }),
    createFrameEncoder({ ids, frameLimitBytes: 256 }),
  ];
  const [one, two] = [
    syncUpdate(DOC, bytes(600)),
    syncUpdate(OTHER_DOC, bytes(700)),
  ];
  const [fa, fb] = [a.encode(one), b.encode(two)];
  expect([fa[0]![2], fb[0]![2]]).toEqual([1, 2]);
  const interleaved = fb.flatMap((f, i) => (fa[i] ? [fa[i]!, f] : [f]));
  expect(messages(createFrameDecoder({ from: "server" }), interleaved)).toEqual(
    [one, two],
  );
});

test("a body encoded once is framed for each connection under that connection's own ID", () => {
  const prepared = prepareMessage(syncUpdate(DOC, bytes(600)));
  const busy = createMessageIds();
  busy.next();
  const [first, second] = [
    createFrameEncoder({ ids: busy, frameLimitBytes: 256 }).encode(prepared),
    createFrameEncoder({
      ids: createMessageIds(),
      frameLimitBytes: 256,
    }).encode(prepared),
  ];
  expect([first[0]![2], second[0]![2]]).toEqual([2, 1]);
  for (const frames of [first, second])
    expect(messages(createFrameDecoder({ from: "server" }), frames)).toEqual([
      syncUpdate(DOC, bytes(600)),
    ]);
});

test("message IDs count from 1 per connection and are spent only on chunked messages", () => {
  const enc = encoderAt(256);
  expect(enc.encode(pushOf(1000))[0]![2]).toBe(1);
  expect(enc.encode(pushOf(10))).toHaveLength(1);
  expect(enc.encode(pushOf(1000))[0]![2]).toBe(2);
  expect(encoderAt(256).encode(pushOf(1000))[0]![2]).toBe(1);
});

test("a chunk that is not the last is pending", () => {
  const frames = createFrameEncoder({
    ids: createMessageIds(),
    frameLimitBytes: 256,
  }).encode(pushOf(600));
  const d = createFrameDecoder({ from: "client" });
  expect(frames.map((f) => d.push(f).kind)).toEqual([
    "pending",
    "pending",
    "message",
  ]);
});

test("a frame over the frame limit is refused", () => {
  expect(() =>
    createFrameDecoder({ from: "client", frameLimitBytes: 256 }).push(
      bytes(257),
    ),
  ).toThrow(tooLarge);
});

test("a message over the message limit is refused", () => {
  expect(() =>
    messages(
      createFrameDecoder({ from: "client", messageLimitBytes: 1024 }),
      encoderAt(256).encode(pushOf(4096)),
    ),
  ).toThrow(tooLarge);
});

test("more chunked messages in progress than allowed is refused", () => {
  const small = encoderAt(256);
  const d = createFrameDecoder({ from: "client", maxPartial: 2 });
  const [a] = small.encode(pushOf(600));
  const [b] = small.encode(pushOf(600));
  const [c] = small.encode(pushOf(600));
  expect(d.push(a!)).toEqual(PENDING);
  expect(d.push(b!)).toEqual(PENDING);
  expect(() => d.push(c!)).toThrow(tooLarge);
});

test("a finished message ID may be used again", () => {
  const frames = encoderAt(256).encode(pushOf(600));
  const d = createFrameDecoder({ from: "client" });
  expect(messages(d, frames)).toEqual([pushOf(600)]);
  expect(messages(d, frames)).toEqual([pushOf(600)]);
});

test("a last chunk for an ID never started is a one-chunk message", () => {
  // type 5 · CHUNK · message 9 · nonce 7
  expect(
    createFrameDecoder({ from: "server" }).push(
      new Uint8Array([5, 0b1000, 9, 7]),
    ),
  ).toEqual({ kind: "message", message: { type: "PING", nonce: 7 } });
});

test("a chunk is the common header, the message ID, then its share of the body", () => {
  const frames = encoderAt(8).encode({
    type: "AUTH_REFRESH",
    ticket: "abcdefgh",
  });
  expect(frames.map((f) => [...f])).toEqual([
    [3, 0b1001, 1, 8, 97, 98, 99, 100], // type 3 · CHUNK|MORE · message 1 · the varstring's length and "abcd"
    [3, 0b1000, 1, 101, 102, 103, 104], // type 3 · CHUNK · message 1 · "efgh"
  ]);
  expect(() =>
    encoderAt(3).encode({
      type: "AUTH_REFRESH",
      ticket: "abcdefgh",
    }),
  ).toThrow(RangeError);
});

test("chunks of one message must agree about what it is", () => {
  const [c1, c2] = encoderAt(256).encode(pushOf(300)) as [
    Uint8Array,
    Uint8Array,
  ];
  const other = c2.slice();
  other[3] = other[3]! ^ 1; // the same message ID under another document ID
  const d = createFrameDecoder({ from: "client" });
  d.push(c1);
  expect(() => d.push(other)).toThrow(badFrame);
});

test("a chunked message from a sender that may not send it is refused at its first chunk", () => {
  const [c1] = encoderAt(256).encode(pushOf(600));
  expect(() => createFrameDecoder({ from: "server" }).push(c1!)).toThrow(
    badFrame,
  );
});

test("a skipped frame names its type and its document", () => {
  const d = createFrameDecoder({ from: "server" });
  expect(
    d.push(concat(new Uint8Array([28, 0]), DOC_BYTES, new Uint8Array([2, 9]))),
  ).toEqual({
    kind: "skipped",
    frameType: 28,
    doc: { docId: DOC, generation: 2 },
  });
  expect(d.push(new Uint8Array([6, 0]))).toEqual({
    kind: "skipped",
    frameType: 6,
    doc: null,
  });
  expect(d.push(new Uint8Array([28, 0, 1, 2]))).toEqual({
    kind: "skipped",
    frameType: 28,
    doc: null,
  }); // too short to hold a document
  const subscribe = encodeMessage({
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 2,
    mode: "edit",
    clientIds: [],
    lastServerSeq: 0,
  });
  subscribe[19] = 9; // a mode a newer client added
  expect(createFrameDecoder({ from: "client" }).push(subscribe)).toEqual({
    kind: "skipped",
    frameType: 16,
    doc: { docId: DOC, generation: 2 },
  });
});

test("a chunked message this build does not know is skipped once, at its last chunk", () => {
  const d = createFrameDecoder({ from: "server" });
  expect(d.push(new Uint8Array([28, CHUNK | MORE, 5, 1, 2, 3]))).toEqual({
    kind: "pending",
  });
  expect(d.push(new Uint8Array([28, CHUNK, 5, 4]))).toEqual({
    kind: "skipped",
    frameType: 28,
    doc: null,
  });
});

test("chunks handed over as Buffers are copied, not kept as views", () => {
  const push = pushOf(600);
  const frames = encoderAt(256)
    .encode(push)
    .map((f) => Buffer.from(f));
  const d = createFrameDecoder({ from: "client" });
  let out: PushResult = PENDING;
  for (const f of frames) {
    out = d.push(f);
    f.fill(0); // the socket reuses its buffer
  }
  expect(out).toEqual({ kind: "message", message: push });
});

test("a client SYNC step2 or update is refused at its first chunk", () => {
  for (const step of ["step2", "update"] as const) {
    const [first] = encoderAt(256).encode({
      ...syncUpdate(DOC, bytes(2000)),
      step,
    } as Message);
    expect(() => createFrameDecoder({ from: "client" }).push(first!)).toThrow(
      badFrame,
    );
  }
  const step1 = { ...syncUpdate(DOC, bytes(2000)), step: "step1" } as Message;
  const frames = encoderAt(256).encode(step1);
  expect(messages(createFrameDecoder({ from: "client" }), frames)).toEqual([
    step1,
  ]);
});

test("a client's SYNC step written the long way is refused at its first chunk", () => {
  const first = concat(
    new Uint8Array([20, CHUNK | MORE, 1]),
    DOC_BYTES,
    new Uint8Array([1, 0x81, 0x00, 9, 9]),
  ); // message 1 · document · generation 1 · step2 as two bytes
  expect(() => createFrameDecoder({ from: "client" }).push(first)).toThrow(
    badFrame,
  );
});

test("both decoders refuse an unknown chunk whose message ID is malformed", () => {
  const frame = new Uint8Array([
    100,
    CHUNK,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0x7f,
    7,
  ]);
  expect(() => decodeMessage(frame, "server")).toThrow(badFrame);
  expect(() => createFrameDecoder({ from: "server" }).push(frame)).toThrow(
    badFrame,
  );
});

const withFlag = (frame: Uint8Array, flag: number) => {
  const out = frame.slice();
  out[1] = out[1]! | flag;
  return out;
};

test("when the first chunk is skipped, the rest of its message is skipped with it", () => {
  const enc = encoderAt(256);
  const awareness: Message = {
    type: "AWARENESS",
    docId: DOC,
    generation: 1,
    update: bytes(700),
  };
  const [first, ...rest] = enc.encode(awareness);
  expect(rest.length).toBeGreaterThan(1);
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(withFlag(first!, UNKNOWN_FLAG))).toEqual(PENDING);
  expect(rest.map((f) => d.push(f))).toEqual([
    ...rest.slice(1).map(() => PENDING),
    { kind: "skipped", frameType: 23, doc: { docId: DOC, generation: 1 } },
  ]); // never the middle chunks read as a whole
  const next = syncUpdate(DOC, bytes(600)); // nothing left pending: room for one more
  expect(messages(d, enc.encode(next))).toEqual([next]);
});

test("a chunk that must be skipped drops the message it belongs to", () => {
  const enc = encoderAt(256);
  const [c1, c2, c3] = enc.encode(syncUpdate(DOC, bytes(600)));
  expect(c3).toBeDefined();
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(c1!)).toEqual(PENDING);
  expect(d.push(withFlag(c2!, UNKNOWN_FLAG))).toEqual(PENDING);
  expect(d.push(c3!)).toEqual({
    kind: "skipped",
    frameType: 20,
    doc: { docId: DOC, generation: 1 },
  }); // dropped with its message, not decoded as one on its own
  const next = syncUpdate(DOC, bytes(600));
  expect(messages(d, enc.encode(next))).toEqual([next]);
});

test("messages being skipped count against maxPartial", () => {
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(new Uint8Array([28, CHUNK | MORE, 5, 1]))).toEqual(PENDING);
  const [first] = encoderAt(256).encode(syncUpdate(DOC, bytes(600)));
  expect(() => d.push(first!)).toThrow(tooLarge);
});

test("MORE without CHUNK is skipped", () => {
  expect(
    createFrameDecoder({ from: "server" }).push(new Uint8Array([5, MORE, 7])),
  ).toEqual({ kind: "skipped", frameType: 5, doc: null });
});

test("an over-long message ID is refused", () => {
  const id = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]; // beyond the safe integers
  expect(() =>
    createFrameDecoder({ from: "server" }).push(
      new Uint8Array([5, CHUNK, ...id, 7]),
    ),
  ).toThrow(badFrame);
});

test("the message limit holds for a whole frame too", () => {
  const frame = createFrameEncoder({ ids: createMessageIds() }).encode(
    pushOf(2000),
  )[0]!;
  expect(() =>
    createFrameDecoder({
      from: "client",
      frameLimitBytes: 4096,
      messageLimitBytes: 1024,
    }).push(frame),
  ).toThrow(tooLarge);
});

// Chunks this build must skip, under message IDs (1000–1003) that no real message uses.
const junkChunk = fc
  .tuple(
    fc.oneof(
      fc.record({
        type: fc.integer({ min: 6, max: 15 }),
        flags: fc.constant(0),
      }),
      fc.record({
        type: fc.integer({ min: 28, max: 255 }),
        flags: fc.constant(0),
      }),
      fc.record({
        type: fc.constantFrom(0, 5, 20, 21),
        flags: fc.constant(UNKNOWN_FLAG),
      }),
      fc.record({
        type: fc.constantFrom(0, 20, 22),
        flags: fc.constantFrom(0b0010, 0b0100),
      }),
    ),
    fc.boolean(),
    fc.integer({ min: 1000, max: 1003 }),
    fc.uint8Array({ maxLength: 40 }),
  )
  .map(
    ([{ type, flags }, more, id, tail]) =>
      new Uint8Array([
        type,
        flags | CHUNK | (more ? MORE : 0),
        0x80 | (id & 0x7f),
        id >> 7,
        ...tail,
      ]),
  );

test("any interleaving of chunks delivers only messages that were sent", () => {
  const serverMessage = arbMessage.filter((m) => senderOf(m) === "server");
  fc.assert(
    fc.property(
      fc.array(serverMessage, { maxLength: 4 }),
      fc.array(junkChunk, { maxLength: 12 }),
      fc.integer({ min: 64, max: 512 }),
      fc.infiniteStream(fc.nat()),
      (sent, junk, frameLimitBytes, picks) => {
        const enc = encoderAt(frameLimitBytes);
        const queues = [...sent.map((m) => enc.encode(m)), [...junk]];
        const d = createFrameDecoder({
          from: "server",
          frameLimitBytes,
          maxPartial: 3,
        });
        const pick = picks[Symbol.iterator]();
        for (;;) {
          const open = queues.filter((q) => q.length > 0);
          if (open.length === 0) return;
          const queue = open[pick.next().value! % open.length]!;
          let out: PushResult;
          try {
            out = d.push(queue.shift()!);
          } catch (e) {
            expect(e).toBeInstanceOf(ProtocolError);
            expect([4400, 4413]).toContain((e as ProtocolError).code);
            return; // the connection closes
          }
          if (out.kind === "message") expect(sent).toContainEqual(out.message);
        }
      },
    ),
    { numRuns: 1000 },
  );
});
