// The engine's benchmark: a cold pass over a whole script, then keystrokes near its start, middle and end.
import { paginate, profileFor, repaginate } from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import type { Measurement, Scenario } from "../../harness.ts";
import { sampleMs } from "../../measure.ts";
import { scriptOfPages } from "./script.ts";

/** Where in the script the keystrokes land, as fractions of its blocks. */
const KEYSTROKE_AT = [0.05, 0.5, 0.95] as const;

// Keystroke k at block i: by turns a character typed at its end, its last character deleted, and
// Enter pressed in its middle, which splits it in two and shifts every later block's index.
function keystroke(
  blocks: readonly LayoutBlock[],
  i: number,
  k: number,
): LayoutBlock[] {
  const block = blocks[i]!;
  const { text } = block;
  if (k % 3 === 0)
    return blocks.with(i, Object.freeze({ ...block, text: `${text}e` }));
  if (k % 3 === 1)
    return blocks.with(i, Object.freeze({ ...block, text: text.slice(0, -1) }));
  const at = Math.ceil(text.length / 2);
  return blocks.toSpliced(
    i,
    1,
    Object.freeze({ ...block, text: text.slice(0, at) }),
    Object.freeze({ ...block, id: `${block.id}-tail`, text: text.slice(at) }),
  );
}

async function measure(
  pages: number,
  coldSamples: number,
  keystrokeSamples: number,
): Promise<Measurement[]> {
  const blocks = scriptOfPages(pages);
  const profile = profileFor("screenplay")!;
  const cold: number[] = [];
  for (let n = 0; n < coldSamples; n++) {
    const copy = blocks.map((block) => Object.freeze({ ...block }));
    cold.push(
      await sampleMs(() => {
        paginate(copy, profile);
      }),
    );
  }
  const settled = paginate(blocks, profile);
  const keystrokes: number[] = [];
  for (const at of KEYSTROKE_AT) {
    const i = Math.floor(blocks.length * at);
    for (let k = 0; k < keystrokeSamples; k++) {
      const edited = keystroke(blocks, i, k);
      keystrokes.push(
        await sampleMs(() => {
          repaginate(settled, edited);
        }),
      );
    }
  }
  return [
    { metric: "cold_repagination", unit: "ms", samples: cold },
    { metric: "keystroke_engine", unit: "ms", samples: keystrokes },
    { metric: "pages", unit: "count", samples: [settled.pages.length] },
  ];
}

/**
 * The engine at a script of `pages` pages: `cold_repagination` paginates fresh layout blocks of the
 * whole script `coldSamples` times (default 20); `keystroke_engine` repaginates after one keystroke,
 * `keystrokeSamples` times (default 200) at each of 5 %, 50 % and 95 % of the script; `pages` is the
 * page count. Each sample starts from the settled pages of the unedited script.
 */
export function engineScenario(options: {
  pages: number;
  workload: Scenario["workload"];
  coldSamples?: number;
  keystrokeSamples?: number;
}): Scenario {
  const { pages, workload, coldSamples = 20, keystrokeSamples = 200 } = options;
  return {
    id: `pagination-engine-${pages}`,
    workload,
    processes: 5,
    run: () => measure(pages, coldSamples, keystrokeSamples),
  };
}
