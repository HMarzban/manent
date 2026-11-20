import { expect, test } from "bun:test";
import { CODE } from "@manent/sync-protocol";
import { DEFAULT_LIMITS, NO_SETTINGS } from "../src/index.ts";

test("the server's limits are the agreed ones", () => {
  expect(DEFAULT_LIMITS).toEqual({
    backpressureBytes: 4_194_304,
    documentBytes: 67_108_864,
    awarenessStateBytes: 4096,
    awarenessBatchMs: 100,
    awarenessTimeoutMs: 30_000,
    roomIdleMs: 30_000,
    checkpointEvery: 2000,
    maxLoadedRooms: 64,
    roomLoadsPerSecond: 20,
    framesPerSecond: 300,
    frameBurst: 600,
    bytesPerSecond: 4_194_304,
    byteBurst: 16_777_216,
    connectionsPerUser: 32,
    connectionsPerAddress: 256,
    subscribersPerDocument: 1000,
    clientIdsPerSubscribe: 256,
    poisonRetryMs: 1000,
    helloTimeoutMs: 10_000,
    rebuildBytesRatio: 10,
    rebuildMinBytes: 262_144,
    rebuildClientIds: 10_000,
    rebuildSectionBlocks: 400,
    rebuildQuietMs: 10_000,
    frozenKeepMs: 7_776_000_000,
    replayBodyBytes: 67_108_864,
  });
  expect(CODE.STORAGE_FAILED).toBe(1011);
  expect([
    NO_SETTINGS.check("script.paper", "a4"),
    NO_SETTINGS.isGuarded("script.paper"),
  ]).toEqual([{ ok: false, code: "unknown_key" }, false]);
});
