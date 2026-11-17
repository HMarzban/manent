import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import fc from "fast-check";
import {
  FRAME_LIMIT_BYTES,
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
} from "../src/index.ts";
import type { FrameDecoder, Message } from "../src/index.ts";
import { DOC_ID, arbMessage, senderOf } from "./arbitraries.ts";

const DOC = DOC_ID;
const MORE = 0b0001;
const CHUNK = 0b1000;
const UNKNOWN_FLAG = 0b1_0000;
const tooLarge = expect.objectContaining({ name: "ProtocolError", code: 4413 });
const badFrame = expect.objectContaining({ name: "ProtocolError", code: 4400 });

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
/** Pushes every frame; returns what the decoder produced, nulls left out. */
function feed(d: FrameDecoder, frames: Uint8Array[]): Message[] {
  return frames.map((f) => d.push(f)).filter((m): m is Message => m !== null);
}

test("a payload over the frame limit travels as chunks with a more flag", () => {
  const push = {
    type: "PUSH",
    docId: DOC,
    generation: 1,
    clientSeq: 1,
    heal: false,
    update: bytes(10 * 1024 * 1024),
  } as const;
  const frames = createFrameEncoder().encode(push);
  expect(frames).toHaveLength(3);
  for (const f of frames)
    expect(f.byteLength).toBeLessThanOrEqual(FRAME_LIMIT_BYTES);
  const d = createFrameDecoder({ from: "client" });
  expect(d.push(frames[0]!)).toBeNull();
  expect(d.push(frames[1]!)).toBeNull();
  expect(d.push(frames[2]!)).toEqual(push);
});

test("chunking round-trips at any limit", () => {
  fc.assert(
    fc.property(
      arbMessage,
      fc.integer({ min: 64, max: 4096 }),
      (m, frameLimit) => {
        const frames = createFrameEncoder({ frameLimit }).encode(m);
        for (const f of frames) {
          expect(f.byteLength).toBeLessThanOrEqual(frameLimit);
          expect(f[1]! & ~MORE).toBe(frames[0]![1]! & ~MORE); // one flags byte per message, MORE aside
        }
        const d = createFrameDecoder({ from: senderOf(m), frameLimit });
        const out = frames.map((f) => d.push(f));
        expect(out.slice(0, -1).every((x) => x === null)).toBe(true);
        expect(out.at(-1)).toEqual(m);
        expect(d.skipped).toBe(0);
      },
    ),
    { numRuns: 500 },
  );
});

test("a whole frame of the same type and document between two chunks decodes as its own message", () => {
  const enc = createFrameEncoder({ frameLimit: 256 });
  const d = createFrameDecoder({ from: "server" });
  const big = syncUpdate(DOC, bytes(600));
  const small = syncUpdate(DOC, bytes(10));
  const [c1, c2, c3] = enc.encode(big);
  const [whole] = enc.encode(small);
  expect(d.push(c1!)).toBeNull();
  expect(d.push(whole!)).toEqual(small);
  expect(d.push(c2!)).toBeNull();
  expect(d.push(c3!)).toEqual(big);
});

test("chunks of two messages may interleave", () => {
  const enc = createFrameEncoder({ frameLimit: 256 });
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
  expect(feed(createFrameDecoder({ from: "client" }), alternated)).toEqual([
    a,
    b,
  ]);
});

test("message IDs count from 1 per encoder and are spent only on chunked messages", () => {
  const enc = createFrameEncoder({ frameLimit: 256 });
  expect(enc.encode(pushOf(1000))[0]![2]).toBe(1);
  expect(enc.encode(pushOf(10))).toHaveLength(1);
  expect(enc.encode(pushOf(1000))[0]![2]).toBe(2);
  expect(
    createFrameEncoder({ frameLimit: 256 }).encode(pushOf(1000))[0]![2],
  ).toBe(1);
});

