// 200 editors on fresh devices join a room holding a 120-page script within 5 seconds: for each, the
// time from its SUBSCRIBE to the step 2 that brings it the whole script.
import { browserClock } from "@manent/client-web";
import { createRng } from "@manent/demo";
import { createMemoryStorage } from "@manent/storage/testing";
import type { Measurement, Scenario } from "../harness.ts";
import {
  EMPTY_VECTOR,
  HOME,
  createBenchPeer,
  createBenchService,
  docIdOf,
  placeScript,
  joinAsEditor,
  scriptOfPages,
  stateOf,
  until,
} from "./support.ts";

const BOTS = 200;
const STORM_MS = 5_000;
const SETTLE_TIMEOUT_MS = 30_000;
const SEED = 4747;

async function joinTimes(): Promise<number[]> {
  const storage = createMemoryStorage({ now: Date.now });
  const service = createBenchService({
    storage,
    clock: browserClock,
    defer: setImmediate,
  });
  const docId = docIdOf(0);
  const bots = Array.from({ length: BOTS }, (_, n) => `bot-${n}`);
  placeScript(service, storage, {
    docId,
    home: HOME,
    state: stateOf(scriptOfPages(120)),
    editors: bots,
  });
  const rng = createRng(SEED);
  const times: number[] = [];
  for (const [n, userId] of bots.entries())
    setTimeout(
      () => {
        const startedAt = performance.now();
        const peer = createBenchPeer(userId, (message) => {
          const isStepTwo = message.type === "SYNC" && message.step === "step2";
          if (isStepTwo) times.push(performance.now() - startedAt);
        });
        joinAsEditor(service, peer, {
          docId,
          clientId: n + 1,
          vector: EMPTY_VECTOR,
        });
      },
      rng.int(0, STORM_MS),
    );
  await until(() => times.length === BOTS, STORM_MS + SETTLE_TIMEOUT_MS);
  await service.shutdown();
  return times;
}

const scenario: Scenario = {
  id: "server.join-storm",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    return [
      {
        metric: "last_synced_ms",
        unit: "ms",
        samples: await joinTimes(),
      },
    ];
  },
};

export default scenario;
