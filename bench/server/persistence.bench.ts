// A typist's hour into SQLite: 14,400 single keystrokes, four a second on the service's clock, and
// what they add to the script's files once checkpointed. Beside it, in another project, a 3 MB
// script takes a keystroke at each step, so the checkpoint worker keeps writing its checkpoints
// while the serving thread commits: the longest commit seen meanwhile is the stall.
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkerCheckpointer } from "@manent/server-core";
import type {
  Checkpointer,
  Clock,
  Peer,
  SyncService,
} from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type { FakeClock } from "@manent/server-core/testing";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { openSqliteStorage } from "@manent/storage";
import type { DocFile, Home, Storage } from "@manent/storage";
import type { Measurement, Scenario } from "../harness.ts";
import {
  HOME,
  OWNER,
  createBenchPeer,
  createBenchService,
  createKeystrokes,
  docIdOf,
  firstBlockOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
} from "./support.ts";
import type { Keystrokes } from "./support.ts";

/** Four a second for an hour. */
const KEYSTROKES = 14_400;
const BETWEEN_KEYSTROKES_MS = 250;
const LARGE_HOME: Home = Object.freeze({
  kind: "project",
  id: "8e41c7b0-2d95-4a6f-b3e8-61f0a9d4c25e",
});
/** Corpus blocks whose script encodes to a little over 3 MB. */
const LARGE_BLOCKS = 12_000;
const LARGE_BYTES = 3_000_000;
/** The server program's own checkpoint worker, run as it runs it. */
const WORKER = new URL(
  "../../apps/server/src/checkpoint-worker.ts",
  import.meta.url,
);

/** Bytes of every file of `home` under `dir`. */
async function filesBytes(dir: string, home: Home): Promise<number> {
  const prefix = `${home.kind}-${home.id}.`;
  const names = (await readdir(dir)).filter((name) => name.startsWith(prefix));
  const sizes = await Promise.all(
    names.map(async (name) => (await stat(join(dir, name))).size),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

/** The storage with every transaction of every file timed, each wrapped once so it keeps its identity. */
function timingCommits(storage: Storage, timed: (ms: number) => void): Storage {
  const files = new Map<string, DocFile>();
  const open = (home: Home): DocFile => {
    const key = `${home.kind}:${home.id}`;
    const inner = storage.open(home);
    const file = files.get(key) ?? {
      ...inner,
      transaction<T>(fn: () => T): T {
        const startedAt = performance.now();
        const result = inner.transaction(fn);
        timed(performance.now() - startedAt);
        return result;
      },
    };
    files.set(key, file);
    return file;
  };
  return { directory: storage.directory, open, close: () => storage.close() };
}

/** The worker's checkpointer, telling whether a checkpoint of `docId` is unfinished. */
function watchingCheckpoints(
  inner: Checkpointer,
  docId: string,
): { checkpointer: Checkpointer; writing(): boolean } {
  let writing = false;
  return {
    checkpointer: {
      request(job) {
        inner.request(job);
        if (job.docId !== docId) return;
        writing = true;
        void inner.idle().then(() => {
          writing = false;
        });
      },
      idle: () => inner.idle(),
      close: () => inner.close(),
    },
    writing: () => writing,
  };
}

/** A typist of one script, and a promise per keystroke that resolves on its ACK. */
interface Typist {
  peer: Peer;
  keystrokes: Keystrokes;
  acked(): Promise<void>;
}

function createTypist(
  service: SyncService,
  script: { docId: string; state: Uint8Array; blockId: string },
  clientId: number,
): Typist {
  const keystrokes = createKeystrokes({ ...script, clientId });
  let waiting: { resolve(): void; reject(error: Error): void } | null = null;
  const peer = createBenchPeer(OWNER, (message) => {
    if (message.type === "ACK") waiting?.resolve();
    if (message.type === "ERROR")
      waiting?.reject(new Error(`a keystroke was refused: ${message.message}`));
  });
  joinAsEditor(service, peer, {
    docId: script.docId,
    clientId,
    vector: keystrokes.vector,
  });
  return {
    peer,
    keystrokes,
    acked: () =>
      new Promise((resolve, reject) => {
        waiting = { resolve, reject };
      }),
  };
}

function largeScript(): { state: Uint8Array; blockId: string } {
  const script = corpusDoc(generateBlocks("screenplay", LARGE_BLOCKS, 1));
  const state = stateOf(script);
  if (state.byteLength < LARGE_BYTES)
    throw new RangeError(
      `the large script encodes to ${state.byteLength} bytes, under ${LARGE_BYTES}`,
    );
  return { state, blockId: firstBlockOf(script) };
}

/** The typed script in HOME and the large one in LARGE_HOME, placed and closed again. */
function placeScripts(
  dir: string,
  clock: Clock,
): { docId: string; home: Home; state: Uint8Array; blockId: string }[] {
  const typed = scriptOfPages(1);
  const scripts = [
    {
      docId: docIdOf(0),
      home: HOME,
      state: stateOf(typed),
      blockId: firstBlockOf(typed),
    },
    { docId: docIdOf(1), home: LARGE_HOME, ...largeScript() },
  ];
  const storage = openSqliteStorage({ dir, now: Date.now });
  const placer = createBenchService({ storage, clock, defer: setImmediate });
  for (const script of scripts)
    placeScript(placer, storage, { ...script, editors: [] });
  storage.close();
  return scripts;
}

/** KEYSTROKES steps, each a keystroke by every typist answered before the clock moves on. */
async function typeAnHour(
  service: SyncService,
  typists: readonly Typist[],
  clock: FakeClock,
): Promise<void> {
  for (let n = 0; n < KEYSTROKES; n++) {
    const answered = typists.map((typist) => {
      const acked = typist.acked();
      service.receive(typist.peer, typist.keystrokes.next());
      return acked;
    });
    await Promise.all(answered);
    clock.advance(BETWEEN_KEYSTROKES_MS);
  }
}

async function measure(dir: string): Promise<Measurement[]> {
  const clock = fakeClock(1_000);
  const scripts = placeScripts(dir, clock.clock);
  const before = await filesBytes(dir, HOME);
  const watched = watchingCheckpoints(
    createWorkerCheckpointer({ entry: WORKER, data: { dir } }),
    docIdOf(1),
  );
  const stalls: number[] = [];
  const storage = timingCommits(
    openSqliteStorage({ dir, now: Date.now }),
    (ms) => {
      if (watched.writing()) stalls.push(ms);
    },
  );
  const service = createBenchService({
    storage,
    clock: clock.clock,
    defer: setImmediate,
    checkpointer: watched.checkpointer,
  });
  const typists = scripts.map((script, n) =>
    createTypist(service, script, n + 1),
  );
  await typeAnHour(service, typists, clock);
  await service.shutdown();
  storage.close();
  if (stalls.length === 0)
    throw new Error("no commit was seen while a checkpoint was being written");
  return [
    {
      metric: "growth_bytes_per_typist_hour",
      unit: "bytes",
      samples: [(await filesBytes(dir, HOME)) - before],
    },
    {
      metric: "checkpoint_stall_ms",
      unit: "ms",
      samples: [Math.max(...stalls)],
    },
  ];
}

const scenario: Scenario = {
  id: "server.persistence",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const dir = await mkdtemp(join(tmpdir(), "manent-persistence-"));
    try {
      return await measure(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export default scenario;
