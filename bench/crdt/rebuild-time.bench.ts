// What a rebuild of an aged script costs, what loading and typing into it cost before and after,
// and how long one device's offline edits take to merge into the rebuilt script.
import {
  ORIGIN_REPLAY,
  applyBlockOps,
  blockIds,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { mergeThrough } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { sampleMs } from "../measure.ts";
import { ageScript, editOffline, rebuildAged } from "./aged.ts";

const AGED = { pages: 120, sessions: 400, editsPerSession: 150, seed: 7 };
const REBUILDS = 20;
const LOADS = 20;
const KEYSTROKES = 200;
/** Replays a process: 40 outside quick mode, so five processes give the 200 a p99 is judged over. */
const REPLAYS = { quick: 20, standard: 40, full: 40 } as const;
const OFFLINE_EDITS = 50;
/** Far above the aged script's client ids: the typist's, and the first offline device's. */
const TYPIST_CLIENT_ID = 900_000;
const DEVICE_CLIENT_ID = 900_001;

/** `times` samples of making a document with `make`, each destroyed after it is timed. */
async function makingTimes(
  times: number,
  make: () => CrdtDoc,
): Promise<number[]> {
  const samples: number[] = [];
  for (let n = 0; n < times; n++) {
    const made: CrdtDoc[] = [];
    samples.push(
      await sampleMs(() => {
        made.push(make());
      }),
    );
    for (const doc of made) doc.destroy();
  }
  return samples;
}

const rebuildTimes = (aged: CrdtDoc): Promise<number[]> =>
  makingTimes(REBUILDS, () => rebuildAged(aged));

const loadTimes = (state: Uint8Array): Promise<number[]> =>
  makingTimes(LOADS, () => loadDoc(state));

/** Single characters typed at the start of the script's middle block, each one write. */
async function keystrokeTimes(state: Uint8Array): Promise<number[]> {
  const doc = loadDoc(state, { clientId: TYPIST_CLIENT_ID });
  const ids = blockIds(doc);
  const id = ids[Math.floor(ids.length / 2)]!;
  const body = scriptBody(doc);
  const times: number[] = [];
  for (let n = 0; n < KEYSTROKES; n++)
    times.push(
      await sampleMs(() => body.write((w) => w.insertText(id, 0, "x"))),
    );
  doc.destroy();
  return times;
}

function contentOf(state: Uint8Array): DocJSON {
  const doc = loadDoc(state);
  const content = scriptBody(doc).materialize();
  doc.destroy();
  return content;
}

/** What device `n` holds after OFFLINE_EDITS edits to the aged script while away. */
function offlineContent(agedState: Uint8Array, n: number): DocJSON {
  const device = loadDoc(agedState, { clientId: DEVICE_CLIENT_ID + n });
  editOffline(device, { edits: OFFLINE_EDITS, seed: n + 1 });
  const content = scriptBody(device).materialize();
  device.destroy();
  return content;
}

/** Each device's edits merged through the rebuild and written into a copy of the rebuilt script. */
async function replayTimes(
  agedState: Uint8Array,
  builtState: Uint8Array,
): Promise<number[]> {
  const base = contentOf(agedState);
  const theirs = [base, contentOf(builtState)];
  const times: number[] = [];
  for (let n = 0; n < REPLAYS[benchMode()]; n++) {
    const mine = offlineContent(agedState, n);
    const target = loadDoc(builtState);
    times.push(
      await sampleMs(() => {
        applyBlockOps(
          target,
          mergeThrough(base, mine, theirs).ops,
          ORIGIN_REPLAY,
        );
      }),
    );
    target.destroy();
  }
  return times;
}

const timing = (metric: string, samples: number[]): Measurement => ({
  metric,
  unit: "ms",
  samples,
});

const scenario: Scenario = {
  id: "crdt.rebuild-time",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const aged = ageScript(AGED);
    const agedState = aged.encodeState();
    const built = rebuildAged(aged);
    const builtState = built.encodeState();
    built.destroy();
    const rebuilds = await rebuildTimes(aged);
    aged.destroy();
    return [
      timing("rebuild_ms", rebuilds),
      timing("load_ms_before", await loadTimes(agedState)),
      timing("load_ms_after", await loadTimes(builtState)),
      timing("keystroke_ms_before", await keystrokeTimes(agedState)),
      timing("keystroke_ms_after", await keystrokeTimes(builtState)),
      timing("replay_ms", await replayTimes(agedState, builtState)),
    ];
  },
};

export default scenario;
