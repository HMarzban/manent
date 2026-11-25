// Replays the public editing traces into an Automerge list of text strings, one change per patch.
import * as Automerge from "@automerge/automerge";
import type { Trace } from "../../corpus/traces.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import {
  applyLinePatch,
  plainTextBytes,
  runTraceAlternative,
} from "./shared.ts";
import type { AlternativeReplay } from "./shared.ts";

type LineDoc = {
  lines: string[];
};

/** Replays `trace` into an Automerge document holding one text entry per line, one change per patch. */
export function replayInAutomerge(trace: Trace): AlternativeReplay {
  const lines = trace.startContent.split("\n");
  let doc = Automerge.from<LineDoc>({ lines: [...lines] });

  for (const patch of trace.patches) {
    doc = Automerge.change(doc, (draft) => {
      applyLinePatch(lines, patch, {
        deleteText: (index, offset, count) =>
          Automerge.splice(draft, ["lines", index], offset, count),
        insertText: (index, offset, str) =>
          Automerge.splice(draft, ["lines", index], offset, 0, str),
        deleteLine(index) {
          draft.lines.splice(index, 1);
        },
        insertLines(afterIndex, added) {
          draft.lines.splice(afterIndex + 1, 0, ...added);
        },
      });
    });
  }

  const liveBytes = Automerge.save(doc).byteLength;
  const text = doc.lines.join("\n");
  const plainBytes = plainTextBytes(lines);
  return { text, liveBytes, plainBytes };
}

const scenario: Scenario = {
  id: "crdt.automerge",
  workload: null,
  processes: 5,
  run(): Promise<Measurement[]> {
    return runTraceAlternative(replayInAutomerge);
  },
};

export default scenario;
