// Comparing two versions of a 120-page script that are 400 edits apart, as the History tab does.
import { canonicalBlocksOf, compareDocs, textOf } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { scriptOfPages } from "../../server/support.ts";

const EDITS = 400;

/**
 * `script` after `edits` edits spread evenly through it, one block each: by turns a word typed in
 * the middle of a block, a block added after it, and the block deleted.
 */
export function editedScript(script: DocJSON, edits: number): DocJSON {
  const blocks = canonicalBlocksOf(script);
  const stride = blocks.length / edits;
  // from the end, so each edit leaves the places of the ones still to come
  for (let k = edits - 1; k >= 0; k--) {
    const at = Math.floor(k * stride);
    const block = blocks[at]!;
    if (k % 3 === 0) {
      const text = textOf(block);
      const middle = Math.floor(text.length / 2);
      const typed = `${text.slice(0, middle)} again${text.slice(middle)}`;
      blocks[at] = { ...block, content: [{ type: "text", text: typed }] };
    } else if (k % 3 === 1) {
      const attrs = { id: `added-${k}`, type: "action" };
      const text = "The gulls go quiet.";
      blocks.splice(at + 1, 0, {
        type: "block",
        attrs,
        content: [{ type: "text", text }],
      });
    } else blocks.splice(at, 1);
  }
  return { type: "doc", content: [{ type: "section", content: blocks }] };
}

/** `compare_ms`: `samples` comparisons (default 20) of a 120-page script with itself 400 edits later. */
export function compareScenario(options: { samples?: number } = {}): Scenario {
  const { samples = 20 } = options;
  return {
    id: "history.compare.120",
    workload: "W1",
    processes: 5,
    async run(): Promise<Measurement[]> {
      const older = scriptOfPages(120);
      const newer = editedScript(older, EDITS);
      const times: number[] = [];
      for (let n = 0; n < samples; n++)
        times.push(
          await sampleMs(() => {
            compareDocs(older, newer);
          }),
        );
      return [{ metric: "compare_ms", unit: "ms", samples: times }];
    },
  };
}

export default compareScenario();
