// The serving thread's share of the two jobs it runs inline on an aged 2,000-page script: one
// rebuild, from the quiet moment to the announcement, and one replay of a device's offline edits
// whose base is built from a long log after its checkpoint.
import { blockIds, loadDoc, scriptBody, updateMeta } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { Checkpointer, SyncService } from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type { FakeClock } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import { encodeReplayUpdates } from "@manent/sync-protocol";
import { ageScript, editOffline } from "../crdt/aged.ts";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { sampleMs } from "../measure.ts";
import {
  EMPTY_VECTOR,
  HOME,
  OWNER,
  createBenchPeer,
  createBenchService,
  docIdOf,
  joinAsEditor,
  placeScript,
} from "./support.ts";

const AGED = { pages: 2_000, sessions: 400, editsPerSession: 150, seed: 7 };
/** Samples a process: 40 outside quick mode, so five processes give the 200 a p99 is judged over. */
const SAMPLES = { quick: 5, standard: 40, full: 40 } as const;
/** Rows after the checkpoint, each one keystroke, spread over the script's first blocks. */
const LOG_ROWS = 100_000;
const TYPED_BLOCKS = 100;
const OFFLINE_EDITS = 50;
/** Far above the aged script's client ids: the typist's, the editor's, and the first device's. */
const TYPIST_CLIENT_ID = 900_000;
const EDITOR_CLIENT_ID = 900_001;
const DEVICE_CLIENT_ID = 900_002;
/** The server runs checkpoint jobs on a worker thread, so none is the serving thread's share. */
const OFF_THREAD: Checkpointer = Object.freeze({
  request() {},
  idle: async () => {},
  close: async () => {},
});

/** The aged script, and the keystrokes after it that the log holds. */
interface Script {
  state: Uint8Array;
  keystrokes: Uint8Array[];
  /** The state after the last keystroke, which a device that saw every row holds. */
  headState: Uint8Array;
}

/** LOG_ROWS single characters, one write each, by turns at the start of the script's first blocks. */
function typeInto(doc: CrdtDoc): Uint8Array[] {
  const ids = blockIds(doc).slice(0, TYPED_BLOCKS);
  const body = scriptBody(doc);
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  for (let n = 0; n < LOG_ROWS; n++)
    body.write((w) => w.insertText(ids[n % ids.length]!, 0, "x"));
  stop();
  return made;
}

function agedScript(): Script {
  const aged = ageScript(AGED);
  const state = aged.encodeState();
  aged.destroy();
  const typist = loadDoc(state, { clientId: TYPIST_CLIENT_ID });
  const keystrokes = typeInto(typist);
  const headState = typist.encodeState();
  typist.destroy();
  return { state, keystrokes, headState };
}

interface World {
  clock: FakeClock;
  service: SyncService;
  docId: string;
  headSeq: number;
}

/** The aged script as the import of row 1, checkpointed there, then one row per keystroke; one editor in its room. */
function createWorld(script: Script): World {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: clock.clock.now });
  const service = createBenchService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    checkpointer: OFF_THREAD,
  });
  const docId = docIdOf(0);
  placeScript(service, storage, {
    docId,
    home: HOME,
    state: script.state,
    editors: [],
  });
  const file = storage.open(HOME);
  file.checkpoints.put(docId, 1, 1, script.state);
  const headSeq = file.transaction(() => {
    let seq = 1;
    for (const update of script.keystrokes)
      seq = file.log.append({
        docId,
        generation: 1,
        update,
        userId: OWNER,
        origin: "edit",
        clocks: updateMeta(update).map(({ clientId, toClock }) => ({
          clientId,
          clock: toClock,
        })),
      });
    return seq;
  });
  joinAsEditor(
    service,
    createBenchPeer(OWNER, () => {}),
    {
      docId,
      clientId: EDITOR_CLIENT_ID,
      vector: EMPTY_VECTOR,
    },
  );
  return { clock, service, docId, headSeq };
}

/** From the moment the quiet timer fires to the end of the announcement. */
async function rebuildStall(world: World): Promise<number> {
  const { clock, service } = world;
  service.requestRebuild(world.docId);
  // anything else due before the quiet moment runs first, outside the measure
  clock.advance(DEFAULT_LIMITS.rebuildQuietMs - 1);
  const ms = await sampleMs(() => clock.advance(1));
  if (service.stats().rebuilds !== 1)
    throw new Error("the requested rebuild did not run");
  return ms;
}

/** Device `n`'s offline edits to the closed generation, as the waiting updates it would send. */
function offlineUpdates(script: Script, n: number): Uint8Array[] {
  const device = loadDoc(script.headState, { clientId: DEVICE_CLIENT_ID + n });
  const made: Uint8Array[] = [];
  device.subscribe((update) => made.push(update));
  editOffline(device, { edits: OFFLINE_EDITS, seed: n + 1 });
  device.destroy();
  return made;
}

/** One replay, from the request to its answer, its commit included. */
async function replayStall(
  world: World,
  updates: readonly Uint8Array[],
  n: number,
): Promise<number> {
  const body = {
    docId: world.docId,
    generation: 1,
    lastServerSeq: world.headSeq,
    key: n.toString(16).padStart(32, "0"),
    updates: encodeReplayUpdates(updates),
  };
  const answers: Awaited<ReturnType<SyncService["replay"]>>[] = [];
  const ms = await sampleMs(async () => {
    const answer = world.service.replay(OWNER, body);
    world.clock.runDeferred();
    answers.push(await answer);
  });
  const outcome = answers[0]!;
  if (!outcome.ok) throw new Error(`the replay was refused: ${outcome.code}`);
  return ms;
}

const scenario: Scenario = {
  id: "server.rebuild-stall",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const script = agedScript();
    const rebuilds: number[] = [];
    const replays: number[] = [];
    for (let n = 0; n < SAMPLES[benchMode()]; n++) {
      const world = createWorld(script);
      rebuilds.push(await rebuildStall(world));
      replays.push(await replayStall(world, offlineUpdates(script, n), n));
      await world.service.shutdown();
    }
    return [
      { metric: "rebuild_stall_ms", unit: "ms", samples: rebuilds },
      { metric: "replay_stall_ms", unit: "ms", samples: replays },
    ];
  },
};

export default scenario;
