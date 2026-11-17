import { expect, test } from "bun:test";
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
        for (const f of frames)
          expect(f.byteLength).toBeLessThanOrEqual(frameLimit);
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
