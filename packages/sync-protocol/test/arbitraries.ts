// Generators, samples and matchers shared by the sync-protocol tests.
import { expect } from "bun:test";
import fc from "fast-check";
import {
  CAPABILITIES,
  CODE,
  CONTROL_KINDS,
  DOC_ROLES,
  LOCK_SOURCES,
  SUBSCRIBE_MODES,
  SYNC_STEPS,
} from "../src/index.ts";
import type {
  DocRef,
  LockAnchorRecord,
  Message,
  Sender,
  VersionSet,
} from "../src/index.ts";

const num = fc.oneof(fc.nat(), fc.maxSafeNat());
const text = fc.string({ unit: "grapheme", maxLength: 40 });
const bytes = fc.uint8Array({ maxLength: 2048 });
const nullable = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });
const uuid = fc.uuid().map((u) => u.toLowerCase());

const docRef: fc.Arbitrary<DocRef> = fc.record({
  docId: uuid,
  generation: num,
});
const versions: fc.Arbitrary<VersionSet> = fc.record({
  protocol: num,
  schema: num,
  engine: num,
  table: num,
});
const role = fc.constantFrom(...DOC_ROLES);
const capability = fc.constantFrom(...CAPABILITIES);
const mode = fc.constantFrom(...SUBSCRIBE_MODES);
const controlKind = fc.constantFrom(...CONTROL_KINDS);
const lockAnchor: fc.Arbitrary<LockAnchorRecord> = fc.record({
  level: num,
  order: num,
  label: text,
  blockId: text,
  offset: num,
  quote: text,
  fallbackIds: fc.array(text, { maxLength: 4 }),
  source: fc.constantFrom(...LOCK_SOURCES),
});

const withDoc = <T extends object>(
  body: fc.Arbitrary<T>,
): fc.Arbitrary<DocRef & T> =>
  fc.tuple(docRef, body).map(([ref, b]) => ({ ...ref, ...b }));

export const arbMessage: fc.Arbitrary<Message> = fc.oneof(
  fc.record({
    type: fc.constant("HELLO" as const),
    versions,
    build: text,
    deviceId: text,
  }),
  fc
    .record({
      type: fc.constant("WELCOME" as const),
      session: fc.record({ userId: text, name: text }),
      limits: fc.record({ frameBytes: num, messageBytes: num }),
      server: fc.record({ current: versions, min: versions }),
      webBuildId: fc.option(text, { nil: undefined }),
    })
    .map(({ webBuildId, ...rest }) =>
      webBuildId === undefined ? rest : { ...rest, webBuildId },
    ),
  fc.record({ type: fc.constant("AUTH_EXPIRING" as const), expiresInMs: num }),
  fc.record({ type: fc.constant("AUTH_REFRESH" as const), ticket: text }),
  fc.record({
    type: fc.constant("ERROR" as const),
    code: fc.constantFrom(...Object.values(CODE)),
    message: text,
    retryAfterMs: nullable(num),
    permanent: fc.boolean(),
    doc: nullable(docRef),
    clientSeq: nullable(num),
  }),
  fc.record({ type: fc.constant("PING" as const), nonce: num }),
  fc.record({ type: fc.constant("PONG" as const), nonce: num }),
  withDoc(
    fc.record({
      type: fc.constant("SUBSCRIBE" as const),
      mode,
      clientIds: fc.array(num, { maxLength: 8 }),
      lastServerSeq: num,
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("SUBSCRIBED" as const),
      role,
      capabilities: fc.array(capability, { maxLength: 5 }),
      headSeq: num,
      minSchemaVersion: num,
      engineVersion: num,
      lockLevel: num,
      lockAnchors: fc.oneof(
        fc.constant(null),
        fc.record({ table: fc.array(lockAnchor, { maxLength: 4 }) }),
        fc.record({ hash: bytes }),
      ),
      revision: nullable(fc.record({ setId: text, baselineVersionId: text })),
      airWindow: nullable(fc.record({ startsAt: num, endsAt: num })),
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("GENERATION_MOVED" as const),
      newGeneration: num,
    }),
  ),
  withDoc(fc.record({ type: fc.constant("UNSUBSCRIBE" as const) })),
  withDoc(
    fc.record({
      type: fc.constant("SYNC" as const),
      step: fc.constantFrom(...SYNC_STEPS),
      data: bytes,
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("PUSH" as const),
      clientSeq: num,
      update: bytes,
      heal: fc.boolean(),
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("SET" as const),
      clientSeq: num,
      key: text,
      value: bytes,
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("ACK" as const),
      clientSeq: num,
      serverSeq: num,
    }),
  ),
  withDoc(
    fc.record({ type: fc.constant("AWARENESS" as const), update: bytes }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("CONTROL" as const),
      seq: num,
      kind: controlKind,
      data: bytes,
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("VIEW_SNAPSHOT" as const),
      viewSeq: num,
      content: bytes,
    }),
  ),
  withDoc(
    fc.record({
      type: fc.constant("VIEW_PATCH" as const),
      viewSeq: num,
      patch: bytes,
    }),
  ),
);

