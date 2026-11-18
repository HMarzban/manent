// Rooms are released once nobody holds them, and what one loaded 120-page room costs in heap.
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { SyncService } from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type { FakeClock } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type { Measurement, Scenario } from "../harness.ts";
import {
  EMPTY_VECTOR,
  HOME,
  OWNER,
  createBenchPeer,
  createBenchService,
  docIdOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
} from "./support.ts";

const LEFT_ROOMS = 50;
const LOADED_ROOMS = 20;
/** Long enough for the `roomLoadsPerSecond` budget to allow the next room load. */
const BETWEEN_LOADS_MS = 1000 / DEFAULT_LIMITS.roomLoadsPerSecond + 1;

interface World {
  clock: FakeClock;
  storage: MemoryStorage;
  service: SyncService;
}

function createWorld(): World {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  const service = createBenchService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
  });
  return { clock, storage, service };
}

/** Each room opened by one editor, who then leaves; the rooms left after `roomIdleMs`. */
function roomsAfterIdle(): number {
  const { clock, storage, service } = createWorld();
  const state = stateOf(scriptOfPages(1));
  for (let n = 0; n < LEFT_ROOMS; n++) {
    const docId = docIdOf(n);
    placeScript(service, storage, { docId, home: HOME, state, editors: [] });
    const peer = createBenchPeer(OWNER, () => {});
    joinAsEditor(service, peer, {
      docId,
      clientId: n + 1,
      vector: EMPTY_VECTOR,
    });
    service.detach(peer);
    clock.advance(BETWEEN_LOADS_MS);
  }
  clock.advance(DEFAULT_LIMITS.roomIdleMs + 1);
  return service.stats().rooms;
}

function heapBytes(): number {
  Bun.gc(true);
  return process.memoryUsage().heapUsed;
}

/** The heap a loaded room adds: every script is placed first, so only the loads are measured. */
function bytesPerLoadedRoom(): number {
  const { clock, storage, service } = createWorld();
  const state = stateOf(scriptOfPages(120));
  const docIds = Array.from({ length: LOADED_ROOMS }, (_, n) => docIdOf(n));
  for (const docId of docIds)
    placeScript(service, storage, { docId, home: HOME, state, editors: [] });
  const before = heapBytes();
  docIds.forEach((docId, n) => {
    const peer = createBenchPeer(OWNER, () => {});
    joinAsEditor(service, peer, {
      docId,
      clientId: n + 1,
      vector: EMPTY_VECTOR,
    });
    clock.advance(BETWEEN_LOADS_MS);
  });
  const loaded = service.stats().loadedRooms;
  if (loaded !== LOADED_ROOMS)
    throw new Error(`${loaded} rooms loaded, not ${LOADED_ROOMS}`);
  return (heapBytes() - before) / LOADED_ROOMS;
}

const scenario: Scenario = {
  id: "server.room-memory",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    return [
      {
        metric: "rooms_after_idle",
        unit: "count",
        samples: [roomsAfterIdle()],
      },
      {
        metric: "loaded_room_bytes",
        unit: "bytes",
        samples: [bytesPerLoadedRoom()],
      },
    ];
  },
};

export default scenario;
