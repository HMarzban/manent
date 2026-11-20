import { expect, test } from "bun:test";
import type { GenerationRow, MeasureRow } from "@manent/storage";
import { DEFAULT_LIMITS, SYSTEM_USER_ID, rebuildReason } from "../src/index.ts";
import { DOC } from "./seed.ts";

const GEN_ROW: GenerationRow = {
  docId: DOC,
  generation: 1,
  finalSeq: 40,
  finalState: new Uint8Array([0, 0]),
  frozenAt: 1_000,
  purgeAfter: 7_776_001_000,
  reason: "client_ids",
  nextInitialBytes: 1_000,
  rebuiltByClientId: 1,
};

/** A measure at every limit, with `over` changed. */
const m = (over: Partial<MeasureRow>): MeasureRow => ({
  seq: 1,
  liveBytes: 300_000,
  plainBytes: 30_000,
  clientIds: 10_000,
  largestSection: 400,
  ...over,
});

test("each trigger fires just over its limit and not at it", () => {
  expect(rebuildReason(m({}), DEFAULT_LIMITS, null)).toBeNull();
  expect(rebuildReason(m({ clientIds: 10_001 }), DEFAULT_LIMITS, null)).toBe(
    "client_ids",
  );
  expect(rebuildReason(m({ plainBytes: 29_999 }), DEFAULT_LIMITS, null)).toBe(
    "bytes",
  );
  // too small to matter
  expect(
    rebuildReason(
      m({ liveBytes: 262_143, plainBytes: 1 }),
      DEFAULT_LIMITS,
      null,
    ),
  ).toBeNull();
  // not twice its fresh size
  expect(
    rebuildReason(m({ plainBytes: 1 }), DEFAULT_LIMITS, {
      ...GEN_ROW,
      nextInitialBytes: 150_000,
    }),
  ).toBeNull();
  expect(rebuildReason(m({ largestSection: 401 }), DEFAULT_LIMITS, null)).toBe(
    "section",
  );
  expect(
    rebuildReason(
      m({ clientIds: 10_001, largestSection: 401 }),
      DEFAULT_LIMITS,
      null,
    ),
  ).toBe("client_ids");
  expect(rebuildReason(null, DEFAULT_LIMITS, null)).toBeNull();
});

test("the rebuild limits are pinned", () => {
  expect(DEFAULT_LIMITS).toMatchObject({
    rebuildBytesRatio: 10,
    rebuildMinBytes: 262_144,
    rebuildClientIds: 10_000,
    rebuildSectionBlocks: 400,
    rebuildQuietMs: 10_000,
    frozenKeepMs: 7_776_000_000,
    replayBodyBytes: 67_108_864,
  });
  expect(SYSTEM_USER_ID).toBe("_system");
});