test("the decoder holds a bounded amount", () => {
  const small = createFrameEncoder({ frameLimit: 256 });
  expect(() =>
    feed(
      createFrameDecoder({ from: "client", messageLimit: 1024 }),
      small.encode(pushOf(4096)),
    ),
  ).toThrow(tooLarge);
  expect(() =>
    createFrameDecoder({ from: "client", frameLimit: 256 }).push(bytes(257)),
  ).toThrow(tooLarge);
  const d = createFrameDecoder({ from: "client", maxPartial: 2 });
  const [a] = small.encode(pushOf(600));
  const [b] = small.encode(pushOf(600));
  const [c] = small.encode(pushOf(600));
  expect(d.push(a!)).toBeNull();
  expect(d.push(b!)).toBeNull();
  expect(() => d.push(c!)).toThrow(tooLarge);
});

test("a finished message ID may be used again", () => {
  const frames = createFrameEncoder({ frameLimit: 256 }).encode(pushOf(600));
  const d = createFrameDecoder({ from: "client" });
  expect(feed(d, frames)).toEqual([pushOf(600)]);
  expect(feed(d, frames)).toEqual([pushOf(600)]);
});

test("a last chunk for an ID never started is a one-chunk message", () => {
  // type 5 · CHUNK · message 9 · nonce 7
  expect(
    createFrameDecoder({ from: "server" }).push(
      new Uint8Array([5, 0b1000, 9, 7]),
    ),
  ).toEqual({
    type: "PING",
    nonce: 7,
  });
});

test("a chunk is the common header, the message ID, then its share of the body", () => {
  const frames = createFrameEncoder({ frameLimit: 8 }).encode({
    type: "AUTH_REFRESH",
    ticket: "abcdefgh",
  });
  expect(frames.map((f) => [...f])).toEqual([
    [3, 0b1001, 1, 8, 97, 98, 99, 100], // type 3 · CHUNK|MORE · message 1 · the varstring's length and "abcd"
    [3, 0b1000, 1, 101, 102, 103, 104], // type 3 · CHUNK · message 1 · "efgh"
  ]);
  expect(() =>
    createFrameEncoder({ frameLimit: 3 }).encode({
      type: "AUTH_REFRESH",
      ticket: "abcdefgh",
    }),
  ).toThrow(RangeError);
});

test("chunks of one message must agree about what it is", () => {
  const [c1, c2] = createFrameEncoder({ frameLimit: 256 }).encode(
    pushOf(300),
  ) as [Uint8Array, Uint8Array];
  const other = c2.slice();
  other[3] = other[3]! ^ 1; // the same message ID under another document ID
  const d = createFrameDecoder({ from: "client" });
  d.push(c1);
  expect(() => d.push(other)).toThrow(ProtocolError); // 4400
  const fresh = createFrameDecoder({ from: "client" });
  fresh.push(c1);
  expect(() => fresh.push(other)).toThrow(badFrame);
});

test("a chunked message from a sender that may not send it is refused at its first chunk", () => {
  const [c1] = createFrameEncoder({ frameLimit: 256 }).encode(pushOf(600));
  expect(() => createFrameDecoder({ from: "server" }).push(c1!)).toThrow(
    badFrame,
  );
});

test("a chunked message of an unknown type is dropped chunk by chunk and counted once", () => {
  const d = createFrameDecoder({ from: "server" });
  expect(d.push(new Uint8Array([27, 0b1001, 5, 1, 2, 3]))).toBeNull(); // type 27 · CHUNK|MORE · message 5: nothing kept
  expect(d.skipped).toBe(0);
  expect(d.push(new Uint8Array([27, 0b1000, 5, 4]))).toBeNull(); // its last chunk
  expect(d.skipped).toBe(1);
});

test("skipped frames are counted", () => {
  const d = createFrameDecoder({ from: "server" });
  expect(d.push(new Uint8Array([27, 0, 9]))).toBeNull();
  expect(d.push(new Uint8Array([6, 0]))).toBeNull();
  expect(d.skipped).toBe(2);
});

test("chunks handed over as Buffers are copied, not kept as views", () => {
  const push = pushOf(600);
  const frames = createFrameEncoder({ frameLimit: 256 })
    .encode(push)
    .map((f) => Buffer.from(f));
  const d = createFrameDecoder({ from: "client" });
  let out: Message | null = null;
  for (const f of frames) {
    out = d.push(f);
    f.fill(0); // the socket reuses its buffer
  }
  expect(out).toEqual(push);
});

