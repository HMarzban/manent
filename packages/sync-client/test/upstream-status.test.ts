import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  HANDOFF_REFUSALS,
  UPSTREAM_STATUS_VERSION,
  decodeUpstreamStatus,
  encodeUpstreamRefused,
  encodeUpstreamStatus,
} from "../src/index.ts";
import type {
  RecoveredItem,
  UpstreamEvent,
  UpstreamStatus,
} from "../src/index.ts";

const UTF8 = new TextEncoder();

const STATUS: UpstreamStatus = {
  v: 1,
  link: "online",
  synced: false,
  waiting: 2,
  wentOfflineAt: null,
  neverSynced: false,
  side: ["sign_in"],
  device: "ok",
  recovered: [
    {
      id: "r1",
      docId: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
      blockId: "block-one-000001",
      nearBlockId: null,
      text: "the lamp went out",
      recoveredAt: 1_700_000_000_000,
      cause: "overlap",
      mine: {
        type: "block",
        attrs: { id: "block-one-000001", type: "action" },
        content: [{ type: "text", text: "the lamp", marks: [{ type: "em" }] }],
      },
      theirs: null,
      otherClientIds: [7],
    },
  ],
  lastSyncedAt: 1_699_990_000_000,
  handoffRefused: null,
  events: [
    { n: 3, event: { type: "rebuilt", applied: 1, overlaps: 0, setAside: 0 } },
  ],
};

function json(value: unknown): Uint8Array {
  return UTF8.encode(JSON.stringify(value));
}

const text = fc.string({ unit: "grapheme", maxLength: 12 });
const count = fc.nat({ max: 1_000_000 });
const instant = fc.integer({ min: 0, max: 2 ** 48 });
const attrs = fc.dictionary(
  fc.constantFrom("id", "type", "note", "level"),
  fc.oneof(text, fc.integer(), fc.boolean(), fc.constant(null)),
);
const mark = fc.record(
  { type: fc.constantFrom("em", "strong", "comment"), attrs },
  { requiredKeys: ["type"] },
);
const run = fc.record(
  {
    type: fc.constant("text" as const),
    text,
    marks: fc.array(mark, { maxLength: 2 }),
  },
  { requiredKeys: ["type", "text"] },
);
const blockJson = fc.record(
  {
    type: fc.constant("block" as const),
    attrs,
    content: fc.array(run, { maxLength: 3 }),
  },
  { requiredKeys: ["type"] },
);
const item: fc.Arbitrary<RecoveredItem> = fc.record({
  id: text,
  docId: text,
  blockId: fc.option(text, { nil: null }),
  nearBlockId: fc.option(text, { nil: null }),
  text,
  recoveredAt: instant,
  cause: fc.constantFrom("merge", "rejected", "overlap"),
  mine: fc.option(blockJson, { nil: null }),
  theirs: fc.option(blockJson, { nil: null }),
  otherClientIds: fc.array(fc.nat({ max: 0xffff_ffff }), { maxLength: 3 }),
});
const event: fc.Arbitrary<UpstreamEvent> = fc.oneof(
  fc.record({
    type: fc.constant("receipt" as const),
    sent: count,
    setAside: count,
    overlaps: count,
  }),
  fc.record({
    type: fc.constant("rebuilt" as const),
    applied: count,
    overlaps: count,
    setAside: count,
  }),
  fc.record({ type: fc.constant("past_window" as const), versionId: text }),
  fc.record({
    type: fc.constant("rejected" as const),
    code: count,
    replayed: count,
    setAside: count,
  }),
);
const status: fc.Arbitrary<UpstreamStatus> = fc.record({
  v: fc.constant(1 as const),
  link: fc.constantFrom("offline", "connecting", "authenticating", "online"),
  synced: fc.boolean(),
  waiting: count,
  wentOfflineAt: fc.option(instant, { nil: null }),
  neverSynced: fc.boolean(),
  side: fc.uniqueArray(
    fc.constantFrom(
      "access_removed",
      "deleted",
      "read_only",
      "rejected",
      "not_saved",
      "sign_in",
      "server_old",
      "view_only",
    ),
  ),
  device: fc.constantFrom("ok", "failing"),
  recovered: fc.array(item, { maxLength: 3 }),
  lastSyncedAt: fc.option(instant, { nil: null }),
  handoffRefused: fc.option(fc.constantFrom(...HANDOFF_REFUSALS), {
    nil: null,
  }),
  events: fc.array(
    fc.record({ n: fc.integer({ min: 1, max: 1_000 }), event }),
    { maxLength: 4 },
  ),
});

