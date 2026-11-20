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
import type { Measurement, Scenario } from "../harness.ts";
import { ageScript, editOffline, rebuildAged } from "./aged.ts";

const AGED = { pages: 120, sessions: 400, editsPerSession: 150, seed: 7 };
const REBUILDS = 20;
const LOADS = 20;
const KEYSTROKES = 200;
const REPLAYS = 20;
const OFFLINE_EDITS = 50;
/** Far above the aged script's client ids: the typist's, and the first offline device's. */
const TYPIST_CLIENT_ID = 900_000;
const DEVICE_CLIENT_ID = 900_001;

/** How long `run` took, in milliseconds, and what it answered. */
function timed<T>(run: () => T): { ms: number; value: T } {
  const startedAt = performance.now();
  const value = run();
  return { ms: performance.now() - startedAt, value };
}

function rebuildTimes(aged: CrdtDoc): number[] {
  return Array.from({ length: REBUILDS }, () => {
    const { ms, value } = timed(() => rebuildAged(aged));
    value.destroy();
    return ms;
  });
}

function loadTimes(state: Uint8Array): number[] {
  return Array.from({ length: LOADS }, () => {
    const { ms, value } = timed(() => loadDoc(state));
    value.destroy();
    return ms;
  });
}

/** Single characters typed at the start of the script's middle block, each one write. */
function keystrokeTimes(state: Uint8Array): number[] {
  const doc = loadDoc(state, { clientId: TYPIST_CLIENT_ID });
  const ids = blockIds(doc);
  const id = ids[Math.floor(ids.length / 2)]!;
  const body = scriptBody(doc);
  const times = Array.from(
    { length: KEYSTROKES },
    () => timed(() => body.write((w) => w.insertText(id, 0, "x"))).ms,
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
function replayTimes(agedState: Uint8Array, builtState: Uint8Array): number[] {
  const base = contentOf(agedState);
  const theirs = [base, contentOf(builtState)];
  return Array.from({ length: REPLAYS }, (_, n) => {
    const mine = offlineContent(agedState, n);
    const target = loadDoc(builtState);
    const { ms } = timed(() =>
      applyBlockOps(
        target,
        mergeThrough(base, mine, theirs).ops,
        ORIGIN_REPLAY,
      ),
    );
    target.destroy();
    return ms;
  });
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
    const rebuilds = rebuildTimes(aged);
    aged.destroy();
    return [
      timing("rebuild_ms", rebuilds),
      timing("load_ms_before", loadTimes(agedState)),
      timing("load_ms_after", loadTimes(builtState)),
      timing("keystroke_ms_before", keystrokeTimes(agedState)),
      timing("keystroke_ms_after", keystrokeTimes(builtState)),
      timing("replay_ms", replayTimes(agedState, builtState)),
    ];
  },
};

export default scenario;
