import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import fc from "fast-check";
import {
  CAPABILITIES,
  CODE,
  CONTROL_KINDS,
  DOC_ROLES,
  FRAME,
  ProtocolError,
  SUBSCRIBE_MODES,
  SYNC_STEPS,
  VERSION_FIELDS,
  decodeMessage,
  encodeMessage,
  isPermanentPushError,
} from "../src/index.ts";
import type { Message, Sender } from "../src/index.ts";
import {
  ACK_SAMPLE,
  AUTH_EXPIRING_SAMPLE,
  AUTH_REFRESH_SAMPLE,
  AWARENESS_SAMPLE,
  CONTROL_SAMPLE,
  DOC_ID,
  ERROR_SAMPLE,
  GENERATION_MOVED_SAMPLE,
  HELLO_SAMPLE,
  ONE_OF_EACH,
  PING_SAMPLE,
  PONG_SAMPLE,
  PUSH_SAMPLE,
  SERVER_ONLY_SAMPLES,
  SUBSCRIBED_SAMPLE,
  SUBSCRIBE_SAMPLE,
  SYNC_SAMPLE,
  SYNC_STEP2_SAMPLE,
  SYNC_UPDATE_SAMPLE,
  UNSUBSCRIBE_SAMPLE,
  VIEW_PATCH_SAMPLE,
  VIEW_SNAPSHOT_SAMPLE,
  WELCOME_SAMPLE,
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

test("each frame starts with its type number", () => {
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
    [5, 1, 7], // MORE without CHUNK
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
  const frame = encodeMessage({
    ...SUBSCRIBED_SAMPLE,
    capabilities: ["delete"],
  });
  const at = 2 + 16 + 1 + 1; // header, docId, generation, role
  expect(frame[at]).toBe(1); // one capability
  expect(frame[at + 1]).toBe(4); // "delete"
  frame[at + 1] = 99; // a capability a newer build added
  expect(decodeMessage(frame, "server")).toEqual({
    ...SUBSCRIBED_SAMPLE,
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
  const buffer = Buffer.from(encodeMessage(PUSH_SAMPLE)); // how a Bun socket hands frames over
  const fromBuffer = decodeMessage(buffer, "client");
  buffer.fill(0);
  expect(fromBuffer).toEqual(PUSH_SAMPLE);
});

test("a string that is not well-formed UTF-16 is refused at encode", () => {
  for (const ticket of ["a\uD800", "\uDC00b", "\uDC00\uD800"])
    expect(() => encodeMessage({ type: "AUTH_REFRESH", ticket })).toThrow(
      TypeError,
    );
  const pair = { type: "AUTH_REFRESH", ticket: "\uD83D\uDE00" } as const; // one emoji, a valid pair
  expect(decodeMessage(encodeMessage(pair), "client")).toEqual(pair);
});

test("each union is one list, and the generators draw from it", () => {
  expect(DOC_ROLES).toEqual(["owner", "edit", "comment", "view"]);
  expect(CAPABILITIES).toEqual([
    "send_to_prompter",
    "edit_rundowns",
    "issue_revisions",
    "lock_page_numbers",
    "delete",
  ]);
  expect(SUBSCRIBE_MODES).toEqual(["edit", "view", "prompter"]);
  expect(SYNC_STEPS).toEqual(["step1", "step2", "update"]);
  expect(VERSION_FIELDS).toEqual(["protocol", "schema", "engine", "table"]);
  expect(CONTROL_KINDS).toEqual([
    "version_created",
    "draft_named",
    "revision_issued",
    "revision_recalled",
    "lock_anchors_changed",
    "layout_changed",
    "membership_changed",
    "restored",
    "sent_to_prompter",
    "upstream_status",
  ]);
});

test("only 4400, 4413 and 4422 are permanent for a push", () => {
  expect(Object.values(CODE).filter(isPermanentPushError)).toEqual([
    4400, 4413, 4422,
  ]);
});

// Golden bytes: every frame type, each union tag and each nullable tag, fixed by hand from the
// layout. A round trip cannot catch an encoder and a decoder reordered the same way; these can.
// The document prefix is docId 01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd · generation 2.
const DOC_PREFIX = "01a1e81dc6f27301a0f65c345eb6c7cd 02";
const GOLDEN: [name: string, message: Message, from: Sender, hex: string][] = [
  ["HELLO", HELLO_SAMPLE, "client", "00 00 | 01 01 00 00 | 01 62 | 01 64"],
  [
    "WELCOME",
    WELCOME_SAMPLE,
    "server",
    "01 00 | 02 7531 | 09 416461205175696c6c | 8020 808004 | 01 01 00 00 | 01 01 00 00",
  ],
  ["AUTH_EXPIRING", AUTH_EXPIRING_SAMPLE, "server", "02 00 | 1e"],
  ["AUTH_REFRESH", AUTH_REFRESH_SAMPLE, "client", "03 00 | 01 74"],
  [
    "ERROR with a document",
    ERROR_SAMPLE,
    "server",
    `04 04 | ${DOC_PREFIX} | b322 | 02 6e6f | 01 f403 | 01`,
  ],
  [
    "ERROR without a document",
    {
      type: "ERROR",
      code: 4429,
      message: "slow",
      retryAfterMs: null,
      permanent: false,
      doc: null,
    },
    "server",
    "04 00 | cd22 | 04 736c6f77 | 00 | 00",
  ],
  ["PING", PING_SAMPLE, "client", "05 00 | 01"],
  ["PONG", PONG_SAMPLE, "server", "05 02 | 01"],
  [
    "SUBSCRIBE",
    SUBSCRIBE_SAMPLE,
    "client",
    `10 00 | ${DOC_PREFIX} | 01 | 02 05 06 | 00`,
  ],
  [
    "SUBSCRIBED with a lock table, a revision and an air window",
    SUBSCRIBED_SAMPLE,
    "server",
    `11 00 | ${DOC_PREFIX} | 01 | 02 04 00 | 0a 01 01 00 | 01 01 01 00 03313241 026231 03 ` +
      "0948652077616974732e 01 026230 | 01 027331 027631 | 01 e807 d00f",
  ],
  [
    "SUBSCRIBED with a lock hash",
    {
      ...SUBSCRIBED_SAMPLE,
      lockAnchors: { hash: new Uint8Array([0xab, 0xcd]) },
    },
    "server",
    `11 00 | ${DOC_PREFIX} | 01 | 02 04 00 | 0a 01 01 00 | 02 02abcd | 01 027331 027631 | 01 e807 d00f`,
  ],
  [
    "SUBSCRIBED with every nullable empty",
    {
      ...SUBSCRIBED_SAMPLE,
      capabilities: [],
      lockAnchors: null,
      revision: null,
      airWindow: null,
    },
    "server",
    `11 00 | ${DOC_PREFIX} | 01 | 00 | 0a 01 01 00 | 00 | 00 | 00`,
  ],
  [
    "GENERATION_MOVED",
    GENERATION_MOVED_SAMPLE,
    "server",
    `12 00 | ${DOC_PREFIX} | 03`,
  ],
  ["UNSUBSCRIBE", UNSUBSCRIBE_SAMPLE, "client", `13 00 | ${DOC_PREFIX}`],
  ["SYNC step1", SYNC_SAMPLE, "client", `14 00 | ${DOC_PREFIX} | 00 | 01 00`],
  [
    "SYNC step2",
    SYNC_STEP2_SAMPLE,
    "server",
    `14 00 | ${DOC_PREFIX} | 01 | 02 0000`,
  ],
  [
    "SYNC update",
    SYNC_UPDATE_SAMPLE,
    "server",
    `14 00 | ${DOC_PREFIX} | 02 | 02 0000`,
  ],
  [
    "PUSH",
    PUSH_SAMPLE,
    "client",
    `15 00 | ${DOC_PREFIX} | 04 | 04 01020304 | 01`,
  ],
  ["ACK", ACK_SAMPLE, "server", `16 00 | ${DOC_PREFIX} | 04 | 5a`],
  ["AWARENESS", AWARENESS_SAMPLE, "client", `17 00 | ${DOC_PREFIX} | 01 09`],
  [
    "CONTROL",
    CONTROL_SAMPLE,
    "server",
    `18 00 | ${DOC_PREFIX} | 07 | 01 | 02 7b7d`,
  ],
  [
    "VIEW_SNAPSHOT",
    VIEW_SNAPSHOT_SAMPLE,
    "server",
    `19 00 | ${DOC_PREFIX} | 01 | 02 7b7d`,
  ],
  [
    "VIEW_PATCH",
    VIEW_PATCH_SAMPLE,
    "server",
    `1a 00 | ${DOC_PREFIX} | 02 | 02 5b5d`,
  ],
];
const fromHex = (hex: string) =>
  new Uint8Array(
    Buffer.from(hex.replaceAll(new RegExp("[ |]", "g"), ""), "hex"),
  );

test("every frame type has fixed bytes", () => {
  const covered = new Set(GOLDEN.map(([, m]) => m.type));
  expect(ONE_OF_EACH.every((m) => covered.has(m.type))).toBe(true);
  for (const [name, message, from, hex] of GOLDEN) {
    const bytes = fromHex(hex);
    expect({ name, bytes: [...encodeMessage(message)] }).toEqual({
      name,
      bytes: [...bytes],
    });
    expect({ name, message: decodeMessage(bytes, from) }).toEqual({
      name,
      message,
    });
  }
});
