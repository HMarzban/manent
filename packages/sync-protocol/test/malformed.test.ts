import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  ProtocolError,
  createFrameDecoder,
  decodeMessage,
  encodeMessage,
} from "../src/index.ts";
import { arbMessage, senderOf } from "./arbitraries.ts";

test("arbitrary bytes are a message, a skip or a ProtocolError, never anything else", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ maxLength: 512 }),
      fc.constantFrom("client", "server"),
      (b, from) => {
        try {
          createFrameDecoder({ from }).push(b);
        } catch (e) {
          expect(e).toBeInstanceOf(ProtocolError);
        }
      },
    ),
    { numRuns: 20_000 },
  );
});

test("every strict prefix of a valid frame is refused or skipped, never mis-read as the whole", () => {
  fc.assert(
    fc.property(
      arbMessage,
      fc.double({ min: 0, max: 1, maxExcluded: true }),
      (m, at) => {
        const frame = encodeMessage(m);
        const prefix = frame.subarray(0, Math.floor(at * frame.byteLength));
        try {
          expect(decodeMessage(prefix, senderOf(m))).not.toEqual(m);
        } catch (e) {
          expect(e).toBeInstanceOf(ProtocolError);
          expect((e as ProtocolError).code).toBe(4400);
        }
      },
    ),
    { numRuns: 2000 },
  );
});

test("a flipped bit never escapes as another error", () => {
  fc.assert(
    fc.property(
      arbMessage,
      fc.nat(),
      fc.integer({ min: 0, max: 7 }),
      (m, i, bit) => {
        const frame = encodeMessage(m);
        frame[i % frame.byteLength]! ^= 1 << bit;
        try {
          createFrameDecoder({ from: senderOf(m) }).push(frame);
        } catch (e) {
          expect(e).toBeInstanceOf(ProtocolError);
        }
      },
    ),
    { numRuns: 5000 },
  );
});
