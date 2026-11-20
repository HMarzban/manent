// How large two aged scripts are against their text, and how many client ids they hold, before and
// after a rebuild: one aged by a few long sessions, one by very many short ones.
import { measureDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Measurement, Scenario } from "../harness.ts";
import { ageScript, rebuildAged } from "./aged.ts";

const LONG_SESSIONS = {
  pages: 120,
  sessions: 400,
  editsPerSession: 150,
  seed: 7,
};
const SHORT_SESSIONS = {
  pages: 120,
  sessions: 12_000,
  editsPerSession: 5,
  seed: 7,
};

interface Sized {
  bytesRatio: number;
  clientIds: number;
}

function sized(doc: CrdtDoc): Sized {
  const { liveBytes, plainBytes, clientIds } = measureDoc(doc);
  return { bytesRatio: liveBytes / plainBytes, clientIds };
}

/** The aged script's size, and that of the script rebuilt from it. */
function beforeAndAfter(options: Parameters<typeof ageScript>[0]): {
  before: Sized;
  after: Sized;
} {
  const aged = ageScript(options);
  const built = rebuildAged(aged);
  const before = sized(aged);
  const after = sized(built);
  aged.destroy();
  built.destroy();
  return { before, after };
}

const count = (metric: string, value: number): Measurement => ({
  metric,
  unit: "count",
  samples: [value],
});

const scenario: Scenario = {
  id: "crdt.rebuild-size",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const long = beforeAndAfter(LONG_SESSIONS);
    const short = beforeAndAfter(SHORT_SESSIONS);
    return [
      count("bytes_ratio_before", long.before.bytesRatio),
      count("client_ids_before", long.before.clientIds),
      count("bytes_ratio_before_12k", short.before.bytesRatio),
      count("client_ids_before_12k", short.before.clientIds),
      count(
        "bytes_ratio_after",
        Math.max(long.after.bytesRatio, short.after.bytesRatio),
      ),
      count(
        "client_ids_after",
        Math.max(long.after.clientIds, short.after.clientIds),
      ),
    ];
  },
};

export default scenario;
