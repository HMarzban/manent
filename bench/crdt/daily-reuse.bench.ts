// A daily document reused for 60 show days against a new document each day: how large each is
// against its text, and how many client ids the reused one gathers.
import { measureDoc, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { cached } from "../corpus/cache.ts";
import { reuseDaily } from "../corpus/daily.ts";
import { documentOfPages } from "../corpus/documents.ts";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";
import { ageSession } from "./aged.ts";

export const DAILY = Object.freeze({
  pages: 30,
  days: 60,
  sessionsPerDay: 12,
  editsPerSession: 40,
  seed: 3,
});

/** Fresh documents measured; quick mode keeps at most three samples of a metric. */
const FRESH_DAYS = {
  quick: 3,
  standard: DAILY.days,
  full: DAILY.days,
} as const;

/** The document reused for every day, built once and then read from the corpus cache. */
export function reusedDaily(): CrdtDoc {
  const { pages, days, sessionsPerDay, editsPerSession, seed } = DAILY;
  return cached(
    `daily-reuse-${pages}-${days}-${sessionsPerDay}-${editsPerSession}-s${seed}`,
    () => reuseDaily(DAILY),
  );
}

/**
 * Day `day`'s script (from 1), the one the reused document holds that day, in a document of its
 * own: written by client id 1, then the day's sessions under client ids 2, 3, 4, ….
 */
export function freshDaily(day: number): CrdtDoc {
  const seed = DAILY.seed + day - 1;
  const script = documentOfPages({
    format: "screenplay",
    pages: DAILY.pages,
    seed,
    sections: "even",
  }).doc;
  const random = createRng(seed).next;
  let doc = scriptDocFromJSON(script, { clientId: 1 });
  for (let session = 1; session <= DAILY.sessionsPerDay; session++) {
    const next = ageSession(doc, {
      clientId: 1 + session,
      edits: DAILY.editsPerSession,
      random,
    });
    doc.destroy();
    doc = next;
  }
  return doc;
}

function bytesRatio(doc: CrdtDoc): number {
  const { liveBytes, plainBytes } = measureDoc(doc);
  return liveBytes / plainBytes;
}

const scenario: Scenario = {
  id: "crdt.daily-reuse",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const reused = reusedDaily();
    const ratioReused = bytesRatio(reused);
    const { clientIds } = measureDoc(reused);
    reused.destroy();
    const ratiosFresh = Array.from(
      { length: FRESH_DAYS[benchMode()] },
      (_, n) => {
        const fresh = freshDaily(n + 1);
        const ratio = bytesRatio(fresh);
        fresh.destroy();
        return ratio;
      },
    );
    return [
      measurement("bytes_ratio_reused", "count", [ratioReused]),
      measurement("bytes_ratio_fresh", "count", ratiosFresh),
      measurement("client_ids_reused", "count", [clientIds]),
    ];
  },
};

export default scenario;
