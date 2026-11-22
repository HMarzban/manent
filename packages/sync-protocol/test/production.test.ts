import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  BLOCK_CHANGES,
  COLOUR_ORDER_IDS,
  ISSUE_FILES,
  MARK_MODES,
  NUMBERING_SCHEMES,
  PAGE_OPS,
  PRODUCTION_REFUSALS,
  PRODUCTION_STATE_VERSION,
  isProductionState,
  isRequestKey,
} from "../src/index.ts";
import type { ProductionState } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const ORDER = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
  "buff",
  "salmon",
  "cherry",
];

const STATE_SAMPLE: ProductionState = {
  v: 1,
  docId: DOC,
  headSeq: 41,
  locked: true,
  lockLevel: 1,
  lockedOn: "2026-10-27",
  numbering: "suffix",
  colourOrder: ORDER,
  anchors: [
    {
      level: 1,
      order: 1,
      label: "1",
      blockId: "b1",
      offset: 0,
      quote: "INT. FERRY - NIGHT",
      fallbackIds: ["b2"],
      source: "lock",
    },
  ],
  sceneNumbers: [{ blockId: "b1", num: "1", reserved: false }],
  sets: [
    {
      setId: "s0",
      ordinal: 0,
      name: "White",
      colour: "white",
      mark: "*",
      fullDraft: true,
      startedAt: 1_793_000_000_000,
      issuedAt: 1_793_000_000_000,
      issuedOn: "2026-10-27",
      issuedByName: "Dana Reyes",
      recalledAt: null,
      baselineVersionId: "v0",
      issuedVersionId: "v1",
      engineVersion: 1,
      blocks: [],
    },
    {
      setId: "s1",
      ordinal: 1,
      name: "Blue",
      colour: "blue",
      mark: "*",
      fullDraft: false,
      startedAt: 1_793_000_000_000,
      issuedAt: null,
      issuedOn: null,
      issuedByName: null,
      recalledAt: null,
      baselineVersionId: "v1",
      issuedVersionId: null,
      engineVersion: 1,
      blocks: [],
    },
  ],
  issues: [
    {
      issueId: "i0",
      setId: "s0",
      kind: "issue",
      versionId: "v1",
      issuedAt: 1_793_000_000_000,
      issuedOn: "2026-10-27",
      issuedByName: "Dana Reyes",
      recipientUserIds: ["sam", "priya"],
      pages: [],
      memo: "",
      files: ["pdf_clean"],
      tint: false,
      what: "full",
    },
  ],
};

test("the production lists are fixed", () => {
  expect([
    NUMBERING_SCHEMES,
    COLOUR_ORDER_IDS,
    MARK_MODES,
    ISSUE_FILES,
    PAGE_OPS,
    BLOCK_CHANGES,
  ]).toEqual([
    ["suffix", "prefix"],
    ["standard", "extended"],
    ["collated", "this_revision", "all", "since_full_draft", "none"],
    ["pdf_marked", "pdf_clean"],
    ["lock", "unlock", "lock_a_pages", "renumber", "consolidate"],
    ["added", "changed", "moved", "shown", "removed"],
  ]);
  expect(PRODUCTION_REFUSALS).toEqual([
    "already_issued",
    "already_locked",
    "bad_request",
    "busy",
    "changed",
    "engine_unavailable",
    "forbidden",
    "not_found",
    "not_locked",
    "recall_closed",
    "unknown_label",
  ]);
  expect(PRODUCTION_STATE_VERSION).toBe(1);
});

test("a request key is 32 lower-case hexadecimal characters", () => {
  expect(
    [
      "0123456789abcdef0123456789abcdef",
      "0123456789ABCDEF0123456789abcdef",
      "abc",
      7,
      null,
    ].map(isRequestKey),
  ).toEqual([true, false, false, false, false]);
});

test("a production state is recognised by its shape, and nothing else is", () => {
  expect([
    isProductionState(STATE_SAMPLE),
    isProductionState({ ...STATE_SAMPLE, v: 2 }),
    isProductionState({ ...STATE_SAMPLE, sets: null }),
    isProductionState("x"),
  ]).toEqual([true, false, false, false]);
});

test("a production state with any one top-level field of the wrong kind is refused", () => {
  const wrong: readonly [keyof ProductionState, unknown][] = [
    ["v", "1"],
    ["docId", 7],
    ["headSeq", "41"],
    ["locked", 1],
    ["lockLevel", null],
    ["lockedOn", 20_261_027],
    ["numbering", "infix"],
    ["colourOrder", "white"],
    ["anchors", {}],
    ["sceneNumbers", null],
    ["sets", "s0"],
    ["issues", 0],
  ];
  expect(
    wrong.map(([field, value]) => [
      field,
      isProductionState({ ...STATE_SAMPLE, [field]: value }),
    ]),
  ).toEqual(wrong.map(([field]) => [field, false]));
  expect(
    [
      { ...STATE_SAMPLE, lockedOn: null },
      { ...STATE_SAMPLE, numbering: "prefix" },
      [STATE_SAMPLE],
      null,
    ].map(isProductionState),
  ).toEqual([true, true, false, false]);
});

test("an arbitrary value is refused, and every state of the right shape is recognised", () => {
  fc.assert(
    fc.property(fc.anything(), (value) => isProductionState(value) === false),
    { numRuns: 300 },
  );
  fc.assert(
    fc.property(
      fc.record({
        headSeq: fc.nat(),
        locked: fc.boolean(),
        lockLevel: fc.nat({ max: 2 }),
        lockedOn: fc.option(fc.constant("2026-10-27"), { nil: null }),
        numbering: fc.constantFrom(...NUMBERING_SCHEMES),
      }),
      (fields) => isProductionState({ ...STATE_SAMPLE, ...fields }),
    ),
    { numRuns: 300 },
  );
});
