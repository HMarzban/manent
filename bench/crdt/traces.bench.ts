// The public editing traces replayed into a script document, one transaction a patch: how long each
// replay takes, how large its document ends against its text, and how many transactions it wrote.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { measureDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { TRACE_SOURCES, readTrace, replayTrace } from "../corpus/traces.ts";
import type { Trace } from "../corpus/traces.ts";
import { NotMeasured } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement, sampleMs } from "../measure.ts";

/** Where `bun run bench fetch-traces` keeps the traces it downloaded. */
const TRACES_DIR = join(import.meta.dir, "../corpus/traces");
const CLIENT_ID = 1;

/** Each locked trace that has been fetched, read and named. */
function fetchedTraces(): Trace[] {
  return TRACE_SOURCES.flatMap(({ name }) => {
    const file = join(TRACES_DIR, `${name}.json.gz`);
    if (!existsSync(file)) return [];
    return [{ ...readTrace(readFileSync(file)), name }];
  });
}

/** A trace's name as a metric names it: snake_case. */
const metricName = (trace: Trace): string => trace.name.replaceAll("-", "_");

async function replayed(trace: Trace): Promise<Measurement[]> {
  const replays: { doc: CrdtDoc; transactions: number }[] = [];
  const ms = await sampleMs(() => {
    replays.push(replayTrace(trace, { clientId: CLIENT_ID }));
  });
  const [replay] = replays;
  if (replay === undefined) throw new Error(`${trace.name} was not replayed`);
  const { doc, transactions } = replay;
  const { liveBytes, plainBytes } = measureDoc(doc);
  doc.destroy();
  const t = metricName(trace);
  return [
    measurement(`replay_ms_${t}`, "ms", [ms]),
    measurement(`bytes_ratio_${t}`, "count", [liveBytes / plainBytes]),
    measurement(`transactions_${t}`, "count", [transactions]),
  ];
}

const scenario: Scenario = {
  id: "crdt.traces",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const traces = fetchedTraces();
    if (traces.length === 0)
      throw new NotMeasured(
        "the editing traces are not fetched: run bun run bench fetch-traces",
      );
    const measured: Measurement[] = [];
    for (const trace of traces) measured.push(...(await replayed(trace)));
    return measured;
  },
};

export default scenario;
