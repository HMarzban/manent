// What loading each aged script costs, and one keystroke's write into it, for each session count
// the mode runs. The scripts are the ones crdt.aged measures, read from the corpus cache.
import { blockIds, loadDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement, sampleMs } from "../measure.ts";
import { agedScript, agedSessionCounts } from "./aged-sessions.bench.ts";
import type { AgedSessions } from "./aged-sessions.bench.ts";

/** Loads of each state in a process; quick mode keeps at most three samples of a metric. */
export const LOADS = { quick: 3, standard: 20, full: 20 } as const;
const WRITES = { quick: 3, standard: 200, full: 200 } as const;
/** Far above any aged script's client ids: the typist's. */
const TYPIST_CLIENT_ID = 900_000;

/** `times` samples of loading `state`, each document destroyed after it is timed. */
export async function loadTimes(
  state: Uint8Array,
  times: number,
): Promise<number[]> {
  const samples: number[] = [];
  for (let n = 0; n < times; n++) {
    const loaded: CrdtDoc[] = [];
    samples.push(
      await sampleMs(() => {
        loaded.push(loadDoc(state));
      }),
    );
    for (const doc of loaded) doc.destroy();
  }
  return samples;
}

/** Single characters typed at the start of the script's middle block, each one write. */
async function writeTimes(state: Uint8Array, times: number): Promise<number[]> {
  const doc = loadDoc(state, { clientId: TYPIST_CLIENT_ID });
  const ids = blockIds(doc);
  const id = ids[Math.floor(ids.length / 2)]!;
  const body = scriptBody(doc);
  const samples: number[] = [];
  for (let n = 0; n < times; n++)
    samples.push(
      await sampleMs(() => body.write((w) => w.insertText(id, 0, "x"))),
    );
  doc.destroy();
  return samples;
}

async function timesOf(sessions: AgedSessions): Promise<Measurement[]> {
  const doc = agedScript(sessions);
  const state = doc.encodeState();
  doc.destroy();
  const mode = benchMode();
  return [
    measurement(
      `load_ms_${sessions}`,
      "ms",
      await loadTimes(state, LOADS[mode]),
    ),
    measurement(
      `transaction_ms_${sessions}`,
      "ms",
      await writeTimes(state, WRITES[mode]),
    ),
  ];
}

const scenario: Scenario = {
  id: "crdt.aged-time",
  workload: "W1",
  processes: 5,
  async run(): Promise<Measurement[]> {
    const measured: Measurement[] = [];
    for (const sessions of agedSessionCounts())
      measured.push(...(await timesOf(sessions)));
    return measured;
  },
};

export default scenario;
