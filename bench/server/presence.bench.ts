// One room, 200 bots moving a cursor 5 times a second for 60 s: awareness frame deliveries and
// framed wire bytes per second, and end-to-end delivery lag across the room.
import { browserClock } from "@manent/client-web";
import { decodeAwareness, encodeAwareness } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION, blockText, blocksOf } from "@manent/schema";
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { Peer } from "@manent/server-core";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  PROTOCOL_VERSION,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type {
  Message,
  PreparedMessage,
  VersionSet,
} from "@manent/sync-protocol";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";
import {
  EMPTY_VECTOR,
  HOME,
  createBenchService,
  delay,
  docIdOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
} from "./support.ts";

type Mode = ReturnType<typeof benchMode>;

const SEED = 4747;
const MOVE_INTERVAL_MS = 200;
const BOTS: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 20,
  standard: 200,
  full: 200,
});
const DURATION_MS: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 1_000,
  standard: 60_000,
  full: 60_000,
});
const FLUSH_WAIT_MS = DEFAULT_LIMITS.awarenessBatchMs * 2 + 50;

const VERSIONS: VersionSet = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
});

interface CursorBlock {
  id: string;
  length: number;
}

interface SentCursor {
  clock: number;
  at: number;
}

interface Traffic {
  deliveries: number;
  bytes: number;
  lags: number[];
  /** Each broadcast sends one frame object synchronously to every editor. */
  lastFrame: object | null;
  seenOnFrame: number;
}

function createMeteredPeer(
  userId: string,
  botCount: number,
  sent: ReadonlyMap<number, SentCursor>,
  traffic: Traffic,
): Peer {
  const encoder = createFrameEncoder({ ids: createMessageIds() });
  return {
    userId,
    name: userId,
    deviceId: `device-${userId}`,
    versions: VERSIONS,
    address: "127.0.0.1",
    send(message: Message | PreparedMessage) {
      const frames = encoder.encode(message);
      if (message.type !== "AWARENESS") return;
      traffic.deliveries += 1;
      for (const frame of frames) traffic.bytes += frame.byteLength;
      if (traffic.lastFrame !== message) {
        traffic.lastFrame = message;
        traffic.seenOnFrame = 0;
      }
      traffic.seenOnFrame += 1;
      if (traffic.seenOnFrame !== botCount) return;
      const now = performance.now();
      let oldest: number | null = null;
      for (const entry of decodeAwareness(message.update)) {
        const record = sent.get(entry.clientId);
        if (record !== undefined && record.clock === entry.clock)
          oldest = oldest === null ? record.at : Math.min(oldest, record.at);
      }
      if (oldest !== null) traffic.lags.push(Math.max(0, now - oldest));
    },
    close() {},
  };
}

function cursorUpdate(
  clientId: number,
  clock: number,
  blocks: readonly CursorBlock[],
  step: number,
): Uint8Array {
  const at = step % blocks.length;
  const block = blocks[at]!;
  const offset = step % (block.length + 1);
  const place = { blockId: block.id, offset };
  return encodeAwareness([
    {
      clientId,
      clock,
      state: { cursor: { anchor: place, head: place, at } },
    },
  ]);
}

async function measure(mode: Mode): Promise<Measurement[]> {
  const botCount = BOTS[mode];
  const durationMs = DURATION_MS[mode];
  const storage = createMemoryStorage({ now: Date.now });
  const service = createBenchService({
    storage,
    clock: browserClock,
    defer: setImmediate,
  });
  const docId = docIdOf(0);
  const script = scriptOfPages(1);
  const state = stateOf(script);
  const blocks: CursorBlock[] = blocksOf(script).flatMap((block) =>
    block.attrs.id === null
      ? []
      : [{ id: block.attrs.id, length: blockText(block).length }],
  );
  const users = Array.from({ length: botCount }, (_, n) => `bot-${n}`);
  placeScript(service, storage, { docId, home: HOME, state, editors: users });
  const sent = new Map<number, SentCursor>();
  const traffic: Traffic = {
    deliveries: 0,
    bytes: 0,
    lags: [],
    lastFrame: null,
    seenOnFrame: 0,
  };
  const peers = users.map((userId, n) => {
    const peer = createMeteredPeer(userId, botCount, sent, traffic);
    joinAsEditor(service, peer, {
      docId,
      clientId: n + 1,
      vector: EMPTY_VECTOR,
    });
    return peer;
  });
  const rng = createRng(SEED);
  const stops: (() => void)[] = [];
  const startedAt = performance.now();
  try {
    peers.forEach((peer, n) => {
      const clientId = n + 1;
      let clock = 0;
      const move = (): void => {
        clock += 1;
        const update = cursorUpdate(clientId, clock, blocks, clock + n);
        sent.set(clientId, { clock, at: performance.now() });
        service.receive(peer, {
          type: "AWARENESS",
          docId,
          generation: 1,
          update,
        });
      };
      let interval: Timer | null = null;
      const initial = setTimeout(
        () => {
          move();
          interval = setInterval(move, MOVE_INTERVAL_MS);
        },
        rng.int(0, MOVE_INTERVAL_MS),
      );
      stops.push(() => {
        clearTimeout(initial);
        if (interval !== null) clearInterval(interval);
      });
    });
    await delay(durationMs);
    for (const stop of stops) stop();
    stops.length = 0;
    await delay(FLUSH_WAIT_MS);
    const elapsedSeconds = (performance.now() - startedAt) / 1_000;
    return [
      measurement("deliveries_per_second", "count", [
        traffic.deliveries / elapsedSeconds,
      ]),
      measurement("presence_bytes_per_second", "bytes", [
        traffic.bytes / elapsedSeconds,
      ]),
      measurement("presence_lag_ms", "ms", traffic.lags),
    ];
  } finally {
    for (const stop of stops) stop();
    await service.shutdown();
  }
}

const scenario: Scenario = {
  id: "server.presence",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    return measure(benchMode());
  },
};

export default scenario;
