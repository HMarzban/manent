// A session on a 2,000-page script ends: the server makes its version and the version's summary
// on the serving thread, through the history service, from the end of the session to the room
// being told.
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { OWNER } from "../support.ts";
import {
  WRITER,
  createHistoryWorld,
  keyOf,
  spread,
} from "./restore-120.bench.ts";

/** Blocks a session types one character in. */
const SESSION_EDITS = 20;

async function versionTimes(samples: number): Promise<number[]> {
  const world = createHistoryWorld({
    script: corpusDoc(generateBlocks("screenplay", 45_000, 7)),
  });
  const { docId, history } = world;
  // the owner stays in the room to hear each version made; the first is the baseline of the next
  const owner = world.join(OWNER, 999);
  const saved = await history.save(OWNER, {
    docId,
    key: keyOf(0),
    kind: "saved",
  });
  if (!saved.ok) throw new Error(`the version was refused: ${saved.code}`);
  const edited = spread(world.blockIds, SESSION_EDITS);
  const times: number[] = [];
  for (let n = 1; n <= samples; n++) {
    const writer = world.join(WRITER, 1000 + n);
    await writer.type(edited);
    const told = owner.control();
    times.push(
      await sampleMs(async () => {
        writer.leave();
        await told;
      }),
    );
  }
  return times;
}

/** Sessions a process when not given: 8 outside quick mode, so five processes give the 40 a p95 is judged over. */
const SAMPLES = { quick: 5, standard: 8, full: 8 } as const;

/** `version_ms`: `samples` sessions (default by mode, SAMPLES) of 20 edits ended, each version made against the last. */
export function versionScenario(options: { samples?: number } = {}): Scenario {
  const { samples } = options;
  return {
    id: "history.version.2000",
    workload: "W7",
    processes: 5,
    run: async (): Promise<Measurement[]> => [
      {
        metric: "version_ms",
        unit: "ms",
        samples: await versionTimes(samples ?? SAMPLES[benchMode()]),
      },
    ],
  };
}

export default versionScenario();
