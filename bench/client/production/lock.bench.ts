// Locking a 120-page script for production through the production service, over memory storage; and
// the world the production scenarios share: the sync service with the history and production services
// among its hooks.
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import {
  PRODUCT_SETTING_RULES,
  createHistoryService,
  createProductionService,
  createSyncService,
} from "@manent/server-core";
import type {
  HistoryExtras,
  ProductionService,
  SyncService,
} from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type { Storage } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { LockRequest, VersionSet } from "@manent/sync-protocol";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { T0, keyOf } from "../../server/history/restore-120.bench.ts";
import {
  HOME,
  OWNER,
  docIdOf,
  placeScript,
  scriptOfPages,
  stateOf,
} from "../../server/support.ts";

const ITERATIONS = 20;
/** The device's day of every request: 1 June 2027, T0's. */
export const DAY = "2027-06-01";
const VERSIONS: VersionSet = {
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
};
/** No connection is ever slowed down. */
const OPEN_LIMITS = {
  framesPerSecond: 1e9,
  frameBurst: 1e9,
  bytesPerSecond: 1e12,
  byteBurst: 1e12,
};

export interface ProductionBench {
  readonly storage: Storage;
  readonly service: ProductionService;
  readonly sync: SyncService;
  /** Places another copy of the script, owned by OWNER, and returns its id. */
  place(): string;
}

const ids = (): string => crypto.randomUUID();

/** Copies of `script` served from memory storage; OWNER locks and issues them. */
export function createProductionBench(script: DocJSON): ProductionBench {
  const { clock } = fakeClock(T0);
  const storage = createMemoryStorage({ now: clock.now });
  // the history service and the production service take each other through getters
  const extras: HistoryExtras = {
    locksAt: (...args) => service.extras.locksAt(...args),
    authority: (...args) => service.extras.authority(...args),
  };
  const history = createHistoryService({
    sync: () => sync,
    storage,
    clock,
    ids,
    extras,
  });
  const service = createProductionService({
    storage,
    sync: () => sync,
    history,
    now: clock.now,
    ids,
    names: (userId) => userId,
    renderPdf: () => Promise.reject(new Error("no file is drawn here")),
    rules: PRODUCT_SETTING_RULES,
  });
  const sync = createSyncService({
    storage,
    clock,
    defer: setImmediate,
    ids,
    versions: { current: VERSIONS, min: VERSIONS },
    limits: OPEN_LIMITS,
    registry: PRODUCT_SETTING_RULES,
    hooks: [history, service.hooks],
  });
  const state = stateOf(script);
  let placed = 0;
  return {
    storage,
    service,
    sync,
    place() {
      const docId = docIdOf(placed++);
      placeScript(sync, storage, { docId, home: HOME, state, editors: [] });
      return docId;
    },
  };
}

/** The lock of `docId`: suffix scene numbers and the standard colour order. */
export const lockRequest = (docId: string): LockRequest => ({
  docId,
  key: keyOf(1),
  numbering: "suffix",
  colourOrder: "standard",
  lockedOn: DAY,
});

async function lockTimes(): Promise<number[]> {
  const bench = createProductionBench(scriptOfPages(120));
  const times: number[] = [];
  for (let n = 0; n < ITERATIONS; n++) {
    const docId = bench.place();
    const locks: Awaited<ReturnType<ProductionService["lock"]>>[] = [];
    times.push(
      await sampleMs(async () => {
        locks.push(await bench.service.lock(OWNER, lockRequest(docId)));
      }),
    );
    const locked = locks[0]!;
    if (!locked.ok)
      throw new Error(`the lock was refused: ${JSON.stringify(locked.body)}`);
  }
  return times;
}

/** `lock_ms`: 20 locks for production, each of a fresh 120-page script, through the production service. */
const scenario: Scenario = {
  id: "production.lock",
  workload: "W1",
  processes: 5,
  run: async (): Promise<Measurement[]> => [
    { metric: "lock_ms", unit: "ms", samples: await lockTimes() },
  ],
};

export default scenario;