const CLIENT_ONLY = new Set([
  "HELLO",
  "AUTH_REFRESH",
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "PUSH",
  "SET",
]);
const BOTH = new Set(["PING", "PONG", "AWARENESS"]);

/** A sender that is allowed to send `message`. */
export function senderOf(message: Message): Sender {
  if (message.type === "SYNC")
    return message.step === "step1" ? "client" : "server";
  if (CLIENT_ONLY.has(message.type)) return "client";
  if (BOTH.has(message.type)) return "client";
  return "server";
}

export const badFrame = expect.objectContaining({
  name: "ProtocolError",
  code: 4400,
});

export const DOC_ID = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
/** The sixteen bytes DOC_ID travels as. */
export const DOC_BYTES = new Uint8Array([
  0x01, 0xa1, 0xe8, 0x1d, 0xc6, 0xf2, 0x73, 0x01, 0xa0, 0xf6, 0x5c, 0x34, 0x5e,
  0xb6, 0xc7, 0xcd,
]);
const ref = { docId: DOC_ID, generation: 2 };
const v1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };

type MessageOf<T extends Message["type"]> = Extract<Message, { type: T }>;

export const HELLO_SAMPLE: MessageOf<"HELLO"> = {
  type: "HELLO",
  versions: v1,
  build: "b",
  deviceId: "d",
};
export const WELCOME_SAMPLE: MessageOf<"WELCOME"> = {
  type: "WELCOME",
  session: { userId: "u1", name: "Ada Quill" },
  limits: { frameBytes: 4096, messageBytes: 65536 },
  server: { current: v1, min: v1 },
};
export const AUTH_EXPIRING_SAMPLE: MessageOf<"AUTH_EXPIRING"> = {
  type: "AUTH_EXPIRING",
  expiresInMs: 30_000,
};
export const AUTH_REFRESH_SAMPLE: MessageOf<"AUTH_REFRESH"> = {
  type: "AUTH_REFRESH",
  ticket: "t",
};
export const ERROR_SAMPLE: MessageOf<"ERROR"> = {
  type: "ERROR",
  code: CODE.FORBIDDEN,
  message: "no",
  retryAfterMs: 500,
  permanent: true,
  doc: ref,
  clientSeq: null,
};
export const PING_SAMPLE: MessageOf<"PING"> = { type: "PING", nonce: 1 };
export const PONG_SAMPLE: MessageOf<"PONG"> = { type: "PONG", nonce: 1 };
export const SUBSCRIBE_SAMPLE: MessageOf<"SUBSCRIBE"> = {
  type: "SUBSCRIBE",
  ...ref,
  mode: "view",
  clientIds: [5, 6],
  lastServerSeq: 0,
};
export const ANCHOR_SAMPLE: LockAnchorRecord = {
  level: 1,
  order: 0,
  label: "12A",
  blockId: "b1",
  offset: 3,
  quote: "He waits.",
  fallbackIds: ["b0"],
  source: "issue",
};
export const SUBSCRIBED_SAMPLE: MessageOf<"SUBSCRIBED"> = {
  type: "SUBSCRIBED",
  ...ref,
  role: "edit",
  capabilities: ["delete", "send_to_prompter"],
  headSeq: 10,
  minSchemaVersion: 1,
  engineVersion: 1,
  lockLevel: 0,
  lockAnchors: { table: [ANCHOR_SAMPLE] },
  revision: { setId: "s1", baselineVersionId: "v1" },
  airWindow: { startsAt: 1000, endsAt: 2000 },
};
export const GENERATION_MOVED_SAMPLE: MessageOf<"GENERATION_MOVED"> = {
  type: "GENERATION_MOVED",
  ...ref,
  newGeneration: 3,
};
export const UNSUBSCRIBE_SAMPLE: MessageOf<"UNSUBSCRIBE"> = {
  type: "UNSUBSCRIBE",
  ...ref,
};
export const SYNC_SAMPLE: MessageOf<"SYNC"> = {
  type: "SYNC",
  ...ref,
  step: "step1",
  data: new Uint8Array([0]),
};
export const SYNC_STEP2_SAMPLE: MessageOf<"SYNC"> = {
  type: "SYNC",
  ...ref,
  step: "step2",
  data: new Uint8Array([0, 0]),
};
export const SYNC_UPDATE_SAMPLE: MessageOf<"SYNC"> = {
  type: "SYNC",
  ...ref,
  step: "update",
  data: new Uint8Array([0, 0]),
};
export const PUSH_SAMPLE: MessageOf<"PUSH"> = {
  type: "PUSH",
  ...ref,
  clientSeq: 4,
  update: new Uint8Array([1, 2, 3, 4]),
  heal: true,
};
export const SET_SAMPLE: MessageOf<"SET"> = {
  type: "SET",
  ...ref,
  clientSeq: 5,
  key: "script.paper",
  value: new TextEncoder().encode(JSON.stringify("a4")),
};
export const ACK_SAMPLE: MessageOf<"ACK"> = {
  type: "ACK",
  ...ref,
  clientSeq: 4,
  serverSeq: 90,
};
export const AWARENESS_SAMPLE: MessageOf<"AWARENESS"> = {
  type: "AWARENESS",
  ...ref,
  update: new Uint8Array([9]),
};
export const CONTROL_SAMPLE: MessageOf<"CONTROL"> = {
  type: "CONTROL",
  ...ref,
  seq: 7,
  kind: "draft_named",
  data: new TextEncoder().encode("{}"),
};
export const VIEW_SNAPSHOT_SAMPLE: MessageOf<"VIEW_SNAPSHOT"> = {
  type: "VIEW_SNAPSHOT",
  ...ref,
  viewSeq: 1,
  content: new Uint8Array([123, 125]),
};
export const VIEW_PATCH_SAMPLE: MessageOf<"VIEW_PATCH"> = {
  type: "VIEW_PATCH",
  ...ref,
  viewSeq: 2,
  patch: new Uint8Array([91, 93]),
};

/** One sample of every server-only type, plus SYNC step2 and SYNC update. */
export const SERVER_ONLY_SAMPLES: Message[] = [
  WELCOME_SAMPLE,
  AUTH_EXPIRING_SAMPLE,
  ERROR_SAMPLE,
  SUBSCRIBED_SAMPLE,
  GENERATION_MOVED_SAMPLE,
  ACK_SAMPLE,
  CONTROL_SAMPLE,
  VIEW_SNAPSHOT_SAMPLE,
  VIEW_PATCH_SAMPLE,
  SYNC_STEP2_SAMPLE,
  SYNC_UPDATE_SAMPLE,
];

/** One sample of every message type. */
export const ONE_OF_EACH: Message[] = [
  HELLO_SAMPLE,
  AUTH_REFRESH_SAMPLE,
  PING_SAMPLE,
  PONG_SAMPLE,
  SUBSCRIBE_SAMPLE,
  UNSUBSCRIBE_SAMPLE,
  SYNC_SAMPLE,
  PUSH_SAMPLE,
  SET_SAMPLE,
  AWARENESS_SAMPLE,
  ...SERVER_ONLY_SAMPLES.filter((m) => m.type !== "SYNC"),
];

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
