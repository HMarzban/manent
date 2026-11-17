// Generators and samples shared by the sync-protocol tests.
import fc from "fast-check";
import { CODE } from "../src/index.ts";
import type {
  Capability,
  ControlKind,
  DocRef,
  DocRole,
  LockAnchor,
  Message,
  Sender,
  SubscribeMode,
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
const role = fc.constantFrom<DocRole>("owner", "edit", "comment", "view");
const capability = fc.constantFrom<Capability>(
  "send_to_prompter",
  "edit_rundowns",
  "issue_revisions",
  "lock_page_numbers",
  "delete",
);
const mode = fc.constantFrom<SubscribeMode>("edit", "view", "prompter");
const controlKind = fc.constantFrom<ControlKind>(
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
);
const lockAnchor: fc.Arbitrary<LockAnchor> = fc.record({
  level: num,
  order: num,
  label: text,
  blockId: text,
  offset: num,
  quote: text,
  fallbackIds: fc.array(text, { maxLength: 4 }),
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
  fc.record({
    type: fc.constant("WELCOME" as const),
    session: fc.record({ userId: text, name: text }),
    limits: fc.record({ frameBytes: num, messageBytes: num }),
    server: fc.record({ current: versions, min: versions }),
  }),
  fc.record({ type: fc.constant("AUTH_EXPIRING" as const), secondsLeft: num }),
  fc.record({ type: fc.constant("AUTH_REFRESH" as const), ticket: text }),
  fc.record({
    type: fc.constant("ERROR" as const),
    code: fc.constantFrom(...Object.values(CODE)),
    message: text,
    retryAfterMs: nullable(num),
    permanent: fc.boolean(),
    doc: nullable(docRef),
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
      minSchema: num,
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
      step: fc.constantFrom(
        "step1" as const,
        "step2" as const,
        "update" as const,
      ),
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

export const DOC_ID = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const ref = { docId: DOC_ID, generation: 2 };
const v1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };

export const HELLO_SAMPLE: Message = {
  type: "HELLO",
  versions: v1,
  build: "b",
  deviceId: "d",
};
export const PUSH_SAMPLE: Message = {
  type: "PUSH",
  ...ref,
  clientSeq: 4,
  update: new Uint8Array([1, 2, 3, 4]),
  heal: true,
};

/** One sample of every server-only type, plus SYNC step2 and SYNC update. */
export const SERVER_ONLY_SAMPLES: Message[] = [
  {
    type: "WELCOME",
    session: { userId: "u1", name: "Ada Quill" },
    limits: { frameBytes: 4096, messageBytes: 65536 },
    server: { current: v1, min: v1 },
  },
  { type: "AUTH_EXPIRING", secondsLeft: 30 },
  {
    type: "ERROR",
    code: CODE.FORBIDDEN,
    message: "no",
    retryAfterMs: 500,
    permanent: true,
    doc: ref,
  },
  {
    type: "SUBSCRIBED",
    ...ref,
    role: "edit",
    capabilities: ["delete", "send_to_prompter"],
    headSeq: 10,
    minSchema: 1,
    engineVersion: 1,
    lockLevel: 0,
    lockAnchors: {
      table: [
        {
          level: 1,
          order: 0,
          label: "12A",
          blockId: "b1",
          offset: 3,
          quote: "He waits.",
          fallbackIds: ["b0"],
        },
      ],
    },
    revision: { setId: "s1", baselineVersionId: "v1" },
    airWindow: { startsAt: 1000, endsAt: 2000 },
  },
  { type: "GENERATION_MOVED", ...ref, newGeneration: 3 },
  { type: "ACK", ...ref, clientSeq: 4, serverSeq: 90 },
  {
    type: "CONTROL",
    ...ref,
    seq: 7,
    kind: "draft_named",
    data: new TextEncoder().encode("{}"),
  },
  {
    type: "VIEW_SNAPSHOT",
    ...ref,
    viewSeq: 1,
    content: new Uint8Array([123, 125]),
  },
  { type: "VIEW_PATCH", ...ref, viewSeq: 2, patch: new Uint8Array([91, 93]) },
  { type: "SYNC", ...ref, step: "step2", data: new Uint8Array([0, 0]) },
  { type: "SYNC", ...ref, step: "update", data: new Uint8Array([0, 0]) },
];

/** One sample of every message type. */
export const ONE_OF_EACH: Message[] = [
  HELLO_SAMPLE,
  { type: "AUTH_REFRESH", ticket: "t" },
  { type: "PING", nonce: 1 },
  { type: "PONG", nonce: 1 },
  {
    type: "SUBSCRIBE",
    ...ref,
    mode: "view",
    clientIds: [5, 6],
    lastServerSeq: 0,
  },
  { type: "UNSUBSCRIBE", ...ref },
  { type: "SYNC", ...ref, step: "step1", data: new Uint8Array([0]) },
  PUSH_SAMPLE,
  { type: "AWARENESS", ...ref, update: new Uint8Array([9]) },
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
