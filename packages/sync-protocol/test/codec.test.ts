import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  CODE,
  FRAME,
  ProtocolError,
  decodeMessage,
  encodeMessage,
  isPermanentPushError,
} from "../src/index.ts";
import {
  DOC_ID,
  HELLO_SAMPLE,
  ONE_OF_EACH,
  PUSH_SAMPLE,
  SERVER_ONLY_SAMPLES,
  arbMessage,
  concat,
  senderOf,
} from "./arbitraries.ts";

test("every message round-trips", () => {
  fc.assert(
    fc.property(arbMessage, (m) => {
      expect(decodeMessage(encodeMessage(m), senderOf(m))).toEqual(m);
    }),
    { numRuns: 2000 },
  );
});

test("each frame starts with its design number", () => {
  for (const m of ONE_OF_EACH)
    expect(encodeMessage(m)[0]).toBe(
      FRAME[m.type === "PONG" ? "PING" : m.type],
    );
});

test("a document frame is type · flags · docId · generation · body", () => {
  expect([
    ...encodeMessage({
      type: "ACK",
      docId: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
      generation: 3,
      clientSeq: 5,
      serverSeq: 300,
    }),
  ]).toEqual([
    22, 0, 0x01, 0xa1, 0xe8, 0x1d, 0xc6, 0xf2, 0x73, 0x01, 0xa0, 0xf6, 0x5c,
    0x34, 0x5e, 0xb6, 0xc7, 0xcd, 3, 5, 0xac, 0x02,
  ]);
});

test("HELLO bytes are frozen", () => {
  expect([
    ...encodeMessage({
      type: "HELLO",
      versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
      build: "b",
      deviceId: "d",
    }),
  ]).toEqual([0, 0, 1, 1, 0, 0, 1, 98, 1, 100]);
});

test("PING and PONG share frame 5", () => {
  expect([...encodeMessage({ type: "PING", nonce: 7 })]).toEqual([5, 0, 7]);
  expect([...encodeMessage({ type: "PONG", nonce: 7 })]).toEqual([5, 2, 7]);
});

test("a document ID is canonical", () => {
  const m = {
    type: "UNSUBSCRIBE",
    docId: "01A1E81D-C6F2-7301-A0F6-5C345EB6C7CD",
    generation: 1,
  } as const;
  expect(decodeMessage(encodeMessage(m), "client")).toEqual({
    ...m,
    docId: m.docId.toLowerCase(),
  });
  expect(() => encodeMessage({ ...m, docId: "not-a-uuid" })).toThrow(TypeError);
});

test("a number that is not a non-negative safe integer is refused at encode", () => {
  for (const nonce of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])
    expect(() => encodeMessage({ type: "PING", nonce })).toThrow(TypeError);
});

