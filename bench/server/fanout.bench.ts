// One room, 200 editors, 5 of them typing 5 characters a second for 20 seconds: the time from
// just before the service receives a typist's PUSH to the last listening editor's copy of the
// update, and how late a 10 ms timer fires meanwhile, with the service in this process.
import { browserClock } from "@manent/client-web";
import { createRng } from "@manent/demo";
import { createMemoryStorage } from "@manent/storage/testing";
import { FRAME } from "@manent/sync-protocol";
import type { SyncService } from "@manent/server-core";
import type { Measurement, Scenario } from "../harness.ts";
import { sampleMs } from "../measure.ts";
import {
  EMPTY_VECTOR,
  HOME,
  createBenchPeer,
  createBenchService,
  createKeystrokes,
  delay,
  docIdOf,
  firstBlockOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
  until,
} from "./support.ts";

const EDITORS = 200;
const TYPISTS = 5;
const KEYSTROKE_MS = 200;
const TYPING_MS = 20_000;
const TIMER_MS = 10;
const SETTLE_TIMEOUT_MS = 10_000;
const SEED = 4747;

/** Lateness of a 10 ms timer, set again each time it fires, until `stop()` resolves. */
function watchEventLoop(): { lateness: number[]; stop(): Promise<void> } {
  const lateness: number[] = [];
  const stopping = new AbortController();
  const watched = (async () => {
    while (!stopping.signal.aborted) {
      const ms = await sampleMs(() => delay(TIMER_MS));
      lateness.push(Math.max(0, ms - TIMER_MS));
    }
  })();
  return {
    lateness,
    async stop() {
      stopping.abort();
      await watched;
    },
  };
}

/** What a run's typists sent and its listeners heard. */
interface Fanout {
  /** For each committed push, in the order the room publishes them: what each listener calls when its copy arrives. */
  arrivals: (() => void)[];
  /** One per push: from just before the service receives it to the last listener's copy of it, in ms. */
  samples: Promise<number>[];
}

/** The editors who only listen: each reads the n-th update it hears as the n-th push sent. */
function joinListeners(
  service: SyncService,
  docId: string,
  users: readonly string[],
  fanout: Fanout,
): (() => number)[] {
  return users.map((userId, n) => {
    let heard = 0;
    const peer = createBenchPeer(userId, (message) => {
      if (message.type !== FRAME.SYNC) return;
      fanout.arrivals[heard]?.();
      heard += 1;
    });
    joinAsEditor(service, peer, {
      docId,
      clientId: TYPISTS + n + 1,
      vector: EMPTY_VECTOR,
    });
    return () => heard;
  });
}

/** Each typist starts at a seeded moment and then types every KEYSTROKE_MS; the result stops them all. */
function startTyping(
  service: SyncService,
  script: { docId: string; state: Uint8Array; blockId: string },
  users: readonly string[],
  fanout: Fanout,
  listeners: number,
): () => void {
  const rng = createRng(SEED);
  const stops = users.map((userId, n) => {
    const keystrokes = createKeystrokes({ ...script, clientId: n + 1 });
    const peer = createBenchPeer(userId, () => {});
    joinAsEditor(service, peer, {
      docId: script.docId,
      clientId: n + 1,
      vector: keystrokes.vector,
    });
    const type = (): void => {
      const push = keystrokes.next();
      const lastCopy = Promise.withResolvers<void>();
      let waiting = listeners;
      fanout.arrivals.push(() => {
        waiting -= 1;
        if (waiting === 0) lastCopy.resolve();
      });
      fanout.samples.push(
        sampleMs(() => {
          service.receive(peer, push);
          return lastCopy.promise;
        }),
      );
    };
    let interval: Timer | null = null;
    const start = setTimeout(
      () => {
        type();
        interval = setInterval(type, KEYSTROKE_MS);
      },
      rng.int(0, KEYSTROKE_MS),
    );
    return () => {
      clearTimeout(start);
      if (interval !== null) clearInterval(interval);
    };
  });
  return () => {
    for (const stop of stops) stop();
  };
}

async function measure(): Promise<Measurement[]> {
  const storage = createMemoryStorage({ now: Date.now });
  const service = createBenchService({
    storage,
    clock: browserClock,
    defer: setImmediate,
  });
  const docId = docIdOf(0);
  const script = scriptOfPages(1);
  const state = stateOf(script);
  const users = Array.from({ length: EDITORS }, (_, n) => `bot-${n}`);
  placeScript(service, storage, { docId, home: HOME, state, editors: users });
  const fanout: Fanout = { arrivals: [], samples: [] };
  const listeners = joinListeners(service, docId, users.slice(TYPISTS), fanout);
  const loop = watchEventLoop();
  const stopTyping = startTyping(
    service,
    { docId, state, blockId: firstBlockOf(script) },
    users.slice(0, TYPISTS),
    fanout,
    listeners.length,
  );
  await delay(TYPING_MS);
  stopTyping();
  await until(
    () => listeners.every((heard) => heard() === fanout.arrivals.length),
    SETTLE_TIMEOUT_MS,
  );
  await loop.stop();
  await service.shutdown();
  return [
    {
      metric: "fanout_ms",
      unit: "ms",
      samples: await Promise.all(fanout.samples),
    },
    { metric: "event_loop_lag_ms", unit: "ms", samples: loop.lateness },
  ];
}

const scenario: Scenario = {
  id: "server.fanout",
  workload: null,
  processes: 5,
  run: measure,
};

export default scenario;