test("a client SYNC step2 or update is refused at its first chunk", () => {
  for (const step of ["step2", "update"] as const) {
    const [first] = createFrameEncoder({ frameLimit: 256 }).encode({
      ...syncUpdate(DOC, bytes(2000)),
      step,
    } as Message);
    expect(() => createFrameDecoder({ from: "client" }).push(first!)).toThrow(
      badFrame,
    );
  }
  const step1 = { ...syncUpdate(DOC, bytes(2000)), step: "step1" } as Message;
  const frames = createFrameEncoder({ frameLimit: 256 }).encode(step1);
  expect(feed(createFrameDecoder({ from: "client" }), frames)).toEqual([step1]);
});

const withFlag = (frame: Uint8Array, flag: number) => {
  const out = frame.slice();
  out[1] = out[1]! | flag;
  return out;
};

test("when the first chunk is skipped, the rest of its message is skipped with it", () => {
  const enc = createFrameEncoder({ frameLimit: 256 });
  const awareness: Message = {
    type: "AWARENESS",
    docId: DOC,
    generation: 1,
    update: bytes(700),
  };
  const [first, ...rest] = enc.encode(awareness);
  expect(rest.length).toBeGreaterThan(1);
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(withFlag(first!, UNKNOWN_FLAG))).toBeNull();
  for (const f of rest) expect(d.push(f)).toBeNull(); // never the middle chunks read as a whole
  expect(d.skipped).toBe(1);
  const next = syncUpdate(DOC, bytes(600)); // nothing left pending: room for one more
  expect(feed(d, enc.encode(next))).toEqual([next]);
});

test("a chunk that must be skipped drops the message it belongs to", () => {
  const enc = createFrameEncoder({ frameLimit: 256 });
  const [c1, c2, c3] = enc.encode(syncUpdate(DOC, bytes(600)));
  expect(c3).toBeDefined();
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(c1!)).toBeNull();
  expect(d.push(withFlag(c2!, UNKNOWN_FLAG))).toBeNull();
  expect(d.push(c3!)).toBeNull(); // dropped with its message, not decoded as one on its own
  expect(d.skipped).toBe(1);
  const next = syncUpdate(DOC, bytes(600));
  expect(feed(d, enc.encode(next))).toEqual([next]);
});

test("messages being skipped count against maxPartial", () => {
  const d = createFrameDecoder({ from: "server", maxPartial: 1 });
  expect(d.push(new Uint8Array([27, CHUNK | MORE, 5, 1]))).toBeNull();
  const [first] = createFrameEncoder({ frameLimit: 256 }).encode(
    syncUpdate(DOC, bytes(600)),
  );
  expect(() => d.push(first!)).toThrow(tooLarge);
});

test("MORE without CHUNK is skipped and counted", () => {
  const d = createFrameDecoder({ from: "server" });
  expect(d.push(new Uint8Array([5, MORE, 7]))).toBeNull();
  expect(d.skipped).toBe(1);
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
  const frame = createFrameEncoder().encode(pushOf(2000))[0]!;
  expect(() =>
    createFrameDecoder({
      from: "client",
      frameLimit: 4096,
      messageLimit: 1024,
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
        type: fc.integer({ min: 27, max: 255 }),
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
      (messages, junk, frameLimit, picks) => {
        const enc = createFrameEncoder({ frameLimit });
        const queues = [...messages.map((m) => enc.encode(m)), [...junk]];
        const d = createFrameDecoder({
          from: "server",
          frameLimit,
          maxPartial: 3,
        });
        const pick = picks[Symbol.iterator]();
        for (;;) {
          const open = queues.filter((q) => q.length > 0);
          if (open.length === 0) return;
          const queue = open[pick.next().value! % open.length]!;
          let out: Message | null;
          try {
            out = d.push(queue.shift()!);
          } catch (e) {
            expect(e).toBeInstanceOf(ProtocolError);
            expect([4400, 4413]).toContain((e as ProtocolError).code);
            return; // the connection closes
          }
          if (out !== null) expect(messages).toContainEqual(out);
        }
      },
    ),
    { numRuns: 1000 },
  );
});
