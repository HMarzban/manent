// A 120-page script aged by 400 to 50,000 editing sessions: its size against its text, the client
// ids it holds and the bytes of its state vector, for each session count the mode runs.
import { measureDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { cached } from "../corpus/cache.ts";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";
import { ageScript } from "./aged.ts";

const PAGES = 120;
const SEED = 7;

const AGED_SESSIONS = [400, 2000, 10_000, 50_000] as const;
export type AgedSessions = (typeof AGED_SESSIONS)[number];

/** Each session's writes: long sessions while there are few, ever shorter as they multiply. */
const EDITS_PER_SESSION: Readonly<Record<AgedSessions, number>> = Object.freeze(
  { 400: 150, 2000: 30, 10_000: 5, 50_000: 5 },
);

/** How many of AGED_SESSIONS, from the first, each mode ages the script to. */
const COUNTS_BY_MODE = { quick: 1, standard: 3, full: 4 } as const;

/** The session counts this run's mode ages the script to, fewest first. */
export function agedSessionCounts(): readonly AgedSessions[] {
  return AGED_SESSIONS.slice(0, COUNTS_BY_MODE[benchMode()]);
}

/** The script aged by `sessions` sessions, built once and then read from the corpus cache. */
export function agedScript(sessions: AgedSessions): CrdtDoc {
  const editsPerSession = EDITS_PER_SESSION[sessions];
  return cached(`aged-${PAGES}-${sessions}-${editsPerSession}-s${SEED}`, () =>
    ageScript({ pages: PAGES, sessions, editsPerSession, seed: SEED }),
  );
}

function sizeOf(sessions: AgedSessions): Measurement[] {
  const doc = agedScript(sessions);
  const { liveBytes, plainBytes, clientIds } = measureDoc(doc);
  const vectorBytes = doc.encodeStateVector().byteLength;
  doc.destroy();
  return [
    measurement(`bytes_ratio_${sessions}`, "count", [liveBytes / plainBytes]),
    measurement(`client_ids_${sessions}`, "count", [clientIds]),
    measurement(`state_vector_bytes_${sessions}`, "bytes", [vectorBytes]),
  ];
}

const scenario: Scenario = {
  id: "crdt.aged",
  workload: "W1",
  processes: 1,
  async run(): Promise<Measurement[]> {
    return agedSessionCounts().flatMap(sizeOf);
  },
};

export default scenario;