test("an ERROR about a document carries it after the HAS_DOC flag", () => {
  const frame = encodeMessage({
    type: "ERROR",
    code: CODE.TOO_LARGE,
    message: "",
    retryAfterMs: null,
    permanent: true,
    doc: { docId: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd", generation: 3 },
  });
  expect([...frame]).toEqual([
    4, 4, 0x01, 0xa1, 0xe8, 0x1d, 0xc6, 0xf2, 0x73, 0x01, 0xa0, 0xf6, 0x5c,
    0x34, 0x5e, 0xb6, 0xc7, 0xcd, 3, 0xbd, 0x22, 0, 0, 1,
  ]);
});

test("a client can never emit a server frame", () => {
  for (const m of SERVER_ONLY_SAMPLES)
    // one of each server-only type, plus SYNC step2 and SYNC update
    expect(() => decodeMessage(encodeMessage(m), "client")).toThrow(
      ProtocolError,
    );
  expect(() => decodeMessage(encodeMessage(HELLO_SAMPLE), "server")).toThrow(
    ProtocolError,
  );
});

test("an unknown frame type is skipped, not fatal", () => {
  for (const frame of [
    [6, 0],
    [15, 0],
    [27, 0, 1, 2, 3],
    [127, 0], // unknown types, connection and document: nothing after the flags is read
    [5, 0x80, 7],
    [22, 2, 0],
    [5, 4, 7], // an unknown flag bit; PONG on an ACK; HAS_DOC on a heartbeat
  ])
    expect(decodeMessage(new Uint8Array(frame), "server")).toBeNull();
  for (const frame of [[], [5], [127]])
    // shorter than the two bytes every frame has
    expect(() => decodeMessage(new Uint8Array(frame), "server")).toThrow(
      ProtocolError,
    );
  expect(() => decodeMessage(new Uint8Array([22, 0, 1, 2]), "server")).toThrow(
    ProtocolError,
  ); // a known frame cut short
});

test("an unknown union member makes the frame a skip", () => {
  expect(
    decodeMessage(
      new Uint8Array([24, 0, ...new Uint8Array(16), 1, 0, 200, 0]),
      "server",
    ),
  ).toBeNull(); // CONTROL kind 200
  expect(
    decodeMessage(
      new Uint8Array([20, 0, ...new Uint8Array(16), 1, 3, 0]),
      "client",
    ),
  ).toBeNull(); // SYNC step 3
});

test("an unknown capability is dropped from the list", () => {
  const sample = SERVER_ONLY_SAMPLES.find((m) => m.type === "SUBSCRIBED")!;
  const frame = encodeMessage({
    ...sample,
    capabilities: ["delete"],
  } as typeof sample);
  const at = 2 + 16 + 1 + 1; // header, docId, generation, role
  expect(frame[at]).toBe(1); // one capability
  expect(frame[at + 1]).toBe(4); // "delete"
  frame[at + 1] = 99; // a capability a newer build added
  expect(decodeMessage(frame, "server")).toEqual({
    ...sample,
    capabilities: [],
  });
});

test("a chunk is never a whole message on its own", () => {
  expect(() =>
    decodeMessage(new Uint8Array([5, 0b1000, 1, 7]), "server"),
  ).toThrow(ProtocolError);
});

test("a frame over the frame limit is refused at encode", () => {
  const update = new Uint8Array(4 * 1024 * 1024);
  expect(() =>
    encodeMessage({
      type: "PUSH",
      docId: DOC_ID,
      generation: 1,
      clientSeq: 1,
      heal: false,
      update,
    }),
  ).toThrow(RangeError);
});

test("a decode failure is a ProtocolError with code 4400", () => {
  try {
    decodeMessage(new Uint8Array([22, 0, 1, 2]), "server");
    throw new Error("expected a throw");
  } catch (e) {
    expect(e).toBeInstanceOf(ProtocolError);
    expect((e as ProtocolError).code).toBe(4400);
    expect((e as ProtocolError).name).toBe("ProtocolError");
  }
});

test("an ERROR code from a newer build is kept as its number", () => {
  const m = {
    type: "ERROR",
    code: 4499,
    message: "",
    retryAfterMs: null,
    permanent: false,
    doc: null,
  } as const;
  expect(decodeMessage(encodeMessage(m), "server")).toEqual(m);
});

test("fields added after the ones this build knows are ignored", () => {
  fc.assert(
    fc.property(
      arbMessage,
      fc.uint8Array({ minLength: 1, maxLength: 8 }),
      (m, extra) => {
        expect(
          decodeMessage(concat(encodeMessage(m), extra), senderOf(m)),
        ).toEqual(m);
      },
    ),
  );
});

test("decoded bytes do not alias the input", () => {
  const frame = encodeMessage(PUSH_SAMPLE);
  const m = decodeMessage(frame, "client");
  frame.fill(0);
  expect(m).toEqual(PUSH_SAMPLE);
});

test("only 4400, 4413 and 4422 are permanent for a push", () => {
  expect(Object.values(CODE).filter(isPermanentPushError)).toEqual([
    4400, 4413, 4422,
  ]);
});
