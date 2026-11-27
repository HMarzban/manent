// Central-authority baseline over the fetched editing traces: ProseMirror collab replay time,
// JSON step log size, and offline rebase steps dropped on divergence.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TRACE_SOURCES, readTrace } from "../../corpus/traces.ts";
import type { Trace } from "../../corpus/traces.ts";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { measureOfflineDivergence, replayThroughAuthority } from "./replay.ts";

const TRACES_DIR = join(import.meta.dir, "../../corpus/traces");
const NOT_FETCHED =
  "the editing traces are not fetched: run bun run bench fetch-traces";
const QUICK_MAX_PATCHES = 200;

function fetchedTraceFiles(): { name: string; file: string }[] {
  return TRACE_SOURCES.flatMap(({ name }) => {
    const file = join(TRACES_DIR, `${name}.json.gz`);
    return existsSync(file) ? [{ name, file }] : [];
  });
}

const metricName = (trace: Trace): string => trace.name.replaceAll("-", "_");

function traceForMode(trace: Trace): Trace {
  if (benchMode() !== "quick" || trace.patches.length <= QUICK_MAX_PATCHES)
    return trace;
  return { ...trace, patches: trace.patches.slice(0, QUICK_MAX_PATCHES) };
}

async function measureTrace(trace: Trace): Promise<Measurement[]> {
  const effective = traceForMode(trace);
  let logBytes = 0;
  const ms = await sampleMs(() => {
    logBytes = replayThroughAuthority(effective).logBytes;
  });
  const { dropped } = measureOfflineDivergence(effective);
  const t = metricName(trace);
  return [
    measurement(`replay_ms_${t}`, "ms", [ms]),
    measurement(`log_bytes_${t}`, "bytes", [logBytes]),
    measurement(`offline_dropped_${t}`, "count", [dropped]),
  ];
}

const scenario: Scenario = {
  id: "crdt.authority",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const files = fetchedTraceFiles();
    if (files.length === 0) throw new NotMeasured(NOT_FETCHED);
    const measured: Measurement[] = [];
    for (const { name, file } of files) {
      const trace: Trace = { ...readTrace(readFileSync(file)), name };
      measured.push(...(await measureTrace(trace)));
    }
    return measured;
  },
};

export default scenario;
