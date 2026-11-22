import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import fc from "fast-check";
import {
  CAPABILITIES,
  CODE,
  CONTROL_KINDS,
  DOC_ROLES,
  FRAME,
  LOCK_SOURCES,
  PROTOCOL_VERSION,
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
  ANCHOR_SAMPLE,
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
  SET_SAMPLE,
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
  badFrame,
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
  ]).toEqual([0, 0, 4, 1, 1, 0, 0, 1, 98, 1, 100]);
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
    clientSeq: null,
  });
  expect([...frame]).toEqual([
    4, 4, 0x01, 0xa1, 0xe8, 0x1d, 0xc6, 0xf2, 0x73, 0x01, 0xa0, 0xf6, 0x5c,
    0x34, 0x5e, 0xb6, 0xc7, 0xcd, 3, 0xbd, 0x22, 0, 0, 1, 0,
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
    [28, 0, 1, 2, 3],
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
    clientSeq: null,
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
    "upstream_refused",
    "copies_kept",
  ]);
});

// Golden bytes: every frame type, each union tag and each nullable tag, fixed by hand from the
// layout. A round trip cannot catch an encoder and a decoder reordered the same way; these can.
// The document prefix is docId 01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd · generation 2.
const DOC = "01a1e81dc6f27301a0f65c345eb6c7cd 02";
const GOLDEN: [name: string, message: Message, from: Sender, hex: string][] = [
  ["HELLO", HELLO_SAMPLE, "client", "00 00 | 04 01 01 00 00 | 01 62 | 01 64"],
  [
    "WELCOME",
    WELCOME_SAMPLE,
    "server",
    "01 00 | 0d 02 7531 09 416461205175696c6c | 05 8020 808004 | 04 01 01 00 00 | 04 01 01 00 00",
  ],
  ["AUTH_EXPIRING", AUTH_EXPIRING_SAMPLE, "server", "02 00 | b0ea01"],
  ["AUTH_REFRESH", AUTH_REFRESH_SAMPLE, "client", "03 00 | 01 74"],
  [
    "ERROR with a document",
    ERROR_SAMPLE,
    "server",
    `04 04 | ${DOC} | b322 | 02 6e6f | 01 f403 | 01 | 00`,
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
      clientSeq: null,
    },
    "server",
    "04 00 | cd22 | 04 736c6f77 | 00 | 00 | 00",
  ],
  [
    "ERROR refusing one entry",
    {
      type: "ERROR",
      code: 4423,
      message: "locked",
      retryAfterMs: null,
      permanent: false,
      doc: { docId: DOC_ID, generation: 2 },
      clientSeq: 5,
    },
    "server",
    `04 04 | ${DOC} | c722 | 06 6c6f636b6564 | 00 | 00 | 01 05`,
  ],
  ["PING", PING_SAMPLE, "client", "05 00 | 01"],
  ["PONG", PONG_SAMPLE, "server", "05 02 | 01"],
  [
    "SUBSCRIBE",
    SUBSCRIBE_SAMPLE,
    "client",
    `10 00 | ${DOC} | 01 | 02 05 06 | 00`,
  ],
  [
    "SUBSCRIBED with a lock table, a revision and an air window",
    SUBSCRIBED_SAMPLE,
    "server",
    `11 00 | ${DOC} | 01 | 02 04 00 | 0a 01 01 00 | 01 01 19 01 00 03313241 026231 03 ` +
      "0948652077616974732e 01 026230 01 | 01 06 027331 027631 | 01 04 e807 d00f",
  ],
  [
    "SUBSCRIBED with a lock hash",
    {
      ...SUBSCRIBED_SAMPLE,
      lockAnchors: { hash: new Uint8Array([0xab, 0xcd]) },
    },
    "server",
    `11 00 | ${DOC} | 01 | 02 04 00 | 0a 01 01 00 | 02 02abcd | 01 06 027331 027631 | 01 04 e807 d00f`,
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
    `11 00 | ${DOC} | 01 | 00 | 0a 01 01 00 | 00 | 00 | 00`,
  ],
  [
    "GENERATION_MOVED",
    GENERATION_MOVED_SAMPLE,
    "server",
    `12 00 | ${DOC} | 03`,
  ],
  ["UNSUBSCRIBE", UNSUBSCRIBE_SAMPLE, "client", `13 00 | ${DOC}`],
  ["SYNC step1", SYNC_SAMPLE, "client", `14 00 | ${DOC} | 00 | 01 00`],
  ["SYNC step2", SYNC_STEP2_SAMPLE, "server", `14 00 | ${DOC} | 01 | 02 0000`],
  [
    "SYNC update",
    SYNC_UPDATE_SAMPLE,
    "server",
    `14 00 | ${DOC} | 02 | 02 0000`,
  ],
  ["PUSH", PUSH_SAMPLE, "client", `15 00 | ${DOC} | 04 | 04 01020304 | 01`],
  ["ACK", ACK_SAMPLE, "server", `16 00 | ${DOC} | 04 | 5a`],
  ["AWARENESS", AWARENESS_SAMPLE, "client", `17 00 | ${DOC} | 01 09`],
  ["CONTROL", CONTROL_SAMPLE, "server", `18 00 | ${DOC} | 07 | 01 | 02 7b7d`],
  [
    "CONTROL upstream_refused",
    { ...CONTROL_SAMPLE, seq: 8, kind: "upstream_refused" },
    "server",
    `18 00 | ${DOC} | 08 | 0a | 02 7b7d`,
  ],
  [
    "VIEW_SNAPSHOT",
    VIEW_SNAPSHOT_SAMPLE,
    "server",
    `19 00 | ${DOC} | 01 | 02 7b7d`,
  ],
  ["VIEW_PATCH", VIEW_PATCH_SAMPLE, "server", `1a 00 | ${DOC} | 02 | 02 5b5d`],
  [
    "SET",
    SET_SAMPLE,
    "client",
    `1b 00 | ${DOC} | 05 | 0c 7363726970742e7061706572 | 04 22613422`,
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

test("a newer build may add a field inside a struct", () => {
  const anchor =
    "1a 01 00 03313241 026231 03 0948652077616974732e 01 026230 01 7f"; // one more byte than this build reads
  const frame = fromHex(
    `11 00 | ${DOC} | 01 | 02 04 00 | 0a 01 01 00 | 01 01 ${anchor} | 01 06 027331 027631 | 01 04 e807 d00f`,
  );
  expect(decodeMessage(frame, "server")).toEqual(SUBSCRIBED_SAMPLE);
  expect(
    decodeMessage(
      fromHex("00 00 | 05 01 01 00 00 09 | 01 62 | 01 64"),
      "client",
    ),
  ).toEqual(HELLO_SAMPLE); // a fifth version number
});

test("a struct that ends before a field this build needs is refused", () => {
  for (const hex of [
    "00 00 | 03 01 01 00 | 01 62 | 01 64",
    "00 00 | 09 01 01 00 00",
  ])
    // three numbers; a length past the frame's end
    expect(() => decodeMessage(fromHex(hex), "client")).toThrow(badFrame);
});

test("an unknown lock source skips the frame", () => {
  const frame = encodeMessage(SUBSCRIBED_SAMPLE);
  const body = frame.subarray(19); // header, document, generation
  body[10 + body[10]!] = 3; // body[10] is the anchor's length (the sample has two capabilities); its last byte is the source
  expect(decodeMessage(frame, "server")).toBeNull();
});

/** A document frame's body: after the header, the document and a one-byte generation. */
const bodyOf = (m: Message) => encodeMessage(m).subarray(19);

test("each union member travels as its fixed index", () => {
  const INDEX = {
    role: { owner: 0, edit: 1, comment: 2, view: 3 },
    capability: {
      send_to_prompter: 0,
      edit_rundowns: 1,
      issue_revisions: 2,
      lock_page_numbers: 3,
      delete: 4,
    },
    mode: { edit: 0, view: 1, prompter: 2 },
    step: { step1: 0, step2: 1, update: 2 },
    source: { lock: 0, issue: 1, import: 2 },
    kind: {
      version_created: 0,
      draft_named: 1,
      revision_issued: 2,
      revision_recalled: 3,
      lock_anchors_changed: 4,
      layout_changed: 5,
      membership_changed: 6,
      restored: 7,
      sent_to_prompter: 8,
      upstream_status: 9,
      upstream_refused: 10,
    },
  } as const;
  const subscribed = { ...SUBSCRIBED_SAMPLE, capabilities: [] };
  for (const [role, i] of Object.entries(INDEX.role))
    expect(bodyOf({ ...subscribed, role } as Message)[0]).toBe(i);
  for (const [c, i] of Object.entries(INDEX.capability))
    expect(bodyOf({ ...subscribed, capabilities: [c] } as Message)[2]).toBe(i);
  for (const [mode, i] of Object.entries(INDEX.mode))
    expect(bodyOf({ ...SUBSCRIBE_SAMPLE, mode } as Message)[0]).toBe(i);
  for (const [step, i] of Object.entries(INDEX.step))
    expect(bodyOf({ ...SYNC_SAMPLE, step } as Message)[0]).toBe(i);
  for (const [kind, i] of Object.entries(INDEX.kind))
    expect(bodyOf({ ...CONTROL_SAMPLE, seq: 1, kind } as Message)[1]).toBe(i);
  for (const [source, i] of Object.entries(INDEX.source)) {
    const b = bodyOf({
      ...subscribed,
      lockAnchors: { table: [{ ...ANCHOR_SAMPLE, source }] },
    } as Message);
    expect(b[8 + b[8]!]).toBe(i); // with no capability the anchor's length byte is body[8]
  }
  expect(
    [
      DOC_ROLES,
      CAPABILITIES,
      SUBSCRIBE_MODES,
      SYNC_STEPS,
      LOCK_SOURCES,
      CONTROL_KINDS,
    ].map((list) => list.length),
  ).toEqual([4, 5, 3, 3, 3, 12]);
});

test("the codes, the frame numbers and the protocol version are fixed; a changed vector means a new version", () => {
  expect(PROTOCOL_VERSION).toBe(1);
  expect(CODE).toEqual({
    BAD_FRAME: 4400,
    UNAUTHENTICATED: 4401,
    FORBIDDEN: 4403,
    TOO_OLD: 4408,
    GENERATION_MISMATCH: 4409,
    DOCUMENT_DELETED: 4410,
    TOO_LARGE: 4413,
    VALIDATION_FAILED: 4422,
    SETTING_REFUSED: 4423,
    RATE_LIMITED: 4429,
    STORAGE_FAILED: 1011,
    RESTARTING: 1012,
  });
  expect(FRAME).toEqual({
    HELLO: 0,
    WELCOME: 1,
    AUTH_EXPIRING: 2,
    AUTH_REFRESH: 3,
    ERROR: 4,
    PING: 5,
    SUBSCRIBE: 16,
    SUBSCRIBED: 17,
    GENERATION_MOVED: 18,
    UNSUBSCRIBE: 19,
    SYNC: 20,
    PUSH: 21,
    ACK: 22,
    AWARENESS: 23,
    CONTROL: 24,
    VIEW_SNAPSHOT: 25,
    VIEW_PATCH: 26,
    SET: 27,
  });
  expect(Object.values(CODE).filter(isPermanentPushError)).toEqual([
    4400, 4413, 4422,
  ]); // 4423 refuses one entry and nothing else
});

test("only a client sends SET", () => {
  expect(() => decodeMessage(encodeMessage(SET_SAMPLE), "server")).toThrow(
    badFrame,
  );
  expect(decodeMessage(encodeMessage(SET_SAMPLE), "client")).toEqual(
    SET_SAMPLE,
  );
});