test("the upstream status has these bytes", () => {
  const s: UpstreamStatus = {
    v: 1,
    link: "offline",
    synced: false,
    waiting: 12,
    wentOfflineAt: 1_700_000_000_000,
    neverSynced: false,
    side: [],
    device: "ok",
    recovered: [],
    lastSyncedAt: 1_699_990_000_000,
    handoffRefused: null,
    events: [{ n: 1, event: { type: "past_window", versionId: "v1" } }],
  };
  expect(new TextDecoder().decode(encodeUpstreamStatus(s))).toBe(
    '{"v":1,"link":"offline","synced":false,"waiting":12,"wentOfflineAt":1700000000000,"neverSynced":false,"side":[],"device":"ok","recovered":[],' +
      '"lastSyncedAt":1699990000000,"handoffRefused":null,"events":[{"n":1,"event":{"type":"past_window","versionId":"v1"}}]}',
  );
  expect([...HANDOFF_REFUSALS]).toEqual([
    "forbidden",
    "deleted",
    "exists_elsewhere",
    "invalid",
    "too_large",
  ]);
  expect(UPSTREAM_STATUS_VERSION).toBe(1);
  expect(new TextDecoder().decode(encodeUpstreamRefused(4, "locked"))).toBe(
    '{"clientSeq":4,"message":"locked"}',
  );
});

test("a status round-trips, and anything else decodes to null", () => {
  fc.assert(
    fc.property(status, (s) => {
      expect(decodeUpstreamStatus(encodeUpstreamStatus(s))).toEqual(s);
    }),
    { numRuns: 500 },
  );
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
      const decoded = decodeUpstreamStatus(bytes);
      if (decoded !== null)
        expect(decodeUpstreamStatus(encodeUpstreamStatus(decoded))).toEqual(
          decoded,
        );
    }),
    { numRuns: 2000 },
  );
  const [first] = STATUS.recovered;
  const [entry] = STATUS.events;
  const wrong: Record<string, unknown>[] = [
    { v: 2 },
    { link: "away" },
    { synced: "no" },
    { waiting: -1 },
    { waiting: 1.5 },
    { wentOfflineAt: "today" },
    { neverSynced: null },
    { side: ["elsewhere"] },
    { side: "sign_in" },
    { device: "full" },
    { recovered: "none" },
    { recovered: [{ ...first, id: 1 }] },
    { recovered: [{ ...first, docId: null }] },
    { recovered: [{ ...first, blockId: 3 }] },
    { recovered: [{ ...first, nearBlockId: 3 }] },
    { recovered: [{ ...first, text: 4 }] },
    { recovered: [{ ...first, recoveredAt: "today" }] },
    { recovered: [{ ...first, theirs: "the lamp" }] },
    { recovered: [{ ...first, mine: { type: "block", attrs: [] } }] },
    { recovered: [{ ...first, cause: "lost" }] },
    { recovered: [{ ...first, mine: { type: "section" } }] },
    {
      recovered: [
        { ...first, mine: { type: "block", content: [{ type: "text" }] } },
      ],
    },
    {
      recovered: [
        {
          ...first,
          mine: {
            type: "block",
            content: [
              { type: "text", text: "", marks: [{ type: "em", attrs: 1 }] },
            ],
          },
        },
      ],
    },
    {
      recovered: [
        {
          ...first,
          mine: {
            type: "block",
            content: [{ type: "text", text: "", marks: [{}] }],
          },
        },
      ],
    },
    { recovered: [{ ...first, otherClientIds: ["7"] }] },
    { lastSyncedAt: "today" },
    { handoffRefused: "busy" },
    { events: null },
    { events: ["rebuilt"] },
    { events: [{ ...entry, n: 0 }] },
    {
      events: [{ ...entry, event: { type: "replaced", reason: "generation" } }],
    },
    {
      events: [
        {
          ...entry,
          event: { type: "setting_refused", key: "paper", message: "locked" },
        },
      ],
    },
    { events: [{ ...entry, event: { type: "past_window" } }] },
  ];
  expect(
    wrong.map((change) => decodeUpstreamStatus(json({ ...STATUS, ...change }))),
  ).toEqual(wrong.map(() => null));
  const written = JSON.stringify(STATUS);
  const overflowing = written.replace(
    '"lastSyncedAt":1699990000000',
    '"lastSyncedAt":1e400',
  );
  // a byte no UTF-8 text holds, inside the Recovered text
  const notUtf8 = UTF8.encode(written);
  notUtf8[written.indexOf("the lamp went out")] = 0xff;
  expect([
    decodeUpstreamStatus(json(STATUS)),
    decodeUpstreamStatus(json({ ...STATUS, later: true })),
    decodeUpstreamStatus(json({ ...STATUS, events: undefined })),
    decodeUpstreamStatus(UTF8.encode(overflowing)),
    decodeUpstreamStatus(notUtf8),
    decodeUpstreamStatus(json([STATUS])),
  ]).toEqual([STATUS, STATUS, null, null, null, null]);
});
