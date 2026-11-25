// Replays the public editing traces into a Loro list of LoroText lines, one commit per patch.
import { LoroDoc, LoroText } from "loro-crdt";
import type { Trace } from "../../corpus/traces.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import {
  applyLinePatch,
  plainTextBytes,
  runTraceAlternative,
} from "./shared.ts";
import type { AlternativeReplay } from "./shared.ts";

/** Replays `trace` into a LoroDoc list of LoroText containers, committing once per patch. */
export function replayInLoro(trace: Trace): AlternativeReplay {
  const doc = new LoroDoc();
  const list = doc.getList("lines");
  const lines = trace.startContent.split("\n");
  const texts: LoroText[] = lines.map((line, i) => {
    const text = list.insertContainer(i, new LoroText());
    if (line !== "") text.insert(0, line);
    return text;
  });
  doc.commit();

  for (const patch of trace.patches) {
    applyLinePatch(lines, patch, {
      deleteText: (index, offset, count) => texts[index]!.delete(offset, count),
      insertText: (index, offset, str) => texts[index]!.insert(offset, str),
      deleteLine(index) {
        list.delete(index, 1);
        texts.splice(index, 1);
      },
      insertLines(afterIndex, added) {
        const created = added.map((str, i) => {
          const text = list.insertContainer(afterIndex + 1 + i, new LoroText());
          if (str !== "") text.insert(0, str);
          return text;
        });
        texts.splice(afterIndex + 1, 0, ...created);
      },
    });
    doc.commit();
  }

  const liveBytes = doc.export({ mode: "snapshot" }).byteLength;
  const text = texts.map((entry) => entry.toString()).join("\n");
  const plainBytes = plainTextBytes(lines);
  doc.free();
  return { text, liveBytes, plainBytes };
}

const scenario: Scenario = {
  id: "crdt.loro",
  workload: null,
  processes: 5,
  run(): Promise<Measurement[]> {
    return runTraceAlternative(replayInLoro);
  },
};

export default scenario;
